# SyncBoard

A real-time collaborative kanban board. Several people can drag cards, edit text and see each other's cursors, and edits made offline merge cleanly on reconnect.

> **Status:** early development, local only. The board at `/demo` has drag and drop (mouse, touch and keyboard) and live text editing, and syncs through a sync server that runs on your machine: open it in two browsers and watch one follow the other. Each browser keeps its own copy, so edits made while disconnected merge when the connection returns. The server is not deployed yet, and saving to a database is the next step. See [docs/PLAN.md](docs/PLAN.md) for the architecture and milestones.

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

This starts the web app on `http://localhost:3000` and the sync server on `http://127.0.0.1:8787`. Open `http://localhost:3000/demo`.

The browser tests need a browser installed once:

```bash
pnpm --filter @syncboard/web exec playwright install chromium
```

## Scripts

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Run the web app and the sync server     |
| `pnpm build`        | Production build of the web app         |
| `pnpm lint`         | ESLint across all packages              |
| `pnpm typecheck`    | TypeScript across all packages          |
| `pnpm test`         | Unit tests (Vitest)                     |
| `pnpm e2e`          | Browser tests (Playwright)              |
| `pnpm format`       | Format the repository with Prettier     |
| `pnpm format:check` | Check formatting without changing files |

## Repository layout

- `apps/web`: the Next.js app
- `apps/sync`: the sync server, a Cloudflare Worker with one Durable Object per board
- `packages/core`: framework-free logic (board store, Yjs board model, text editing, ordering, sync status, permissions), unit tested
- `docs/`: the build plan and decision records
