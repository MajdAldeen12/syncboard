# SyncBoard

A real-time collaborative kanban board. Several people can drag cards, edit text and see each other's cursors, and edits made offline merge cleanly on reconnect.

> **Status:** early development. The board at `/demo` has drag and drop (mouse, touch and keyboard) and live text editing, and stays in sync between tabs of the same browser: open it twice and watch one tab follow the other. Nothing is saved yet; the sync server and storage are the next milestone. See [docs/PLAN.md](docs/PLAN.md) for the architecture and milestones.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, Yjs, a Cloudflare Workers sync server, Supabase (Postgres + Auth) with Drizzle, dnd-kit, Motion and GSAP.

## Getting started

Requires Node.js 22.12 or newer and pnpm 12.

```bash
pnpm install
```

```bash
pnpm dev
```

## Scripts

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Run the web app locally                 |
| `pnpm build`        | Production build of the web app         |
| `pnpm lint`         | ESLint across all packages              |
| `pnpm typecheck`    | TypeScript across all packages          |
| `pnpm test`         | Unit tests (Vitest)                     |
| `pnpm e2e`          | Browser tests (Playwright)              |
| `pnpm format`       | Format the repository with Prettier     |
| `pnpm format:check` | Check formatting without changing files |

## Repository layout

- `apps/web`: the Next.js app
- `packages/core`: framework-free logic (board store, Yjs board model, text editing, ordering, permissions), unit tested
- `docs/`: the build plan and decision records
