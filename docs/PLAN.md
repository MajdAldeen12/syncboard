# SyncBoard build plan

## Context

SyncBoard is a real-time collaborative kanban web app: a free public tool and a portfolio piece, so visual polish and engineering depth both count. This plan fixes the architecture, data model, milestones and risks before any application code is written. Work may continue from another Claude account, so `CLAUDE.md` and a copy of this plan live in the repo and are kept current.

## Decisions

Confirmed with you:

| Topic       | Decision                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Sync server | `y-partyserver` (PartyKit's successor) on Cloudflare Workers + Durable Objects, free plan              |
| Demo board  | One shared public board that auto-resets to seed content                                               |
| Offline     | Open tab keeps working, edits cached in IndexedDB, merge on reconnect or next visit. No service worker |
| Card text   | Plain text, live-merged with `Y.Text` (title and description)                                          |

Defaults I chose (tell me if any is wrong):

- **Repo:** pnpm workspaces monorepo: `apps/web`, `apps/sync`, `packages/core`, `packages/db`.
- **Versions:** latest stable at scaffold time, pinned by the lockfile. Next.js 16.x is the current Active LTS.
- **Motion:** "Framer Motion" is now published as `motion` (import from `motion/react`); that is the package used.
- **dnd-kit:** `@dnd-kit/react` (the current recommended package; `@dnd-kit/core` + sortable are labelled legacy). It is pre-1.0, so milestone 1 opens with a short spike and falls back to the legacy packages if keyboard support or stability falls short.
- **Auth methods:** GitHub OAuth + email magic link.
- **Share links:** require sign-in; only the demo board is anonymous.
- **Dev database:** a second hosted Supabase project for development (no Docker on Windows).
- **Licence:** MIT, public GitHub repo.

## Architecture

```
Browser (Next.js client)
  │  HTTPS: pages, server actions, POST /api/boards/:id/sync-ticket
  ▼
apps/web  Next.js on Vercel ──── Drizzle (pooler, prepare:false) ───┐
  │  signs short-lived ticket (Ed25519 private key)                 ▼
  │                                                       Supabase Postgres + Auth
Browser ── WSS /parties/board/:boardId?ticket=… ──┐                 ▲
  ▼                                               ▼                 │
IndexedDB (y-indexeddb)            apps/sync  Cloudflare Worker     │
                                     └─ Durable Object per board ───┘
                                        (y-partyserver YServer)   load/save Yjs snapshot
```

- **apps/web** owns everything about identity and permission: sessions, board CRUD, membership, share links, and minting sync tickets. It never proxies WebSocket traffic.
- **apps/sync** is deliberately dumb: it verifies a ticket, relays Yjs sync and awareness, enforces read-only, and persists snapshots. It makes no membership queries.
- **Supabase** is the system of record: relational metadata plus one Yjs snapshot row per board. Cards and columns live only inside the Yjs document.

### How a connection is authorized

1. The board page (server component) reads the Supabase session from cookies, verifies the JWT against the project's JWKS, and resolves the user's role with `requireBoardAccess(boardId, "board:read")`. No access returns 404.
2. The client calls `POST /api/boards/:id/sync-ticket`. The server repeats the access check and signs a ticket (EdDSA, `jose`) with claims `{ sub, board, gen, role, name, color, exp: now+60s }`.
3. The Yjs provider opens the WebSocket with the ticket as a query parameter. `params` is a function, so every reconnect fetches a fresh ticket.
4. The Worker's `onBeforeConnect` checks the `Origin` allowlist, the signature (public key only), the expiry, and that `board` equals the room name. Failure returns 401/403 before the Durable Object is touched.
5. The Durable Object stores `{ userId, role }` on the connection. `isReadOnly(connection)` returns true for viewers, so the server drops their document updates regardless of what the client sends. Viewers may still send awareness (cursor, presence).
6. **Revocation:** tickets are short-lived, and the room closes any connection older than 30 minutes so it must re-ticket. When a role changes or a member is removed, the server action calls an admin endpoint on the room (signed with the same key, `role: "system"`) to close that user's connections immediately.
7. **Guests:** `POST /api/demo/ticket` issues an editor ticket valid only for the demo board, with a random guest id (signed httpOnly cookie), name and colour.

The sync server holds only the public key, so a compromised sync server cannot mint tickets.

### Yjs document model (`packages/core/src/board-doc`)

```
meta    : Y.Map { schemaVersion: 1, title: string }
columns : Y.Map<columnId, Y.Map { title: Y.Text, order: string }>
cards   : Y.Map<cardId,  Y.Map { columnId, order, title: Y.Text, description: Y.Text,
                                 createdBy, createdAt }>
```

- **Moves never duplicate.** A move sets `columnId` and `order` in one transaction (last writer wins per key). Both keys are written on every move, even within one column, so the same writer wins both and a card never ends up in one person's column at another's position. Ordering uses jittered fractional-index keys with card id as the tie-break. Array delete-and-insert is avoided because concurrent moves would duplicate cards.
- **Orphans are handled in the view.** Deleting a column deletes the cards shown in it in the same transaction. A card that arrives later pointing at a deleted column is re-homed to the first column by a pure `normalizeBoard()` selector; nothing is written back. Moving such a card writes its column again.
- **Titles are `Y.Text`, for columns as well as cards** (changed in M2; the first draft had column titles as plain strings). They are edited live through a text session, so two people typing in one title both keep their words.
- **Starting content is one deterministic update.** `encodeBoardState()` writes a board under a fixed client id with sorted ids, so every client that applies it holds identical Yjs structs and later syncs merge instead of duplicating the starting cards.
- **Document generation.** `boards.doc_generation` identifies the current document. IndexedDB is keyed `board:<id>:<gen>`, and the ticket carries `gen`. Resetting the demo board bumps the generation and writes a fresh seed snapshot, so stale local copies are discarded instead of merged back in.
- **Board title** lives in `meta.title`; the sync server copies it to `boards.title` when it saves, for the dashboard list.

### Persistence and offline

- Every board gets its snapshot row at creation (the server action builds the seed doc with `packages/core`). A missing row means the board does not exist.
- `onLoad` reads the snapshot. If the read fails (for example Supabase is paused), the room rejects connections with a "storage unavailable" close code. It never serves an empty document and never saves after a failed load.
- `onSave` upserts the snapshot and `boards.title`, debounced (2 s, max 10 s) and when the room empties.
- The client keeps the doc in IndexedDB, shows a connection status (synced, syncing, offline with local changes), and reconnects with backoff.
- Both Vercel functions and the Worker use the Supabase shared pooler in transaction mode with `prepare: false`. Migrations use the direct connection string.

### Demo board safeguards

Caps enforced in the Durable Object: maximum concurrent connections, maximum document size, maximum message size, and a per-connection update rate. The board resets by generation bump when it has been empty for a while, and at most every 24 hours with a 60-second warning broadcast. Text renders as plain text only.

## Folder structure

```
SyncBoard/
├─ CLAUDE.md                     project state for any Claude session
├─ README.md
├─ docs/PLAN.md                  copy of this plan, kept current
├─ docs/decisions/               short decision records
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json
│                                (each package has its own eslint.config.mjs)
├─ .env.example
├─ .github/workflows/ci.yml      lint, typecheck, test, build
├─ apps/
│  ├─ web/                       Next.js (App Router)
│  │  ├─ src/app/
│  │  │  ├─ (marketing)/         landing page, GSAP only
│  │  │  ├─ (app)/boards/        dashboard
│  │  │  ├─ (app)/b/[boardId]/   board
│  │  │  ├─ (app)/demo/          public demo board
│  │  │  ├─ (auth)/login/, auth/callback/route.ts
│  │  │  ├─ join/[token]/        share-link redemption
│  │  │  └─ api/boards/[boardId]/sync-ticket/, api/demo/ticket/, api/health/
│  │  ├─ src/features/           board/, presence/, sharing/, landing/
│  │  ├─ src/server/             server-only: session, requireBoardAccess, actions
│  │  ├─ src/lib/                provider factory, IndexedDB, hooks
│  │  ├─ src/components/ui/
│  │  └─ e2e/                    Playwright
│  └─ sync/                      Cloudflare Worker
│     ├─ src/index.ts            routing + onBeforeConnect (ticket check)
│     ├─ src/board-room.ts       YServer subclass: onLoad, onSave, isReadOnly
│     ├─ src/snapshot-store.ts, src/limits.ts, src/demo-reset.ts
│     └─ wrangler.jsonc
└─ packages/
   ├─ core/                      pure TypeScript, no React/Next/Workers imports
   │  └─ src/ board-doc/  permissions/  ticket/  presence/  text-binding/
   └─ db/                        Drizzle schema, client factory, queries
      ├─ src/schema.ts, src/client.ts, src/queries/
      └─ drizzle/                generated SQL migrations (committed)
```

`packages/core` is where the Yjs logic and permission logic live as small modules with Vitest tests. Both `apps/web` and `apps/sync` import it.

## Data model (Drizzle schema)

```ts
// packages/db/src/schema.ts (design sketch)
const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });
export const boardRole = pgEnum("board_role", ["owner", "editor", "viewer"]);

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  color: text("color").notNull(), // presence colour
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(), // mirror of Yjs meta.title
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  isDemo: boolean("is_demo").notNull().default(false),
  docGeneration: integer("doc_generation").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export const boardMembers = pgTable(
  "board_members",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: boardRole("role").notNull(),
    viaLinkId: uuid("via_link_id").references(() => shareLinks.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.userId] }),
    index("board_members_user_idx").on(t.userId),
    uniqueIndex("board_one_owner_idx")
      .on(t.boardId)
      .where(sql`${t.role} = 'owner'`),
  ],
).enableRLS();

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    role: boardRole("role").notNull(), // editor or viewer only
    tokenHash: text("token_hash").notNull().unique(), // SHA-256; raw token shown once
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("share_links_role_check", sql`${t.role} <> 'owner'`),
    index("share_links_board_idx").on(t.boardId),
  ],
).enableRLS();

export const boardSnapshots = pgTable("board_snapshots", {
  boardId: uuid("board_id")
    .primaryKey()
    .references(() => boards.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  state: bytea("state").notNull(), // Y.encodeStateAsUpdate(doc)
  sizeBytes: integer("size_bytes").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();
```

- **Membership rows are the only source of access.** The owner has a member row; a partial unique index allows exactly one owner per board.
- **RLS is enabled on every table with no policies.** Drizzle connects as a privileged role and bypasses it, and roles are enforced in `packages/core/permissions` plus `requireBoardAccess`. Deny-all RLS stops the public Supabase Data API key from reading these tables.
- **Permission API:** `can(role, action)` over actions `board:read | board:edit | board:delete | members:manage | links:manage`. Every server action and route handler calls `requireBoardAccess` first.

## Milestones

Each milestone ends with `CLAUDE.md` status updated and a commit.

**M0. Foundations.** Git repo, pnpm workspace, Next.js scaffold, `packages/core` skeleton, strict TypeScript, ESLint (including the Motion/GSAP import boundary), Vitest, GitHub Actions CI, `CLAUDE.md`, `docs/PLAN.md`, `.env.example`.
Done when: `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally and in CI on the first push.

**M1. Static board with drag and drop.** Columns and cards, add/rename/delete, inline editing, local state behind a `BoardStore` interface that Yjs will implement next. dnd-kit spike first.
Done when: cards move within and across columns and columns reorder by mouse, touch and keyboard; ordering functions have unit tests; one Playwright test performs a drag.

**M2. State in Yjs, two tabs in sync.** `board-doc` module (schema, mutations, selectors, `normalizeBoard`), `useBoard` via `useSyncExternalStore`, a small BroadcastChannel provider.
Done when: two tabs mirror each other instantly; convergence tests pass (random operations on three docs, synced in random order, end equal with no duplicate cards and every card in exactly one column); concurrent move/move, move/delete and edit/edit cases are covered.

**M3. Sync server and Supabase persistence.** Starts with a spike on Durable Object hibernation and Postgres access from the Worker. Then `apps/sync`, `packages/db` with the first migration, `onLoad`/`onSave`, `y-indexeddb`, connection status UI. The sync server is not deployed publicly until M5.
Done when: two different browsers sync through `wrangler dev`; restarting the sync server restores the board from Supabase; going offline in both browsers, editing, and reconnecting merges cleanly; a failed snapshot load rejects connections instead of serving an empty board (tested).

**M4. Presence and cursors.** Awareness state (user, cursor in board coordinates, editing, dragging), avatar stack, live cursors, "X is editing this card".
Done when: two browsers see each other's cursors move smoothly; avatars appear and disappear on join and leave; the editing badge shows on the focused card; cursor traffic is throttled to about 15 messages per second and stops when idle.

**M5. Auth, sharing, permissions.** Supabase Auth, profiles, dashboard, members, share links, `permissions` module, sync tickets, `isReadOnly`, revocation, guest tickets, demo caps and reset, deny-all RLS.
Done when: the owner/editor/viewer/non-member/anonymous matrix passes in unit and integration tests; a raw WebSocket client with a viewer ticket cannot change the document; expired and wrong-board tickets are rejected; removing a member closes their connection; a Data API request with the public key returns no rows.

**M6. Motion polish in the app.** Layout animation on reorder, drag overlay lift and drop, card modal transitions, presence avatar enter/exit, page transitions, reduced-motion support. Stretch: undo/redo with `Y.UndoManager`.
Done when: remote reorders animate without jumps; dragging on a 200-card board holds 60 fps in a Chrome trace; `prefers-reduced-motion` removes non-essential motion.

**M7. GSAP landing page.** Hero timeline and scroll-driven sections with `useGSAP` (scoped, cleaned up) and `gsap.matchMedia`. The hero uses a GSAP-animated illustration, not the real board component, so the two libraries never touch the same element.
Done when: the lint rule proves no `motion` import under `(marketing)` or `features/landing` and no `gsap` import elsewhere; mobile Lighthouse performance is 90 or higher; no layout shift from pinned sections; reduced motion renders static.

**M8. Design pass, accessibility, performance.** Impeccable critique and polish, focus management, drag announcements for screen readers, AA contrast, axe checks in Playwright, bundle check (GSAP only in the landing chunk, Yjs only in the app chunk).
Done when: axe reports no serious or critical issues; a keyboard-only walkthrough (create, move across columns, edit, share) succeeds; Lighthouse accessibility is 95 or higher; a 500-card board stays responsive.

**M9. Demo GIF, README, deploy.** Vercel, Cloudflare, production Supabase, keep-alive cron, README with architecture, local setup and the free-tier pause note, recorded GIF.
Done when: the production demo board opens in a private window with no signup; two devices sync in production; CI is green on `main`; the README contains the GIF and the pause note.

## Risks and open questions

**Risks, with the mitigation planned:**

1. **Cloudflare free limits.** 100,000 Durable Object requests a day (incoming WebSocket messages count 20:1) and 13,000 GB-s of duration a day, which is roughly 28 hours of one awake object. Hibernation is therefore required and cursor traffic must be throttled. The M3 spike confirms `hibernate: true` works with `y-partyserver` and that pending saves complete before hibernation. If a limit is hit, operations fail until 00:00 UTC and the app falls back to its offline mode.
2. **`y-partyserver` maturity.** The repo calls itself a work in progress and the README lists read-only as a to-do, although `isReadOnly` exists in the source. Pin the version, keep it behind `board-room.ts`, and cover read-only with an integration test. Fallback: Hocuspocus 4 on a Node host.
3. **Postgres from a Durable Object.** Planned as `postgres.js` through the pooler with a connection per save. Fallbacks if the spike fails: Cloudflare Hyperdrive, or the Supabase Data API over HTTPS.
4. **dnd-kit and Motion both use transforms.** Layout animation can fight the drag transform. Spike in M1, settle in M6 (drag overlay for the dragged card, layout animation only for the others).
5. **Supabase free tier.** Projects pause after about a week of low database activity and have no backups. A daily Cloudflare cron runs a trivial query; the README explains how to restore a paused project. Whether a cron query counts as activity must be confirmed against Supabase's FAQ at deploy time.
6. **Public write access on the demo board.** Caps, generation reset and plain-text rendering as above. Per-field length limits are enforced client-side only; the server enforces total document size.
7. **Ticket in the WebSocket URL.** Browsers cannot set headers on WebSockets. Mitigated by the 60-second lifetime, board binding, and not logging query strings.
8. **Presence spoofing.** A client can lie about its name in awareness. Cosmetic only; document permissions are unaffected. Accepted for v1.
9. **Supabase key migration.** Legacy `anon`/`service_role` keys are being retired (stated as late 2026, date unconfirmed). Use the new publishable/secret keys and JWKS verification from the start.
10. **Docs drift.** Next.js 16, Drizzle, Supabase SSR and dnd-kit APIs have changed recently; current docs are checked at the start of each milestone rather than trusted from memory.

**Open questions (none block M0–M2):**

- Do you already have Cloudflare, Supabase, Vercel and GitHub accounts, and what should the GitHub repo be called?
- Do you want a custom domain? The WebSocket `Origin` allowlist and OAuth redirect URLs depend on it.
- Secrets: you paste them into `.env.local` and the hosting dashboards yourself; they are never put in chat or committed.

## Verification

- **Unit (Vitest):** `packages/core` (convergence, ordering, normalize, permissions matrix, ticket sign/verify, text binding) and `packages/db` queries.
- **Sync server:** Worker tests for ticket rejection, read-only enforcement, failed-load behaviour and caps.
- **End to end (Playwright):** two browser contexts on one board for sync, offline merge, presence, and role restrictions; axe checks.
- **CI:** lint, typecheck, unit tests and build on every push; Playwright added from M3.
- **Manual per milestone:** the "done when" checks above, run in the real app.

## Sources checked

- [y-partyserver README](https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver) and [PartyServer](https://github.com/threepointone/partyserver)
- [Durable Objects pricing and free limits](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Hocuspocus 4 stable release](https://tiptap.dev/blog/release-notes/hocuspocus-4-stable-release)
- [Supabase: Drizzle connection](https://supabase.com/docs/guides/database/drizzle), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys), [free project pausing](https://supabase.com/kb/faqs/platform/free-project-pausing)
- [dnd-kit React quickstart](https://dndkit.com/react/quickstart) and [multiple sortable lists](https://dndkit.com/react/guides/multiple-sortable-lists)
- [Next.js support policy](https://nextjs.org/support-policy)
