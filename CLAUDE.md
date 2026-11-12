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
- `packages/core`: pure TS: `board-doc`, `permissions`, `ticket`, `presence`, `text-binding`
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
- `pnpm format` / `pnpm format:check`: Prettier
- One package only: `pnpm --filter @syncboard/core test`

CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, test and build on pushes to `main` and on pull requests.

## Environment notes

- Windows 11, PowerShell. pnpm was installed with `npm install -g pnpm@12.18.0`; the corepack bundled with Node 22.19 cannot launch pnpm 12.
- The Next.js scaffold enabled `cacheComponents` and `partialPrefetching` in `apps/web/next.config.ts`. Read `apps/web/node_modules/next/dist/docs/` before writing data-fetching or auth code (see `apps/web/AGENTS.md`).
- pnpm 12 skips package versions published very recently. Pin a slightly older version instead of adding to `minimumReleaseAgeExclude`.

## Current status

- Phase: M0 complete (2026-11-12). Repo: https://github.com/MajdAldeen12/syncboard (public, `origin`, branch `main`). First CI run is green. Next: M1, starting with the `@dnd-kit/react` spike.
- [x] M0 Foundations (repo, CI, tooling)
- [ ] M1 Static board with drag and drop
- [ ] M2 State in Yjs, two tabs in sync
- [ ] M3 Sync server + Supabase persistence + offline
- [ ] M4 Presence and cursors
- [ ] M5 Auth, sharing, permissions, demo board
- [ ] M6 Motion polish in the app
- [ ] M7 GSAP landing page
- [ ] M8 Design pass, accessibility, performance
- [ ] M9 Demo GIF, README, deploy

## Open items

- M1 spike: `@dnd-kit/react` keyboard support and stability (fallback: legacy `@dnd-kit/core`)
- M3 spike: Durable Object hibernation with y-partyserver; Postgres access from the Worker
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
