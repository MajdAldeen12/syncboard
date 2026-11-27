import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { boardUrl, centre } from "./helpers";

// A measurement, not a check: timings depend on the machine. It runs only
// when asked for:
//   PERF=1 pnpm --filter @syncboard/web exec playwright test e2e/perf.spec.ts
// The results are written up in docs/decisions/0004-drag-performance.md
// (200 cards, M6) and docs/decisions/0006-accessibility-and-performance.md
// (200 and 500 cards, with CPU throttling, M8).
test.skip(!process.env.PERF, "A measurement; run it with PERF=1.");

// With PERF_PROFILE=1 as well, the JavaScript run while the card is carried
// is sampled and saved as a .cpuprofile next to the traces, which DevTools
// opens in its Performance panel.
const PROFILE = Boolean(process.env.PERF_PROFILE);

// Playwright's own trace copies the whole page into a snapshot on every
// mouse step, in the page's main thread: on 500 cards that was two thirds
// of all the work measured. The DevTools trace below is all that is needed.
test.use({ trace: "off" });

/** The boards measured: the test sync server seeds them (apps/sync/src/seed.ts). */
const BOARDS = [
  { cards: 200, prefix: "test-large-", columns: 4, perColumn: 50 },
  { cards: 500, prefix: "test-huge-", columns: 5, perColumn: 100 },
] as const;

/** 1 is this machine as it is; 4 is Chrome's "4x slowdown", a mid-range phone. */
const SLOWDOWNS = [1, 4] as const;

/** Waits until the page is drawing frames (none come for a second or so after loading). */
async function framesRunning(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const frame = () => {
          frames += 1;
          if (frames === 5) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

interface Recording {
  frames: number[];
  longTasks: { start: number; duration: number }[];
  events: { name: string; key: string; duration: number }[];
  marks: { name: string; at: number }[];
}

/** Starts recording frames, long tasks and slow input events in the page. */
async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recording = {
      frames: [] as number[],
      longTasks: [] as { start: number; duration: number }[],
      events: [] as { name: string; key: string; duration: number }[],
      marks: [] as { name: string; at: number }[],
      on: true,
    };
    (window as unknown as { __perf: typeof recording }).__perf = recording;
    const frame = (time: number) => {
      recording.frames.push(time);
      if (recording.on) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recording.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ type: "longtask" });
    // Event Timing: from the input to the next frame drawn after handling
    // it, the measure behind Interaction to Next Paint.
    const lastKey = new Map<number, string>();
    addEventListener(
      "keydown",
      (event) => lastKey.set(Math.round(event.timeStamp), event.key),
      true,
    );
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        recording.events.push({
          name: entry.name,
          key: lastKey.get(Math.round(entry.startTime)) ?? "",
          duration: entry.duration,
        });
      }
    }).observe({
      type: "event",
      durationThreshold: 16,
    } as PerformanceObserverInit);
  });
}

async function mark(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => {
    (window as unknown as { __perf: Recording }).__perf.marks.push({
      name,
      at: performance.now(),
    });
  }, name);
}

async function stopRecording(page: Page): Promise<Recording> {
  return page.evaluate(() => {
    const recording = (
      window as unknown as { __perf: Recording & { on: boolean } }
    ).__perf;
    recording.on = false;
    return recording;
  });
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Frames per second and frames missed between two marks. */
function framesBetween(recording: Recording, from: string, to: string) {
  const start = recording.marks.find((each) => each.name === from)!.at;
  const end = recording.marks.find((each) => each.name === to)!.at;
  const times = recording.frames.filter((time) => time >= start && time <= end);
  const gaps = times.slice(1).map((time, i) => time - times[i]!);
  const seconds = (times.at(-1)! - times[0]!) / 1000;
  return {
    framesPerSecond: round(gaps.length / seconds),
    // A gap longer than 1.5 vsync intervals means at least one frame missed.
    missed: gaps.filter((gap) => gap > 25).length,
    worstFrameMs: round(Math.max(...gaps)),
  };
}

/** Long tasks between two marks, labelled by the step they fall in. */
function longTasksBetween(recording: Recording, from: string, to: string) {
  const start = recording.marks.find((each) => each.name === from)!.at;
  const end = recording.marks.find((each) => each.name === to)!.at;
  return recording.longTasks
    .filter((task) => task.start >= start && task.start <= end)
    .map((task) => round(task.duration));
}

async function trace(debug: CDPSession, file: string): Promise<void> {
  const done = new Promise<string>((resolve) =>
    debug.once("Tracing.tracingComplete", (event) => resolve(event.stream!)),
  );
  await debug.send("Tracing.end");
  const stream = await done;
  let text = "";
  for (;;) {
    const chunk = await debug.send("IO.read", { handle: stream });
    text += chunk.base64Encoded
      ? Buffer.from(chunk.data, "base64").toString()
      : chunk.data;
    if (chunk.eof) break;
  }
  await debug.send("IO.close", { handle: stream });
  mkdirSync("test-results", { recursive: true });
  writeFileSync(file, text);
}

for (const board of BOARDS) {
  for (const slowdown of SLOWDOWNS) {
    test(`dragging on a board of ${board.cards} cards, CPU ${slowdown}x slower`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 1600, height: 900 });
      const boardId = `${board.prefix}${crypto.randomUUID().slice(0, 8)}`;
      await page.goto(boardUrl(boardId));
      const cardId = (column: number, index: number) =>
        `large-column-${column}-card-${index}`;
      await expect(
        page.locator(`[data-card-id="${cardId(1, 3)}"]`),
      ).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("[data-card-id]")).toHaveCount(board.cards);
      await framesRunning(page);

      const debug = await page.context().newCDPSession(page);
      await debug.send("Emulation.setCPUThrottlingRate", { rate: slowdown });
      await debug.send("Tracing.start", {
        categories: [
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "disabled-by-default-devtools.timeline.frame",
          "blink.user_timing",
          "toplevel",
        ].join(","),
        transferMode: "ReturnAsStream",
      });
      await startRecording(page);

      // 1. A mouse drag: the third card of the first column, carried down
      //    a little and across into the middle of the third column, over
      //    about 3 seconds.
      const from = await centre(
        page.locator(`[data-card-id="${cardId(1, 3)}"]`),
      );
      const to = await centre(page.locator(`[data-card-id="${cardId(3, 6)}"]`));
      await mark(page, "mouse-start");
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
      await mark(page, "picked-up");
      if (PROFILE) {
        await debug.send("Profiler.enable");
        await debug.send("Profiler.setSamplingInterval", { interval: 200 });
        await debug.send("Profiler.start");
      }
      const steps = 180;
      for (let step = 1; step <= steps; step += 1) {
        const x = from.x + ((to.x - from.x) * step) / steps;
        const y =
          from.y +
          ((to.y - from.y) * step) / steps +
          Math.sin((step / steps) * Math.PI) * 120;
        await page.mouse.move(x, y);
        await page.waitForTimeout(16);
      }
      await mark(page, "carried");
      if (PROFILE) {
        const { profile } = await debug.send("Profiler.stop");
        mkdirSync("test-results", { recursive: true });
        writeFileSync(
          `test-results/perf-drag-${board.cards}-cards-${slowdown}x.cpuprofile`,
          JSON.stringify(profile),
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(1000);
      await mark(page, "mouse-end");

      // 2. A keyboard drag: pick a card up, move it across two columns,
      //    drop it. Each key press is one interaction, timed by the browser.
      await page.locator(`[data-card-id="${cardId(2, 2)}"]`).focus();
      await mark(page, "keys-start");
      for (const key of ["Space", "ArrowRight", "ArrowRight", "Space"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(600);
      }
      await mark(page, "keys-end");

      const recording = await stopRecording(page);
      await debug.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await trace(
        debug,
        `test-results/perf-drag-${board.cards}-cards-${slowdown}x.trace.json`,
      );

      const keyEvents = recording.events.filter(
        (event) => event.name === "keydown",
      );
      const result = {
        cards: board.cards,
        slowdown,
        mouseDrag: {
          ...framesBetween(recording, "picked-up", "carried"),
          longTasksAtPickUpMs: longTasksBetween(
            recording,
            "mouse-start",
            "picked-up",
          ),
          longTasksWhileCarriedMs: longTasksBetween(
            recording,
            "picked-up",
            "carried",
          ),
          longTasksAtDropMs: longTasksBetween(
            recording,
            "carried",
            "mouse-end",
          ),
          pointerEventsMs: recording.events
            .filter((event) => event.name.startsWith("pointer"))
            .map((event) => `${event.name} ${round(event.duration)}`),
        },
        keyboardDrag: {
          // Key presses slower than 16 ms, as the browser timed them.
          keydownMs: keyEvents.map(
            (event) => `${event.key || "?"} ${round(event.duration)}`,
          ),
          worstKeydownMs: round(
            Math.max(0, ...keyEvents.map((event) => event.duration)),
          ),
          longTasksMs: longTasksBetween(recording, "keys-start", "keys-end"),
        },
      };
      console.log("PERF", JSON.stringify(result));

      // The mouse drag landed the card in the third column.
      await expect(
        page.locator(
          `[data-column-id="large-column-3"] [data-card-id="${cardId(1, 3)}"]`,
        ),
      ).toHaveCount(1);
    });
  }
}
