# SyncBoard

Real-time collaborative kanban web app. Free public tool and portfolio piece: visual polish and engineering depth both matter.

**Keep this file current.** Update "Current status" at the end of every working session and whenever a milestone or decision changes. Work may continue from a different Claude account, so anything not written here or in `docs/` is lost.

## Product

Multiple people drag cards, edit text and see each other's cursors and presence. Works offline in an open tab and merges on reconnect. A public demo board needs no signup.

## Stack

- Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, on Vercel
- `motion` (Framer Motion) for in-app motion; GSAP + `useGSAP` for the landing page only
- Yjs for board state; `y-partyserver` on Cloudflare Workers + Durable Objects for sync
- Supabase Postgres + Auth; Drizzle ORM, migrations committed in `packages/db/drizzle`
- `@dnd-kit/react` for drag and drop; Vitest and Playwright for tests
- pnpm workspaces

## Layout

- `apps/web`: Next.js app. `(marketing)` = landing, `(app)` = boards, `src/server` = server-only code
- `apps/sync`: Cloudflare Worker, one Durable Object per board (added in M3)
- `apps/web/src/features/board`: the board UI. `apps/web/e2e`: Playwright tests
- `packages/core`: pure TS. Exists now: `board` (store interface, in-memory store, seed), `ordering`, `permissions`. Planned: `board-doc` (Yjs), `ticket`, `presence`, `text-binding`
- `packages/db`: Drizzle schema, client, queries (added in M3)
- `docs/PLAN.md`: full plan with milestones and "done" checks. `docs/decisions/`: decision records

## Architecture in brief

- Cards and columns live only in the Yjs doc. Postgres holds metadata and one snapshot row per board.
- `apps/web` decides access and signs a 60-second Ed25519 ticket. `apps/sync` verifies it with the public key, enforces read-only for viewers, and saves snapshots. The sync server makes no membership queries.
- Card moves set `columnId` + `order` (fractional index) in one transaction. Never delete-and-insert in a Y.Array.
- `boards.doc_generation` identifies the current doc; IndexedDB and tickets are keyed by it.
- If a snapshot fails to load, the room rejects connections. It never serves an empty doc.

## Rules

- Motion and GSAP never animate the same element. `motion` is banned under `(marketing)` and `features/landing`; `gsap` is banned everywhere else. ESLint enforces this.
- Permission checks run on the server, never only in the client. Every server action and route handler calls `requireBoardAccess` first. Drizzle bypasses RLS, so roles are enforced in `packages/core/permissions`.
- RLS is enabled on every table with no policies, to block the public Data API key.
- Yjs and permission logic stay in small `packages/core` modules with Vitest tests. No React, Next or Workers imports there.
- Database: Supabase shared pooler, transaction mode, `prepare: false`. Migrations use the direct connection string.
- Schema changes go through `drizzle-kit generate`; commit the SQL. Never edit an applied migration.
- Secrets live in `.env.local` and hosting dashboards. Never commit them or paste them into chat.
- Check current docs before using Next.js, Drizzle, Supabase SSR, dnd-kit or y-partyserver APIs; they changed recently.
- Write tests first for `packages/core`.

## Commands

Run from the repo root. Requires Node 22.12+ and pnpm 12 (`packageManager` pins 12.18.0).

- `pnpm dev`: run the web app
- `pnpm build`: production build of the web app
- `pnpm lint`: ESLint in every package
- `pnpm typecheck`: `next typegen` + `tsc --noEmit` in web, `tsc --noEmit` in core
- `pnpm test`: Vitest in every package that has tests
- `pnpm e2e`: Playwright browser tests in `apps/web/e2e`. Builds the app, serves it on port 3100, runs one test at a time (about 30 s)
- `pnpm format` / `pnpm format:check`: Prettier
- One package only: `pnpm --filter @syncboard/core test`

CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, test and build on pushes to `main` and on pull requests.

## Environment notes

- Windows 11, PowerShell. pnpm was installed with `npm install -g pnpm@12.18.0`; the corepack bundled with Node 22.19 cannot launch pnpm 12.
- The Next.js scaffold enabled `cacheComponents` and `partialPrefetching` in `apps/web/next.config.ts`. Read `apps/web/node_modules/next/dist/docs/` before writing data-fetching or auth code (see `apps/web/AGENTS.md`).
- pnpm 12 skips package versions published very recently. Pin a slightly older version instead of adding to `minimumReleaseAgeExclude`.
- Playwright runs with one worker. With several, pages hang before the `load` event on this machine, against both the dev and the production server. The server itself answers concurrent requests in about 30 ms; the cause was not found. Check again on Linux when e2e joins CI (M3).
- Do not point Playwright at `pnpm dev`: test artifacts written into `apps/web` stall Turbopack.
- `.claude/launch.json` defines the `web` preview server (port 3000) for Claude's browser pane.

## Drag and drop: how it works and why

Read this before touching `apps/web/src/features/board/board.tsx`. Each point cost a debugging session.

- **Pattern:** dnd-kit's "multiple sortable lists" guide. While a card is dragged, `onDragOver` updates a local draft (`dragLayout`) with `move()` from `@dnd-kit/helpers`. The store is written once, in `onDragEnd`, from `source.group` and `source.index`. Columns are reordered by dnd-kit itself and written on drop.
- **Do not** drop the draft and rely on dnd-kit's own preview for cards (the "without the move helper" example). Cross-column drops then corrupt the DOM: cards vanish after React re-renders.
- **Cancel (Escape):** the draft is kept until `useDragOperation().source` is null, then discarded. Discarding it inside `onDragEnd` re-parents the card while dnd-kit is still cleaning up, and the card can stay hidden. This failed about 1 run in 4 before the fix; after it, one failure was seen once and not again in 117 consecutive passes.
- **Cards are not buttons.** dnd-kit will not start a pointer drag from a `<button>`, so the card title is plain text inside a `role="group"` element with `tabIndex={0}`. Editing is by the pencil button or double-click.
- **No `disabled` on the sortable while editing.** It sets `aria-disabled` on the card, which marks the text field inside as disabled too.
- **Cards are direct children of the column's list container** (no `<li>` wrapper), because dnd-kit reorders sibling elements.
- **Keyboard:** Space or Enter picks up, arrows move (one card or one column at a time), Space drops, Escape cancels. After a keyboard drop or cancel, focus is put back on the moved card or column handle.
- **Tests wait for what a person would see** between key presses (`pickUp`, `drop` helpers). dnd-kit processes a move over a frame or two; keys sent with no gap can be lost.

## Current status

- Phase: M1 complete locally (2026-11-13) on branch `m1-static-board`. It is committed but **not pushed and not merged**; `main` on GitHub still holds M0 only. Next: push the branch, open a PR, merge when CI is green, then start M2.
- Repo: https://github.com/MajdAldeen12/syncboard (public, `origin`).
- The board lives at `/demo` and is held in memory per tab (`createLocalBoardStore`). M2 replaces that store with a Yjs-backed one behind the same `BoardStore` interface.
- [x] M0 Foundations (repo, CI, tooling)
- [x] M1 Static board with drag and drop: mouse, touch and keyboard drag for cards and columns, inline editing, add and delete. 58 unit tests, 13 Playwright tests.
- [ ] M2 State in Yjs, two tabs in sync
- [ ] M3 Sync server + Supabase persistence + offline
- [ ] M4 Presence and cursors
- [ ] M5 Auth, sharing, permissions, demo board
- [ ] M6 Motion polish in the app
- [ ] M7 GSAP landing page
- [ ] M8 Design pass, accessibility, performance
- [ ] M9 Demo GIF, README, deploy

## Open items

- M2: decide how remote changes are shown while a local drag is in progress (the drag draft is a copy taken at drag start).
- M2: `BoardStore.updateCard` replaces whole strings. Character-level merging needs `Y.Text` and the planned `text-binding` module.
- M3 spike: Durable Object hibernation with y-partyserver; Postgres access from the Worker
- M3: add `pnpm e2e` to CI (install Chromium with `playwright install --with-deps chromium`) and retest parallel workers there.
- M6: card description has no UI yet (the field exists in the model). Planned with the card detail view.
- M8: drag announcements read out raw ids ("seed-column-1-card-1"); configure dnd-kit's Accessibility plugin to use card and column titles.
- M8: cards are a `role="group"` in a plain container, not list items. Review with a screen reader.
- Deleting a column with cards uses `window.confirm`. Replace with undo or a proper dialog (M6).
- ESLint 9 is marked deprecated on npm; it is what create-next-app 16.4.6 installs. Move to ESLint 10 when `eslint-config-next` is confirmed to work with it.
- Free-tier Supabase pauses after about a week of low activity: keep-alive cron + README note (M9)
- Hosting accounts (Cloudflare, Supabase, Vercel) and domain not yet confirmed
- `pnpm-workspace.yaml` has a leftover `minimumReleaseAgeExclude: prettier@3.10.1` entry added by pnpm; prettier is now pinned to 3.9.10, so the entry can be deleted once the owner agrees

## Decisions

- Sync server: y-partyserver on Cloudflare (free, no sleep). Fallback: Hocuspocus 4 on Node.
- Demo: one shared board, auto-reset by generation bump.
- Offline: open tab + IndexedDB, no service worker.
- Card text: plain text with `Y.Text`.
- Share links require sign-in; token stored as SHA-256 hash.
- TypeScript pinned to 5.9.3 (what create-next-app 16.4.6 targets). TypeScript 7 is out but `typescript-eslint` supports only `<6.1.0` (checked 2026-11-12). Revisit later.
- ESLint 9, one flat config per package (`apps/web`, `packages/core`) instead of a single root config.
- Permission matrix (`packages/core/src/permissions`): viewer reads; editor reads and edits; only the owner deletes the board or manages members and links. Unknown or missing roles are denied.
- Shared dependency versions live in the `catalog:` section of `pnpm-workspace.yaml`.
- Drag and drop: `@dnd-kit/react` 0.5.x passed the M1 spike (React 19, built-in keyboard sensor and live-region announcements). The legacy `@dnd-kit/core` fallback was not needed.
- Ordering: `fractional-indexing-jittered` behind `packages/core/src/ordering`. Ids: `nanoid`. Seed content has fixed ids and unjittered keys so it is identical wherever it is built.
- `packages/core` exports TypeScript source; `apps/web` compiles it via `transpilePackages`.
- Work on a branch per milestone (`m1-static-board`, ...), merged to `main` by pull request.
