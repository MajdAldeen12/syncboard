# 0004: Dragging on a board of 200 cards

- **Date:** 2026-11-17
- **Status:** measured
- **Milestone:** M6

## Question

The M6 done check: dragging on a board with 200 cards holds 60 frames a second in a Chrome performance trace. M6 added a layout animation that measures every card before and after each board render, so it also had to be shown not to slow dragging down.

## How it was measured

`apps/web/e2e/perf.spec.ts`, which runs only when asked for:

```bash
PERF=1 pnpm --filter @syncboard/web exec playwright test e2e/perf.spec.ts
```

- A test board named `test-large-*`, which the test sync server seeds with four columns of 50 cards (`apps/sync/src/seed.ts`).
- One mouse drag: the third card of the first column is picked up, carried down and across over about 12 seconds in 180 steps, and dropped in the middle of the third column. The page then settles for 0.8 s.
- Recorded at once: a Chrome trace through the DevTools protocol (`devtools.timeline` and frame categories), saved to `apps/web/test-results/perf-drag-200-cards.trace.json` (about 38 MB, not committed), and the time of every animation frame in the page.
- Machine: Intel Core i5-13420H (8 cores, 12 threads), 16 GB, Windows 11. Headless Chromium from Playwright 1.65.0. No CPU throttling.

## Results

Three runs. "Dropped" is Chrome's own `DroppedFrame` count in the trace.

| Run | Layout animation | Frames | Frames per second | Dropped | Main-thread tasks over 16.7 ms                                                           |
| --- | ---------------- | ------ | ----------------- | ------- | ---------------------------------------------------------------------------------------- |
| 1   | on               | 712    | 60.0              | 7       | 30 ms at pick-up, 22 ms crossing into a column, 26 ms at the drop, 18 ms of test tooling |
| 2   | on               | 700    | 59.9              | 5       | 49 ms at pick-up, 21 ms crossing into a column                                           |
| 3   | off              | 728    | 60.0              | 3       | 29 ms at pick-up, 23 ms crossing into a column                                           |

In run 1, 99% of all main-thread tasks took 4.5 ms or less; layout took 32 ms in total and never more than 3.7 ms at once.

## What this means

- **The drag itself holds 60 frames a second.** Between pick-up and drop, frames were missed only as the card crossed into another column: once for each column crossed (at about 3 s and 8 s in every run), plus one single unexplained frame early in run 1.
- **The few dropped frames sit at transitions**: one or two at pick-up, one for each column the card crosses into, and sometimes one at the drop. That is under 1% of the frames.
- **The pick-up and column-crossing costs predate M6.** They are the same with the layout animation switched off (run 3): dnd-kit setting up the drag and React drawing the board in its drag state. Worth looking at in M8.
- **The layout animation costs nothing during a drag**, because it is off then, and at most one dropped frame when a drop settles: it measures 200 cards twice, and the style recalculation that forces would otherwise happen one frame later.

## Not covered

- A slower machine, a phone, or CPU throttling. The numbers here are from a fast laptop.
- A keyboard drag, and a drag with another person changing the board at the same time.
- Boards much larger than 200 cards.
