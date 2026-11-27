# 0006: Accessibility checks, the design pass, and 500 cards

- **Date:** 2026-11-27
- **Status:** measured
- **Milestone:** M8

## Question

The M8 done checks:

- axe reports no serious or critical issues on `/` and `/demo`, checked in Playwright.
- A keyboard-only walkthrough succeeds: create, move across columns, edit, share.
- Lighthouse accessibility is 95 or higher on both pages.
- A 500-card board stays responsive.

Each check needed a decision about what exactly to measure, and some needed changes before they could pass honestly.

## Decisions

### axe must actually see the board

- **The pointer layer is invisible; the pointers on it are visible.** The first axe run on `/demo` passed with nothing to report. Its "incomplete" list said why: every piece of text on the board was "overlapped by another element", so its contrast was never checked. The overlapped text was 23 elements; 1 element was actually checked.
  - The culprit was the layer that draws other people's pointers: `absolute inset-0` over the whole board, `pointer-events: none` and empty. Browsers ignore it; axe's stacking model does not.
  - It is now `visibility: hidden`, with each pointer `visibility: visible`. With that, 20 elements were checked.
- **`e2e/a11y.spec.ts` fails when text cannot be checked for contrast because something covers it.** Without this guard, the same mistake would pass silently again. Two exceptions are filtered out, each with its reason in the test:
  - Words inside the landing page's SVG drawings. They sit on drawn shapes that axe cannot see through, and the drawings are labelled images.
  - A card or column while it is held. dnd-kit lifts it into a layer whose order axe does not work out. The same text, in the same colours, is checked when it is not held.
- **Checked:**
  - `/` and `/demo`, in light and dark.
  - The card dialog and the delete-column dialog.
  - A board with another person on it (pointer, avatars, an "is editing" tag).
  - A board with a card held.
  - A board that cannot be loaded.
- **Rules:** WCAG 2.0, 2.1 and 2.2 A and AA, plus axe's best practices.
- **Result:** no violations of any impact, serious or minor.

### Contrast axe cannot measure, measured by hand

axe skips text it considers too short to judge. Single-digit card counts are an example. It also skips icons. These were worked out from the colours:

| What                                        | Was                           | Ratio | Now                 | Ratio         |
| ------------------------------------------- | ----------------------------- | ----- | ------------------- | ------------- |
| Card count (light, on zinc-100)             | zinc-500                      | 4.4:1 | zinc-600            | 7.1:1         |
| Card count (dark, on zinc-900)              | zinc-500                      | 3.7:1 | zinc-400            | 6.7:1         |
| Grip and trash icons (light)                | zinc-400                      | 2.4:1 | zinc-500            | 4.3:1         |
| Description icon on a card (light)          | zinc-400                      | 2.6:1 | zinc-500            | 4.8:1         |
| "Untitled" placeholder (light, on a column) | zinc-400                      | 2.4:1 | zinc-600 italic     | 7.1:1         |
| "In column" line in the card dialog (dark)  | zinc-500                      | 3.7:1 | zinc-400            | 6.7:1         |
| Input placeholders                          | browser default (about 3.5:1) |       | zinc-500 / zinc-400 | 4.5:1 or more |

Icons need 3:1 (WCAG 1.4.11) and text 4.5:1 (1.4.3).

### Screen readers

- **dnd-kit's Accessibility plugin is switched off and replaced** (`features/board/drag-announcer.tsx`).
  - Its announcements read internal ids, such as "Draggable item seed-column-1-card-1 was moved over droppable target…".
  - It also set the deprecated `aria-grabbed` on every card, and `aria-pressed` on column handles, which made them read as toggle buttons.
  - The replacement is a polite live region in the board's own words: "Picked up card: Write the intro. Column Backlog, position 1 of 3." Then "Column In progress, position 2 of 4." Then "Dropped card: …" or "Move cancelled. … is back in column Backlog, position 1 of 3."
  - A position is read 150 ms after the item comes to rest. By then dnd-kit and React have both re-ordered the list, so the number matches the screen. A keyboard move rests at once; a mouse sweeping across the board is not narrated card by card.
  - A cancelled move announces the place recorded when the card was picked up, not dnd-kit's `initialGroup`. A card carried into another column is re-created there, and the new sortable's "initial" place is where it was re-created. Reading that announced the wrong column.
- **Cards are `role="group"` with `aria-roledescription="card"`,** so they are read as "Write the intro, card" rather than "…, group". Their `aria-describedby` points to instructions: "Press Enter to open it. Press Space to pick it up, the arrow keys to move it…". Column handles point to the same moving instructions.
- **Enter opens a card; only Space picks it up.** dnd-kit's default starts a drag on Enter as well. Enter on a card now opens its dialog, which is what a card's main action should be.
- **People arriving and leaving are announced** in a polite live region: "Ana joined the board.", "Bo joined the board. Ana left the board.", "4 people joined the board.". The people already on the board when this tab joins are listed by the avatars and not announced.
- **The "… is editing" tag names everyone:** "Ana and Bo are editing", "Ana and 2 others are editing", "Ana is moving this, Bo is editing". It was "Ana and 1 more", which did not say what they were doing.
- **Not done: a review with a real screen reader.** The words were checked in the accessibility tree and by the browser tests, but not by listening to NVDA, JAWS or VoiceOver. Repeat with one before the public launch (M9).

### Focus

- Deleting a card moves focus to the card after it, else the one before, else the column's "Add a card" button. Deleting a column moves focus to the next column's handle, else the previous one's, else "Add a column". Closing an "Add a card" form returns focus to its button.
- **The keyboard-only walkthrough** is a browser test that never touches the mouse. It goes from the top of the page by Tab and then:
  1. Adds a card.
  2. Moves it into another column.
  3. Renames it.
  4. Opens it and writes a description.
  5. Deletes it, and checks where focus lands.

  Sharing is in the plan's walkthrough but does not exist until M5. The test records it as deferred rather than faking it.

### Input methods

Japanese, Chinese and Korean keyboards compose a word in the field before committing it.

- **While a composition is in progress, the field is left alone in both directions.** Half-composed text is not sent, and other people's edits wait. Setting the field's value mid-composition throws the composition away.
- **On `compositionend`, the composed word is carried over the edits that waited** (`rebaseSplice` in `packages/core/src/text-binding`) and both go in.

The browser test drives a real composition through the DevTools protocol (`Input.imeSetComposition`).

### Bundles

- Each page's server-rendered HTML loads only its own library:
  - `/` loads GSAP and not Yjs.
  - `/demo` loads Yjs and not GSAP.
- The check is `e2e/bundles.spec.ts`. It fetches the chunks named in each page's HTML and looks for text each library keeps after minification: `gsapVersions` for GSAP, `__ $YJS$ __` for Yjs.
- **Each page also downloaded the other's library, through link prefetching:**
  - The board's link to the home page fetched GSAP (126 KB). That link is no longer prefetched, and a test checks that the board downloads no GSAP.
  - The landing page's "Open the demo board" link still prefetches the board's code. That is likely to be the next click. A test checks that Yjs never runs on the landing page.

## Design pass

An Impeccable critique scored the landing page 24/32 and the board 24/40, as two independent assessments: a design review, and a detector with browser evidence. Impeccable keeps its snapshots locally, outside the repository; the findings that mattered are recorded here. The owner chose to fix P0 to P2, keep the brand as it is, and protect card deletion with an undo.

**Board:**

- **P0: on touch screens, the card's hidden buttons could be tapped.** The toolbar is shown on hover, which touch screens do not have. While hidden, it was invisible but still caught taps: a tap at a card's top right corner deleted it for everyone.
  - The toolbar now takes no pointer events while hidden.
  - A tap on a card opens it. dnd-kit needs a 250 ms rest before a touch drag, so a quick tap is never a drag.
  - The card dialog has a "Delete card" button.
- **P1: deleting a card is now undoable.**
  - Delete uses a trash icon. Before, it was an "×", the same as Close.
  - An "Card deleted: … Undo" toast stays 8 seconds, longer while pointed at or focused, and Ctrl+Z (Cmd+Z) also works outside text fields.
  - `BoardStore.deleteCard` returns a function that puts the card back as it was: same id, column, order and text. This is in the store contract, so both stores are tested.
  - It is not `Y.UndoManager`. Nobody else can change a card that is gone, so re-inserting it loses nothing of anyone's, and it needs no listener per deletion.
- **P2: one header bar instead of two.** It holds the wordmark, the board's name, "You are Quiet Otter", the avatars and the sync status.
  - When alone on the board, it also says to open the board in another browser to watch it sync, and offers to copy the link.
- **P2: columns are 16rem everywhere.** That fits four columns and "Add a column" in a 1280-pixel window, where "Add a column" used to be cut off.
  - The width is fixed rather than changing with the window, on purpose. A pointer over the bare board is sent in pixels from the board's corner (`0003`). A responsive width put it 64 pixels off on a narrower screen, and a test caught it.

**Landing page:**

- **P1: on a phone, the hero now waits until both screens are in view before it plays.** Before, the second screen, where the sync shows, was below the fold, and the story was over before anyone scrolled to it.
- **P1: larger words in the drawings.**
  - Tags: 6.5 to 7 units. 7.5 was tried and ran past the column's edge.
  - Pointer names: 7.5 to 8.5 units.
  - Avatar initials: 6.5 to 7.5 units.
- **P2: a closing call to action.** "See it for yourself", with "Open the demo board".
- **P2: tour steps are shorter.** 55svh on a phone, 65svh on a wide screen.
- **P3: the demo link has one label everywhere.**

**Left for later**, recorded in `CLAUDE.md`:

- The brand (the owner's choice).
- A "Replay" for the hero.
- A step indicator in the tour.
- Scroll snapping between columns on a phone.

## Lighthouse accessibility

Lighthouse 13.6.0 ran on a production build served by `next start`, with the local sync server running so that `/demo` shows the board. It ran with `--only-categories=accessibility`, in its default mobile mode and with `--preset=desktop`.

| Page    | Mobile | Desktop |
| ------- | ------ | ------- |
| `/`     | 100    | 100     |
| `/demo` | 100    | 100     |

The full-page screenshot in the `/demo` report shows the loaded board, not the loading state.

## Performance: 200 and 500 cards

### How it was measured

`apps/web/e2e/perf.spec.ts`, as in 0004, extended:

```bash
PERF=1 pnpm --filter @syncboard/web exec playwright test e2e/perf.spec.ts
```

- **Boards.** `test-large-*` has 200 cards (4 columns of 50). `test-huge-*` has 500 (5 columns of 100). The test sync server seeds both.
- **CPU.** Each board is measured as the machine is, and again with Chrome's CPU slowed 4 times (`Emulation.setCPUThrottlingRate`), which stands in for a mid-range phone.
- **A mouse drag**, as in 0004: one card carried across two columns in 180 steps over about 3 seconds, at 1600 by 900. It records frames per second, frames missed (a gap over 25 ms), and long tasks (over 50 ms) at pick-up, while carried, and at the drop.
- **A keyboard drag**: Space, ArrowRight twice, Space, 600 ms apart. The browser's Event Timing API times each key press from input to the next frame drawn after handling it. That is the measure behind Interaction to Next Paint (INP), where 200 ms or less is "good".
- **Playwright's own trace is off for this file.** In the first runs it copied the whole page into a snapshot on every one of the 180 mouse steps, in the page's main thread. With 500 cards that was two thirds of all the work recorded. 0004's numbers carried a little of it too ("18 ms of test tooling").
- **Machine:** Intel Core i5-13420H, 16 GB, Windows 11, on mains power, Playwright's headless Chromium.
  - On battery the same runs took about four times as long, and every number was worse. An A/B under battery power showed the branch and `main` alike: 200 cards at 58.2 and 58.9 frames a second, 500 at 53.2 and 52.2. So nothing in M8 slowed the drag down.

### Results

Three runs of each, on mains power, after all M8 changes:

| Cards | CPU | Frames per second | Frames missed | Pick-up task  | Long tasks while carried | Worst key press  |
| ----- | --- | ----------------- | ------------- | ------------- | ------------------------ | ---------------- |
| 200   | 1x  | 60.0, 60.0, 60.0  | 0, 0, 0       | none          | none                     | 24, 16, 16 ms    |
| 500   | 1x  | 59.7, 59.7, 59.7  | 1, 2, 2       | 52 to 53 ms   | none                     | 32, 32, 32 ms    |
| 200   | 4x  | 58.7, 58.6, 58.1  | 2, 3, 8       | 128 to 144 ms | 2 (up to 151 ms)         | 88, 80, 160 ms   |
| 500   | 4x  | 52.5, 53.6, 47.9  | 61, 60, 103   | 263 to 276 ms | 5 to 28 (up to 291 ms)   | 192, 192, 456 ms |

### What this means

- **The M8 check is met.** Measured the way 0004 measured 200 cards (no throttling), a 500-card board holds 59.7 frames a second while a card is dragged. Picking up costs one 53 ms task, and no key press took longer than 32 ms.
- **200 cards is at least as good as in 0004.** No task reached 50 ms at pick-up, while carried, or at the drop, and no gap between frames exceeded 25 ms in three runs. 0004 counted 3 to 7 dropped frames per run, at pick-up and at each column crossed. The two counts are not the same measure: 0004 used Chrome's own `DroppedFrame` events, this record uses gaps between animation frames. Part of 0004's cost was Playwright's trace in the page.
- **At 4x slowdown, 200 cards stays fluid** at 58 to 59 frames a second, and key presses stay under 200 ms.
- **500 cards at 4x is where it strains:**
  - It drags at 48 to 54 frames a second.
  - Picking up takes a quarter of a second.
  - One key press in twelve took over 200 ms (456 ms at worst, a drop).
- **Where the time goes at 4x.** A CPU profile of the carried part of the drag (`PERF_PROFILE=1`) shows the app's own JavaScript, dnd-kit's included, at a few percent. Most of the time is the browser's own work:
  - Compositing the held card as it moves.
  - dnd-kit's IntersectionObserver pair per droppable (a thousand observers for 500 cards).
  - Hit-testing (`elementFromPoint`).

  The next step, if bigger boards matter, is fewer droppables during a drag. Columns could render only the cards in view, but dnd-kit's sortable lists make virtualising hard. Recorded in `CLAUDE.md` under "Open items".

- **A bug was found on the way.** `DragDropProvider` takes `plugins` and `sensors` as a list or as a function of the defaults. A function is called on every render and its result compared by identity, so every board update handed a new list to every draggable.
  - The first version of the announcer passed functions.
  - The "slides into place" motion test caught it: a remote reorder's first frame came about 100 ms late.
  - Both are now module constants.

## Not covered

- A real phone, and a real screen reader (VoiceOver, NVDA): both before the public launch in M9.
- Boards beyond 500 cards.
- A drag while someone else changes the board.
