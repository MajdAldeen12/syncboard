# SyncBoard

Real-time collaborative kanban web app. Free public tool and portfolio piece: visual polish and engineering depth both matter.

**Keep this file current.** Update "Resume here" and "Current status" at the end of every working session and whenever a milestone or decision changes. Work may continue from a different Claude account, so anything not written here or in `docs/` is lost.

## Resume here (last updated 2026-11-17)

- **State:** `main` holds milestones 0 to 2, M3 stage 1 and M4 (presence and live cursors). M4 was merged through pull request 4 on 2026-11-16; both CI jobs passed on it, the 17 new browser tests included. No open pull requests.
- **In flight: M6 (motion polish in the app)**, on branch `m6-motion-polish`, cut from `main` at `8f81330` on 2026-11-16. The branch holds reading and planning only: no application code or test has been changed, and its commits touch only this file. It is pushed to GitHub (`origin/m6-motion-polish`); no pull request.
- **Next:** carry on with M6 from "Next: M6" below. That section holds the whole brief, what was found out, the planned approach and the order of work. The first thing still to do is the spike that proves the layout-animation approach. M3 stage 2 (Supabase persistence) and M5 (sign-in, sharing, permissions) cannot start until the owner has a development Supabase project. M7 (the landing page) needs no accounts either.
- **Waiting on the owner:**
  - A development Supabase project, needed for M3 stage 2 and M5.
  - A look at `/demo` as two people: two different browsers, or one normal and one private window. Two tabs of the same browser are the same guest, so they show one avatar (and each other's pointer). `pnpm dev` starts the sync server too. M2, M3 stage 1 and M4 were verified by automated tests.
  - OK to delete the merged branches `m1-static-board`, `m2-yjs-board`, `m3-sync-server` and `m4-presence` (local and on GitHub), and the leftover `minimumReleaseAgeExclude` entry in `pnpm-workspace.yaml`.
- **First time on a machine:** `pnpm install`, then `pnpm --filter @syncboard/web exec playwright install chromium`. Run the full gate (see "Working a milestone") to confirm a clean start before changing anything. To continue M6: `git fetch origin`, then `git switch m6-motion-polish`.

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
- `apps/sync`: the sync server, a Cloudflare Worker. `src/index.ts` (routing, `/health`), `src/board-room.ts` (one Durable Object per board), `src/room-load.ts` (what a room starts with), `src/seed.ts` (which boards exist without being created), `src/durable-object-store.ts` (where the document is kept), `src/presence-relay.ts` (who is on the board, kept with each connection so that it survives hibernation)
- `apps/web/src/features/board`: the board UI, including `sync-indicator.tsx` and `board-placeholder.tsx` (loading and unavailable states)
- `apps/web/src/features/presence`: `avatar-stack.tsx` (who is here), `cursor-overlay.tsx` (other people's pointers), `use-publish-cursor.ts` (this tab's pointer), `activity-tag.tsx` ("Ana is editing" on a card or column), `presence-context.tsx` (`usePresence`, `useAnnounceEditing`)
- `apps/web/e2e`: Playwright tests. `board.spec.ts` one tab, `sync.spec.ts` two tabs, `server.spec.ts` two browsers, offline, storage. `presence.spec.ts` two browsers: avatars, pointers, tags, message counts. `helpers.ts` shared, `ports.ts` the test servers' addresses
- `apps/web/src/lib`: `board-session.ts` (a board's document, saved copy, server connection and status), `sync-config.ts` (server address, test boards), `bind-text-field.ts` (ties a text field to a `TextSession`), `guest-identity.ts` (the made-up name and colour of a browser that has not signed in)
- `packages/core`: pure TS. Exists now: `board` (store interface, in-memory store, seed, `store-contract.ts` = the tests every store must pass), `board-doc` (Yjs schema, mutations, state reader, `normalizeBoard`, Yjs store, `testing.ts` = test helpers), `ordering`, `permissions`, `sync-status` (close codes, what to show about the connection, stalled-handshake detector), `text-binding` (text diff, caret shift, `TextSession` type), `presence` (the shape of one client's presence, `parsePresence`, `readPresence`, cursor geometry, the throttle, `createPresenceStore`, guests). Planned: `ticket`
- `packages/db`: Drizzle schema, client, queries (M3 stage 2, not created yet)
- `docs/PLAN.md`: full plan with milestones and "done" checks. `docs/decisions/`: decision records (0001 hibernation, 0002 presence against hibernation, 0003 cursor coordinates)

## Architecture in brief

- Cards and columns live only in the Yjs doc. Postgres holds metadata and one snapshot row per board.
- `apps/web` decides access and signs a 60-second Ed25519 ticket. `apps/sync` verifies it with the public key, enforces read-only for viewers, and saves snapshots. The sync server makes no membership queries.
- Card moves set `columnId` + `order` (fractional index) in one transaction, always both. Never delete-and-insert in a Y.Array.
- Card and column titles are `Y.Text`, edited live through a `TextSession` (`BoardStore.editCardTitle` / `editColumnTitle`).
- `boards.doc_generation` identifies the current doc; IndexedDB and tickets are keyed by it.
- If a snapshot fails to load, the room rejects connections. It never serves an empty doc.
- Presence (who is here, pointers, who is editing what) travels as Yjs awareness messages. It is never saved and never trusted: a client can say anything about itself, so nothing may decide access from it.

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

- `pnpm dev`: run the web app (port 3000) and the sync server (`127.0.0.1:8787`) together. The board needs both.
- `pnpm build`: production build of the web app
- `pnpm lint`: ESLint in every package
- `pnpm typecheck`: `next typegen` + `tsc` in web, `wrangler types` + `tsc` in sync, `tsc` in core
- `pnpm test`: Vitest in every package that has tests (core and sync)
- `pnpm e2e`: Playwright browser tests in `apps/web/e2e`. Starts its own sync server on `127.0.0.1:8788` and builds and serves the web app on `127.0.0.1:3100`, so it can run while `pnpm dev` is up. One test at a time, about 3 minutes
- `pnpm format` / `pnpm format:check`: Prettier
- One package only: `pnpm --filter @syncboard/core test`

CI (`.github/workflows/ci.yml`) has two jobs on pushes to `main` and on pull requests: `check` (format, lint, typecheck, unit tests, build) and `e2e` (the browser tests, with traces uploaded on failure).

## Working a milestone

1. Read this file and the milestone's section in `docs/PLAN.md`. Cut a branch from an up-to-date `main` (`m3-sync-server`, ...).
2. Build test-first. Anything timing-sensitive in the browser gets repeated before it is trusted: `pnpm --filter @syncboard/web exec playwright test --repeat-each=5`.
3. Full gate, all must pass: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.
4. Update this file ("Resume here", "Current status", "Open items", "Decisions"), then commit on the branch.
5. Ask the owner before pushing, opening a pull request or merging. Pull requests are squash-merged with the milestone's commit message: `gh pr merge <n> --squash --subject "<title> (#<n>)" --body-file <file>`.
6. After the merge: `git switch main`, `git pull --ff-only`, and confirm the CI run on `main` passed.

## Next: M6 (motion polish in the app)

Started 2026-11-16 on `m6-motion-polish`. **Nothing is built yet.** On that branch, before any change, `pnpm test` passed (354 core + 51 sync) and `pnpm e2e` passed (46 tests, 2.1 minutes). A failure seen later therefore comes from M6 work.

### The brief

Read first: this file in full, above all "Drag and drop: how it works and why" and "Presence: how it works and why" (several entries describe two things moving the same DOM nodes and leaving cards hidden), then the "M6" entry and risk 4 in `docs/PLAN.md`, and the open items tagged M6 below.

What to build:

- Layout animation when cards and columns change order because of someone else's edit, or after a local drop, without fighting dnd-kit while a drag is in progress. The plan's suggestion: the dragged item is handled by dnd-kit, layout animation applies to the others. Prove the chosen approach before building on it.
- Lift and drop feedback for a dragged card or column.
- A card detail view opened from a card, with the description edited live. It needs an `editCardDescription` session next to `editCardTitle` in `packages/core` (test-first, in the shared store contract) and a transition for opening and closing the view. Focus moves in, is trapped, and returns to the card.
- Enter and exit animation for avatars and for other people's pointers.
- Replace the `window.confirm` used when deleting a column that has cards (undo, or a proper dialog).
- A page transition between the home page and the board, if it can be done without harming the static prerender.
- Everything respects `prefers-reduced-motion`: non-essential motion is removed, not just shortened.
- Stretch, only if the rest is solid: undo and redo of your own changes with `Y.UndoManager`.
- If it fits naturally, fix the column-drag bug listed first under "Open items", with a test.

Done when:

- A reorder made in another browser animates into place with no jump, shown by a browser test or a recorded measurement.
- Dragging on a board with 200 cards holds 60 frames a second in a Chrome performance trace. Record the measurement in `docs/decisions/`.
- With reduced motion requested, the non-essential animations are absent, covered by a browser test.
- The card detail view works by mouse and by keyboard alone, and two browsers editing one description both keep their words.
- The full gate passes with the existing 405 unit tests and 46 browser tests still passing. This milestone touches the drag-and-drop elements, so repeat the whole browser suite at least four times before trusting it.
- This file is updated and the work is committed on `m6-motion-polish`.

Constraints:

- `motion` (import from `motion/react`) only. Check Motion's current documentation before relying on remembered APIs. Animate transforms and opacity, not layout properties.
- This is polish, not the design pass: colours, type and layout are M8. Keep the current look and make it move well.
- No persistence or database (M3 stage 2), no sign-in or sharing (M5), no landing page (M7), no deployment.
- Pin dependency versions that are at least a few days old. Playwright stays on one worker.
- Do not push, open a pull request or merge without asking the owner first.

### Found out so far

Read from the installed sources and the code. Nothing here has been run or tested yet.

dnd-kit 0.5.3 (`node_modules/.pnpm/@dnd-kit+dom@0.5.3/node_modules/@dnd-kit/dom`: `index.js` holds the Feedback plugin, `sortable.js` the sortable):

- **The held element is moved with the CSS `translate` property, not `transform`.** While held it carries `data-dnd-dragging`, and a stylesheet rule sets `position: fixed`, `translate`, `transition` and `transform: var(--dnd-transform, none)` on it, all `!important`. The variable is filled with the element's computed `transform` at pick-up. So a `transform` that anything else puts on the sortable element during a drag is overridden and does nothing.
- **The drop** is a Web Animations API animation of `translate` on the held element towards its placeholder. It measures the element with transforms included. Its duration is 0 when the browser asks for reduced motion.
- **The other cards make room** through `Sortable.animate()`: a 250 ms Web Animations API animation of `translate`, started when a sortable's `index` or `group` changes. It runs only while a drag is in progress, unless `transition: { idle: true }` is passed to `useSortable`. Also 0 ms under reduced motion.
- The placeholder left in the list is a DOM clone carrying `data-dnd-placeholder`, hidden with `visibility: hidden`.
- `DragDropProvider` accepts `onBeforeDragStart` (seen in the type definitions; the board does not use it yet).

Motion:

- The Motion docs search tool was not available in that session, so **Motion's API has not yet been checked against current documentation.** Do that first for `layout`, `layoutDependency`, `layoutScroll`, `AnimatePresence` and its modes, `MotionConfig reducedMotion`, `useReducedMotion` and `animate()` on DOM elements. Sources: the `motion` skill and its MCP server, Context7, or motion.dev. The installed code is readable too: `motion` 14.10.1 is `framer-motion` 14.10.1 plus `motion-dom` 14.10.1 under `node_modules/.pnpm`.
- From the Motion skill's written guidance: `<MotionConfig reducedMotion="user">` turns off transform and layout animations for people who ask for reduced motion and keeps opacity and colour. `AnimatePresence` stays mounted with the condition inside it, and each direct child needs a stable key. `mode="popLayout"` needs a positioned parent. A motion value is never read during render.

In this code:

- Cards sit in a list with `overflow-y-auto` (`column.tsx`). A card moved by a transform is still clipped by that list, so a card sliding in from another column only becomes visible inside the new column's list. Motion's `layout` prop has the same limit.
- `transform` on the sortable element is dead during a drag (above), so lift feedback has to be drawn on an element inside the card, not on the card element itself.
- `cardsIn` in `e2e/helpers.ts` reads `innerText`, which leaves out the text of a `visibility: hidden` element and includes any extra text put inside a card. Hide a card with opacity if it must be hidden for a moment, and give an icon an `aria-label` instead of visible or `sr-only` text.
- Two tests accept the `window.confirm` with `page.once("dialog", …)`: "deletes a column after confirmation" in `board.spec.ts` and "adding, renaming, reordering and deleting columns" in `sync.spec.ts`. Both change with whatever replaces the confirm. The second also presses Escape to dodge the column-drag bug.
- The home page is under `(marketing)`, where ESLint bans `motion`. A page transition made with Motion can therefore only live on the `(app)` side.
- For the description session: `MAX_DESCRIPTION_LENGTH` (5000) exists, the view already carries `description`, and `write.cardText(doc, id, "description")` exists. `editText` in `board-doc/store.ts` and `editTitle` in `board/local-store.ts` hard-code the title limit and refuse a blank result on commit. A description needs its own limit, and an empty one is valid.
- Test boards (`test-*`) start with the demo content, about nine cards. The 200-card check needs a bigger board. `apps/sync/src/seed.ts` decides what a board starts with.

### Planned approach (not proven yet)

A plan, not a record. Change it if the spike says otherwise, and move what survives into "Decisions".

1. **Layout animation: first-last-invert-play at board level, run by Motion's `animate()`**, instead of the `layout` prop on every card. Record where every card and column is just before React changes the DOM (a small class component's `getSnapshotBeforeUpdate`, rendered by `Board`), measure again after, and animate each one that moved from where it was, on `transform`. Never while `drag` or `settling` is set in `board.tsx`, and every running animation is finished in `onBeforeDragStart`, so Motion and dnd-kit never move a card at the same moment. The first render after a drag has settled is animated: that is where changes made by others during the drag appear. Reasons for not using `layout`: each card would have to know that a drag is in progress, which redraws all of them at pick-up; only components that redraw are animated; and a card that changes column is re-created, which needs `layoutId`. If the spike fails, `layout` with `layoutDependency` is the alternative.
2. **Prove it first** with a two-browser test: one browser reorders, the other samples a card's position every frame. Many in-between positions and no large step means no jump. The same test under `reducedMotion: "reduce"` must see no in-between position.
3. **Lift and drop feedback on an inner element** of the card and of the column, driven by `isDragging`. For the shadow, fade a second shadow layer with opacity; do not animate `box-shadow`.
4. **`editCardDescription`**: contract tests first in `board/store-contract.ts`, then both stores, then a two-client merge test in `board-doc/store.test.ts`. Reuse `bindTextField` in the UI.
5. **Card detail view: a native `<dialog>` opened with `showModal()`, rendered once at board level**, not inside a card's element (dnd-kit listens for keys on the card element; whether a dialog inside it would trigger a drag was not checked, and rendering it outside avoids the question). Opened by a new "Open card" button in the card's row of actions; double-click and the pencil keep editing the title in place. The backdrop and the panel are elements inside the dialog so that Motion can animate them. Return focus to the card explicitly on close. Close the view if someone else deletes the card.
6. **Avatars**: `AnimatePresence` with `motion.li`. **Pointers**: enter and exit on an inner element, so that position (the outer element, motion values) and appearance never share an element.
7. **Column delete**: a confirm dialog built on the same dialog. Undo instead only if the stretch goal gets done.
8. **Page transition**: an entrance in `(app)/template.tsx`, with `initial={false}` on the first load so that the prerendered HTML is never hidden.
9. **Reduced motion**: movement is removed (layout animation, lift, the dialog's movement, the pointer glide); short opacity fades stay, which is what `MotionConfig reducedMotion="user"` does. Calls to `animate()` must check for themselves. Write the rule into the decision record.
10. **200 cards**: a test-only seeded board (for instance `test-large-*` in `apps/sync/src/seed.ts`), a trace recorded with Playwright through CDP `Tracing`, written up as `docs/decisions/0004-…`.
11. **Column-drag bug**: write the failing test first, then blur a focused text field in `onBeforeDragStart`, and remove the Escape workaround from `sync.spec.ts`.

Order: 4 can be done at any time and is independent. 1 and 2 come before 3. 5 and 7 share the dialog. Leave `apps/sync/src` alone while `pnpm e2e` runs.

## Next: M3 stage 2 (Supabase persistence)

Stage 1 is done (see "Sync server: how it works and why"). The M3 done checks are in `docs/PLAN.md` under "M3"; the one stage 1 could not meet is "restarting the sync server restores the board from Supabase".

- **Needs a Supabase project.** The owner creates a development project and puts the pooler and direct connection strings into `apps/sync/.dev.vars` and `apps/web/.env.local` themselves (see `.env.example`). Never ask for them in chat.
- **Build:** `packages/db` (schema from the plan, RLS on with no policies, first migration), a spike on Postgres access from the Durable Object (`postgres.js` through the pooler; fallbacks Hyperdrive or the Supabase Data API), then a Supabase-backed `SnapshotStore`.
- **Only the store changes.** `loadBoard` in `apps/sync/src/room-load.ts` already applies the failed-load rule to any `SnapshotStore`, and `BoardRoom` already refuses connections and skips saving after a failed load.
- **Decide in the spike:** whether Durable Object storage stays as the working copy with Supabase written through. `docs/decisions/0001-durable-object-hibernation.md` explains why that is likely needed: every wake-up is a load.
- **Do not deploy the sync server publicly in M3.** Connections are not authorised until M5. Local `wrangler dev` only.

## Environment notes

- Windows 11, PowerShell. pnpm was installed with `npm install -g pnpm@12.18.0`; the corepack bundled with Node 22.19 cannot launch pnpm 12.
- The Next.js scaffold enabled `cacheComponents` and `partialPrefetching` in `apps/web/next.config.ts`. Read `apps/web/node_modules/next/dist/docs/` before writing data-fetching or auth code (see `apps/web/AGENTS.md`).
- pnpm 12 skips package versions published very recently. Pin a slightly older version instead of adding to `minimumReleaseAgeExclude`.
- Playwright runs with one worker. On this machine, connections from several browser contexts at once stall: with several workers pages hang before the `load` event, and even with one worker a second browser's WebSocket handshake occasionally never completes (seen once in 21 runs). The servers answer concurrent requests from `curl` in about 30 ms. Using `127.0.0.1` instead of `localhost` did not help, so it is not IPv6. Cause unknown; whether Linux has it is still to be seen in CI.
- Because of that stall, `openBoard` in the tests waits up to 25 s, and the app itself abandons a connection attempt after 8 s and retries (`createStallDetector`).
- Do not point Playwright at `pnpm dev`: test artifacts written into `apps/web` stall Turbopack.
- The browser tests build into `apps/web/.next-e2e`, not `.next`, because that build has test boards switched on (`NEXT_PUBLIC_ALLOW_TEST_BOARDS`). A normal build never has.
- `context.setOffline(true)` in Playwright does not close an open WebSocket. The app reacts to the browser's `offline` event instead, which is also what makes the offline test work.
- `.claude/launch.json` defines the `web` (port 3000) and `sync` (port 8787) preview servers for Claude's browser pane. If a port is busy, a preview or `pnpm dev` from an earlier session is still running.
- pnpm 12 refuses to run package install scripts unless they are listed under `allowBuilds` in `pnpm-workspace.yaml`. `esbuild` and `workerd` (from wrangler) are listed as `false` and work without theirs.
- `apps/sync/worker-configuration.d.ts` is generated by `wrangler types` (run by the typecheck script) and is not committed.
- `@cloudflare/vitest-pool-workers` needs Vitest 4; the repo uses Vitest 5. So the Durable Object is not unit-tested inside workerd: its rules live in plain functions tested in Node, and the object itself is covered by the browser tests against a real `wrangler dev`.
- pnpm reports an unmet peer: wrangler wants `@cloudflare/workers-types` 5, y-partyserver wants 4. Version 4 is installed; types come from `wrangler types` either way. Harmless so far.
- Pushing a change under `.github/workflows` needs the `workflow` scope on the `gh` login. It was granted on this machine; elsewhere the owner runs `gh auth refresh -h github.com -s workflow`.
- `apps/web/e2e` tests must drive drags with stepped pointer moves (`dragWithMouse`). A single jump from press to release never starts a dnd-kit drag, which is also why Claude's browser-pane drag gesture does not work on the board.
- `wrangler dev` reloads the worker whenever a file under `apps/sync/src` is saved, formatting included, and every room starts again. Leave those files alone while a measurement or `pnpm e2e` is running.
- Claude's Bash tool on this machine fails on an inline script (heredoc) that contains an apostrophe: `unexpected EOF while looking for matching`. Write the script to a file and run the file.
- A second look at a failing browser test is cheap: `apps/web/test-results/<test>/error-context.md` holds the page as it was, as an accessibility tree.

## Drag and drop: how it works and why

Read this before touching `apps/web/src/features/board/board.tsx`. Each point cost a debugging session.

- **Pattern:** dnd-kit's "multiple sortable lists" guide. While a card is dragged, `onDragOver` updates a local draft (`drag.layout`) with `move()` from `@dnd-kit/helpers`. The store is written once, in `onDragEnd`, from `source.group` and `source.index`. Columns are reordered by dnd-kit itself and written on drop.
- **The board is frozen while dragging (M2).** `drag.board` is the snapshot taken at drag start; it and the draft are what is drawn until dnd-kit is idle. Changes from other tabs wait in the store. On drop, `rebaseIndex` carries the drop index over to the live board by neighbours.
- **Do not** drop the draft and rely on dnd-kit's own preview for cards (the "without the move helper" example). Cross-column drops then corrupt the DOM: cards vanish after React re-renders.
- **Drop and cancel (Escape):** the drag view is kept until `useDragOperation().source` is null, then discarded (`WhenDragIdle`). Discarding it inside `onDragEnd` re-parents the card while dnd-kit is still cleaning up, and the card can stay hidden. For cancel this failed about 1 run in 4 before the fix; after it, one failure was seen once and not again in 117 consecutive passes. Since M2 a drop waits the same way, because the live board may differ from what was drawn; with that change all 22 browser tests passed 6 times in a row (132 runs, 2026-11-13).
- **Cards are not buttons.** dnd-kit will not start a pointer drag from a `<button>`, so the card title is plain text inside a `role="group"` element with `tabIndex={0}`. Editing is by the pencil button or double-click.
- **No `disabled` on the sortable while editing.** It sets `aria-disabled` on the card, which marks the text field inside as disabled too.
- **Cards are direct children of the column's list container** (no `<li>` wrapper), because dnd-kit reorders sibling elements.
- **Keyboard:** Space or Enter picks up, arrows move (one card or one column at a time), Space drops, Escape cancels. After a keyboard drop or cancel, focus is put back on the moved card or column handle.
- **Tests wait for what a person would see** between key presses (`pickUp`, `drop` helpers). dnd-kit processes a move over a frame or two; keys sent with no gap can be lost.
- **Mouse tests use screen coordinates.** The board scrolls sideways once it is wider than the window, so `dragWithMouse` scrolls its source into view first. A press at an off-screen position silently misses.

## Yjs board: how it works and why

Read this before touching `packages/core/src/board-doc` or the files in `apps/web/src/lib`.

- **One store interface, two stores.** The UI talks to `BoardStore` only. `createYjsBoardStore(doc)` is the real one; `createLocalBoardStore` stays as the reference implementation. Both run the same tests from `board/store-contract.ts`. Add shared behaviour there, not in one store's test file.
- **Starting content is one deterministic update.** `encodeBoardState(state)` writes the board under fixed client id 1 with sorted ids, so every copy of it holds identical Yjs structs and copies merge. **Do not** seed a document with ordinary writes per client: each would add its own copy and one copy would overwrite the other.
- **Only the sync server seeds a board (since M3).** The browser's document starts empty and is filled from its saved copy or from the server. Two documents seeded from different content share struct ids with different content, and merging them corrupts both; with one seeder that cannot happen between devices. It can still happen if the seed text in `createSeedBoard` is changed while a server holds a board seeded from the old text and is then wiped: a browser's saved copy of the old seed would meet a new one. Bump `DOC_GENERATION` (see `board-session.ts`) whenever the seed content changes.
- **No `new Y.Doc()` during server rendering.** It draws a random client id, and with `cacheComponents` Next.js rejects random values in a prerendered page. The server renders the loading state only; `demo-board.tsx` creates the session on the first browser render, where it also starts out loading, so hydration matches.
- **One copy of Yjs.** `yjs` is pinned in the `catalog:` and used by both `packages/core` and `apps/web`. Two copies break Yjs's `instanceof` checks.
- **A move always writes both `columnId` and `order`.** Yjs keeps one winner per key. Written together every time, the same client wins both. Writing only `order` for a move inside a column let one person's column pair with another's position (a test covers it with client ids both ways round).
- **Cards whose column is gone** are shown in the first column by `normalizeBoard`, in the view only. `deleteColumn` deletes the cards shown in the column, including these. Moving one writes its column again. With no column at all they are hidden.
- **Text sessions.** Typing writes to the `Y.Text` at once under an origin unique to the session. Escape (`cancel`) and a blank result (`commit`) take back that session's edits with a `Y.UndoManager` tracking only that origin, so other people's edits to the same title survive. `renameColumn` and `updateCard` still exist; they apply the smallest diff, not a whole-string replace.
- **The text field is uncontrolled.** `bindTextField` listens to `input`, diffs against what the field last showed (`diffText`, with the caret to settle repeated characters, never splitting a surrogate pair) and moves the caret through remote edits with `shiftIndex`. The field's accessible name is fixed when it opens; a name that followed the text broke the tests' locators and would change under a screen reader on every keystroke.
- **The store rereads the whole document on every Yjs `update`** and reuses unchanged records (`readBoardState(doc, previous)`), so unchanged cards keep their object identity and `memo` skips them. Entries of the wrong shape are skipped, not trusted.
- **During a drag the board is frozen.** `board.tsx` draws the snapshot taken at drag start plus the drag draft until dnd-kit is idle again, for drops as well as cancels. Remote changes are in the document but not drawn until then. On drop the index is carried over to the live board by neighbours (`rebaseIndex`), so the card lands next to the cards it was dropped next to.
- **Convergence tests** (`board-doc/convergence.test.ts`) seed `Math.random` so runs repeat. They passed on first run, so each rule was then broken on purpose to see the tests fail: position-only moves, no `normalizeBoard`, whole-string text writes, cancel by rewriting the old text. Do the same when adding a rule.

## Sync server: how it works and why

Read this before touching `apps/sync` or `apps/web/src/lib/board-session.ts`. The hibernation findings are in `docs/decisions/0001-durable-object-hibernation.md`.

- **One Durable Object per board, hibernating.** `BoardRoom` extends y-partyserver's `YServer` with `hibernate: true`. About ten seconds after the last message it is dropped from memory with its sockets still open, and constructed again on the next message. **Every wake-up runs `onLoad`**, including a wake-up caused only by a socket closing.
- **Never serve a document that was not loaded.** `loadBoard` returns `ready`, `not-found` or `unavailable`. On anything but `ready` the room closes every connection (codes 4404 and 4503, defined in `packages/core/src/sync-status`), reports itself read-only so no update is applied, and skips saving. A room that failed to load stays in memory while people keep retrying, so it asks storage again after 5 s instead of waiting to be constructed afresh.
- **A seed is stored before it is served.** Only the board `demo` has a seed. Any other board with no stored document does not exist.
- **Saving is y-partyserver's debounce only:** 2 s after the last change, at most 10 s after the first. It does not save when a room empties, despite its README; the pending timer keeps the object awake, so nothing is lost. A crash inside that window loses nothing either, because clients resend what the server is missing when they reconnect.
- **Stage 1 keeps the document in the Durable Object's own storage** (`durableObjectSnapshotStore`), one value, refused above 1.5 MB. Stage 2 adds Supabase behind the same `SnapshotStore` interface.
- **Test boards.** With `ALLOW_TEST_BOARDS=1` the server also creates boards named `test-*` (each test gets its own) and fails every load of `test-fail-*`. The browser side is `NEXT_PUBLIC_ALLOW_TEST_BOARDS=1` and `/demo?board=test-...`. Both default to off, and only `pnpm e2e` turns them on. **Never set either in a deployment.**
- **In the browser, `createBoardSession` does no I/O**, so it can be called while rendering; `connect(host, user)` opens IndexedDB and the socket, joins the board as `user`, and returns the function that closes them. The status shown comes from the pure `syncStatus` in `packages/core`.
- **A connection only counts as working once a sync has completed.** A server that refuses a board first accepts the socket and then closes it. Treating "socket open" as success made the screen flip between loading and unavailable on every retry.
- **The app trusts the browser's `offline` and `online` events** and hangs up or redials itself. The provider only notices a dead connection when the socket finishes closing, which can be long after the network has gone.
- **Tabs of one browser also talk directly** through the provider's built-in BroadcastChannel (left on). It is faster than the round trip and keeps tabs in step while the server is away. Two different browsers are connected only by the server.
- **No connect timeout exists in WebSockets or in the provider.** `createStallDetector` abandons an attempt after 8 s; closing the socket makes the provider retry.

## Presence: how it works and why

Read this before touching `packages/core/src/presence`, `apps/sync/src/presence-relay.ts` or `apps/web/src/features/presence`. The measurements are in `docs/decisions/0002-presence-and-hibernation.md`, the cursor format in `docs/decisions/0003-cursor-coordinates.md`.

- **Nothing repeats on a timer.** y-partyserver switches off the awareness protocol's 15-second renewal and 30-second timeout on both sides. That is what lets a board with idle tabs sleep: measured, 0 messages and 0 wake-ups in 60 s. The price is that nothing ever times out. Only the server can say that someone has gone, and it does, in `onClose`. **Do not add a heartbeat.**
- **The room relays presence itself.** y-partyserver keeps awareness states in the room's memory, which hibernation empties: after a wake-up a newcomer saw nobody and a closed tab stayed on screen for good. `BoardRoom` now handles awareness messages in `onConnect`, `onMessage` and `onClose` with the rules in `presence-relay.ts`; document messages still go to y-partyserver.
- **Each connection's last state lives in its WebSocket attachment** (`connection.setState`, key `presence`). Attachments survive hibernation. y-partyserver keeps a key of its own in the same object, so always spread the previous state when setting.
- **A connection speaks for one client id**, the first it announces. Entries about other ids, and entries that are not newer, are dropped. A goodbye is sent at the stored clock, never a higher one: browsers remove a state only for a goodbye at exactly their clock, which is what keeps a tab that has already reconnected from being removed by its old connection closing.
- **The browser sends only its own state.** The provider sends back every awareness change it sees, other people's included; with N people one pointer move cost N billed messages. `board-session.ts` wraps the provider's `_awarenessUpdateHandler` with `ownChanges`. That field has an underscore: check it when upgrading y-partyserver. The traffic test in `presence.spec.ts` fails if it stops working.
- **One throttle for everything a tab says about itself** (`createPresenceStore`): at most one message per 66 ms, the last value always sent, nothing and no timer while nothing changes. Only the announcement on connect bypasses it.
- **The view has three parts that keep their identity** until they change: `others` (one per tab, for pointers), `people` (one per person, for avatars), `activity` (who is editing or moving what). A component reads one part with `usePresence(store, (view) => view.people)`. The selector must return a part as it is. A `.map` or `.filter` inside it returns a new value every time and `useSyncExternalStore` loops.
- **A person is a user id, a pointer is a tab.** Two tabs of one browser show one avatar and each other's pointer. That is deliberate: someone trying the demo in two tabs sees a pointer move.
- **A cursor says what it is over** (card, column, or the bare board) and where on it. The overlay finds that element on this screen. It puts every pointer back in place at once on scroll and resize; the spring is only for movement between messages.
- **While dragging, the pointer is tied to the column**, and elements carrying `data-dnd-dragging` or `data-dnd-placeholder` are skipped when looking under it: the held card is always under the pointer.
- **Pointer moves are listened for on `window` in the capture phase**, so that they still arrive while dnd-kit handles a drag.
- **Everything received is parsed** by `parsePresence`. A colour reaches a `style` attribute only as `#rrggbb`. Presence from this browser's own storage goes through `parseUser` too.
- **Guests are known in one place**, `lib/guest-identity.ts`. `session.connect(host, user)` takes any `PresenceUser`, so M5 passes the signed-in user instead.
- **A prop that holds a ref must be named `...Ref`.** Otherwise `react-hooks/preserve-manual-memoization` rejects a `useCallback` that reads `.current`.
- **Measuring hibernation:** wrap `BoardRoom` in a subclass that logs constructions, messages and closes, in a temporary folder with its own wrangler config, and drive it with Node clients (`y-partyserver/provider` works with Node's own WebSocket). Do not save any file under `apps/sync/src` while measuring: `wrangler dev` reloads on every change and every room starts again.
- **The tag is real text inside the card**, so that it is read out with the card. Anything that reads a card's text gets it too: `cardsIn` in the test helpers strips it, and three older two-tab tests failed until it did.
- **In the browser tests,** `silence(page)` followed by closing the context is a tab that dies without saying goodbye. The presence tests passed as soon as the components existed, so each rule was then broken on purpose to see a test fail: no list for a newcomer, no goodbye on close, states sent back, no spring, no anchoring, no throttle, window coordinates, no re-placing on scroll, edits and drags not announced, the guest not kept. Do the same when adding a rule.

## Current status

- Phase: M0, M1 and M2 are merged to `main` (M1 through pull request 1, M2 through pull request 2, both 2026-11-13). M3 stage 1 is merged through pull request 3 (2026-11-14). M3 stage 2 has not started. M4 is merged through pull request 4 (2026-11-16), ahead of M3 stage 2, which is waiting for a Supabase project. M6 was started on 2026-11-16 on branch `m6-motion-polish`, also ahead of M3 stage 2; so far it is planning only.
- Repo: https://github.com/MajdAldeen12/syncboard (public, `origin`).
- The board lives at `/demo` in a Yjs document and syncs through a sync server run locally with `wrangler dev`. Each browser keeps its own copy in IndexedDB, so the board reopens without the server and edits made while disconnected merge on reconnect. The server keeps the document in Durable Object storage. The board also shows who else is on it, their pointers, and who is editing or moving which card; everyone is a guest with a made-up name. Nothing is deployed, and there is no database yet.
- [x] M0 Foundations (repo, CI, tooling)
- [x] M1 Static board with drag and drop: mouse, touch and keyboard drag for cards and columns, inline editing, add and delete. 58 unit tests, 13 Playwright tests.
- [x] M2 State in Yjs, two tabs in sync: Yjs document model and store, live title editing with `Y.Text`, BroadcastChannel provider, board frozen during a drag. 238 unit tests (convergence included), 22 Playwright tests (13 from M1, 9 with two tabs).
- [ ] M3 Sync server + Supabase persistence + offline
  - [x] Stage 1: hibernation spike (passed), `apps/sync`, server provider + IndexedDB, connection status, loading and unavailable states, browser tests in CI. 255 core and 18 sync unit tests, 29 Playwright tests (22 earlier ones now through the server, 7 new).
  - [ ] Stage 2: `packages/db`, Supabase-backed snapshot store, Postgres-from-Worker spike.
- [x] M4 Presence and cursors: avatar stack, live pointers smoothed with a spring, "is editing" and "is moving this" tags, guest names, presence kept across hibernation, pointer traffic limited to 15 messages a second. 354 core and 51 sync unit tests, 46 Playwright tests (the 29 earlier ones, 17 new with two or three browsers). The whole browser suite passed four times in a row (184 runs, 2026-11-16).
- [ ] M5 Auth, sharing, permissions, demo board
- [ ] M6 Motion polish in the app: started on `m6-motion-polish`, nothing built yet (see "Next: M6")
- [ ] M7 GSAP landing page
- [ ] M8 Design pass, accessibility, performance
- [ ] M9 Demo GIF, README, deploy

## Open items

- Bug, older than M2: start dragging a column while a text field that is scrolled out of view has focus (easiest: add a column, leave the add form open, scroll back, drag the first column). The browser scrolls the board back to the focused field as the drag starts, so the column lands several places off. Measured: `scrollLeft` 0 to 540 at pick-up, only when a field is focused; no script calls `focus` or `scrollIntoView`. Likely fix: blur the focused field when a drag begins, or close the add form on blur. `sync.spec.ts` presses Escape to avoid it; remove that when fixed and add a test.
- CI: the `e2e` job passes on GitHub's Linux runners with one worker (first run was pull request 3). Still to try: more than one worker there (`workers` in `apps/web/playwright.config.ts`); the stall that forces one worker may be specific to the Windows machine.
- M3 stage 2: the M3 done check "restarting the sync server restores the board from Supabase" is open. Stage 1 covers the equivalent for Durable Object storage: a room that everyone left is dropped from memory and serves what was saved.
- M5: `DOC_GENERATION` is a constant 1 in `board-session.ts`. Resetting the demo board needs the server to tell the browser the current generation, and the browser to drop a saved copy of an older one.
- M5: the sync server accepts any connection from any origin. Tickets and the origin allowlist are M5; until then it must not be deployed.
- M5: the server refuses a document over 1.5 MB when saving but does not stop it growing. Enforce the size cap on incoming updates.
- M9: a deployment must set `NEXT_PUBLIC_SYNC_HOST`; the default is the local dev address.
- The provider registers an `unload` listener, which Chrome reports as "Permissions policy violation: unload is not allowed". Harmless, from y-partyserver.
- An empty board (every column deleted) counts as content because `meta` is set, so it shows as an empty board, not as loading. Intended.
- While a card or column is held, changes from other people are not drawn for the person holding it. Fine for a mouse drag of a second or two; a keyboard drag can be held for long. Since M4 the others see "… is moving this" on the held card; the holder still gets no "changes waiting" hint.
- M5: presence identity comes from the browser (a guest in `localStorage`). With sign-in, pass the signed-in user to `session.connect`, and decide whether the server should stamp the name and colour from the ticket onto relayed states. Guests cannot choose or change their name.
- M5: add a test that a read-only (viewer) connection's presence is relayed. The room never asks `isReadOnly` for presence, but there is no viewer to test with yet.
- M5: the server does not limit how often a connection sends presence; the 15 a second is the browser's own restraint. Add a per-connection rate limit with the other demo caps.
- M5 or M9, when the sync server is first deployed: repeat the scenarios of `docs/decisions/0002` on Cloudflare, in particular how quickly a client that vanishes without closing (network lost, lid shut) is reported. Until its close is reported that person stays on screen, because nothing times out.
- M6: avatars and pointers appear and disappear without animation. A pointer outside the visible part of the board is simply not visible; consider a marker at the edge.
- M8: people joining and leaving is not announced to screen readers (the avatar list is labelled, the pointers are hidden from assistive technology). Decide whether a polite live region is wanted. More than five people collapse into "+N".
- M8: touch devices report no pointer. Two people editing one card show "Ana and 1 more"; check the wording.
- `y-partyserver` upgrade: `board-session.ts` relies on the provider's `_awarenessUpdateHandler`, and `BoardRoom` bypasses the server's awareness handling. Re-run `presence.spec.ts` and re-read both when the version changes. Worth reporting upstream: awareness states are lost on wake-up, and the provider echoes received states.
- M5: data from other clients is only shape-checked. A malformed `order` key (not a valid fractional index) passes `readBoardState` and makes `orderAtIndex` throw on the next move beside it. Validate keys and ids when reading, before the public demo opens.
- M5: title and description length limits apply to what one client writes. Two people adding text at once can leave a title longer than `MAX_TITLE_LENGTH`; the server only limits total document size.
- M5: `createdBy` on new cards is the string "anonymous" until there are users (`userId` option of `createYjsBoardStore`).
- M8: text typed by someone else that arrives while an input method is composing (Chinese, Japanese, Korean keyboards) replaces the field's value and may interrupt the composition. Hold remote edits until `compositionend`.
- M8: a card or column whose title is empty (possible for a moment while someone retypes it, or after two overlapping deletions) is shown and announced as "Untitled". Check the wording and contrast.
- Cards whose column was deleted are hidden if the board has no column at all, and reappear in the first column that is added. Rare; decide whether to delete them instead.
- M6: card description has no UI yet (the field exists in the model and is a `Y.Text`). Planned with the card detail view; it needs an `editCardDescription` session next to `editCardTitle`.
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
- Work on a branch per milestone (`m1-static-board`, ...), squash-merged to `main` by pull request. One fresh Claude session per milestone has worked well: this file plus `docs/PLAN.md` is enough of a brief.
- Remote changes during a local drag (M2): the board is frozen from drag start until dnd-kit is idle; changes from others are applied to the document at once but drawn afterwards. The drop position is rebased onto the live board by neighbours. Chosen over redrawing mid-drag because dnd-kit moves the same DOM nodes, and over dropping at the raw index because the list may have changed.
- Titles (M2): column titles are `Y.Text` like card titles, a change from the first plan (`docs/PLAN.md` is updated). Editing is live: each keystroke is written and shown to others. Escape takes back only what that edit typed; a blank result is refused the same way.
- `BoardStore` (M2) gained `editCardTitle` and `editColumnTitle`, which return a `TextSession` (`getText`, `splice`, `subscribe`, `commit`, `cancel`). `renameColumn` and `updateCard` remain for setting a finished value. The in-memory store implements sessions too, without merge.
- Deleting a column deletes the cards shown in it, including cards re-homed there because their own column is gone. A card moved out of a column by one person while another deletes that column is deleted: the delete wins.
- Yjs is pinned to 13.6.33 in the `catalog:`. Yjs 14 is still a pre-release (checked 2026-11-13).
- Starting content is written under Yjs client id 1 by `encodeBoardState`; real clients use random 32-bit ids.
- Hibernation (M3): on, after the spike in `docs/decisions/0001-durable-object-hibernation.md` passed with y-partyserver 2.2.0. The Hocuspocus fallback was not needed.
- Stage 1 storage (M3): the Durable Object's own storage instead of the in-memory store first planned. An in-memory store cannot survive hibernation, which was the thing to prove.
- The browser never seeds a board (M3); the sync server does, and stores the seed before serving it. The server-rendered page shows a loading state, not board content.
- Tabs keep the provider's direct BroadcastChannel as well as the server connection (M3): faster between tabs, and works with the server away. The hand-written `broadcast-provider.ts` and the seed fingerprint from M2 are gone.
- Connection status (M3) is one pure function, `syncStatus`, in `packages/core/src/sync-status`: loading, synced, syncing, offline (with or without unsent changes), or unavailable (offline, storage unavailable, board not found). A board that does not exist is never shown, even from a saved copy.
- Browser tests give every test its own board (`test-*`) on a real local sync server rather than mocking it or resetting one shared board (M3). Costs two test-only switches, both off by default.
- The Durable Object is tested through the browser tests, not in workerd unit tests (M3): `@cloudflare/vitest-pool-workers` does not support Vitest 5 yet.
- Install scripts stay off for `esbuild` and `workerd` (M3). Both run from their platform packages.
- Presence across hibernation (M4): the room relays awareness itself and keeps each connection's last state in its WebSocket attachment; no renewal timer. Chosen over restoring the protocol's 15-second renewals (every open tab would wake the room four times a minute) and over asking clients to announce themselves again after a wake. `docs/decisions/0002-presence-and-hibernation.md`.
- Cursor positions (M4) name the card or column the pointer is over, with fractions of its box, and fall back to pixels from the board's corner. A change from the plan's "board coordinates", which go wrong in a column that has scrolled. `docs/decisions/0003-cursor-coordinates.md`.
- Presence is sent at most once per 66 ms per tab, for everything a tab says about itself, not only the pointer (M4).
- One avatar per user id, one pointer per tab; a person's own other tabs are shown as pointers (M4).
- Guests (M4): a name such as "Quiet Otter" and one of ten colours, made up in the browser and kept in `localStorage` under `syncboard:guest`. Every palette colour carries white text at 4.5:1 or better; a test checks it.
- A card someone else is holding shows "… is moving this" (M4), with the same tag as "… is editing". Column titles get the editing tag too.
- `motion` is pinned to 14.10.1 (M4) and so far used only for the spring that smooths pointers. Avatar and pointer enter and exit animation is left to M6.
- `apps/sync` depends on `lib0` directly (M4) for reading and writing awareness messages; `y-protocols` is a test-only dependency of `apps/sync` and `packages/core`, so the tests run against the real protocol.
