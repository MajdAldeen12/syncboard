import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { boardUrl, centre } from "./helpers";

// A measurement, not a check: timings depend on the machine. It runs only
// when asked for: PERF=1 pnpm --filter @syncboard/web exec playwright test e2e/perf.spec.ts
// The result is written up in docs/decisions/0004-drag-performance.md.
test.skip(!process.env.PERF, "A measurement; run it with PERF=1.");

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

interface FrameReport {
  frames: number;
  seconds: number;
  framesPerSecond: number;
  medianMs: number;
  p95Ms: number;
  worstMs: number;
  /** Frames that took longer than 1.5 vsync intervals, i.e. at least one frame was missed. */
  missed: number;
}

function report(times: number[]): FrameReport {
  const gaps = times.slice(1).map((time, i) => time - times[i]!);
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const seconds = (times.at(-1)! - times[0]!) / 1000;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    frames: gaps.length,
    seconds: round(seconds),
    framesPerSecond: round(gaps.length / seconds),
    medianMs: round(at(0.5)),
    p95Ms: round(at(0.95)),
    worstMs: round(sorted.at(-1)!),
    missed: gaps.filter((gap) => gap > 25).length,
  };
}

test("dragging a card across a board of 200 cards", async ({ page }) => {
  test.setTimeout(120_000);
  const boardId = `test-large-${crypto.randomUUID().slice(0, 8)}`;
  await page.goto(boardUrl(boardId));
  await expect(
    page.locator('[data-card-id="large-column-1-card-3"]'),
  ).toBeVisible({ timeout: 25_000 });
  await expect(page.locator("[data-card-id]")).toHaveCount(200);
  await framesRunning(page);

  const debug = await page.context().newCDPSession(page);
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
  await page.evaluate(() => {
    const state = window as unknown as {
      __frames: number[];
      __recording: boolean;
    };
    state.__frames = [];
    state.__recording = true;
    const frame = (time: number) => {
      state.__frames.push(time);
      if (state.__recording) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  // Pick up the third card of the first column and carry it slowly, over
  // about three seconds, to the middle of the third column, then let go.
  const from = await centre(
    page.locator('[data-card-id="large-column-1-card-3"]'),
  );
  const to = await centre(
    page.locator('[data-card-id="large-column-3-card-6"]'),
  );
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
  const steps = 180;
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / steps;
    // Down the first column a little, then across.
    const y =
      from.y +
      ((to.y - from.y) * step) / steps +
      Math.sin((step / steps) * Math.PI) * 120;
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  // The drop animation and the board settling afterwards.
  await page.waitForTimeout(800);

  const times = await page.evaluate(() => {
    const state = window as unknown as {
      __frames: number[];
      __recording: boolean;
    };
    state.__recording = false;
    return state.__frames;
  });

  const done = new Promise<string>((resolve) =>
    debug.once("Tracing.tracingComplete", (event) => resolve(event.stream!)),
  );
  await debug.send("Tracing.end");
  const stream = await done;
  let trace = "";
  for (;;) {
    const chunk = await debug.send("IO.read", { handle: stream });
    trace += chunk.base64Encoded
      ? Buffer.from(chunk.data, "base64").toString()
      : chunk.data;
    if (chunk.eof) break;
  }
  await debug.send("IO.close", { handle: stream });
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/perf-drag-200-cards.trace.json", trace);

  const result = report(times);
  console.log("PERF", JSON.stringify(result));
  // The card landed in the third column.
  await expect(
    page.locator(
      '[data-column-id="large-column-3"] [data-card-id="large-column-1-card-3"]',
    ),
  ).toHaveCount(1);
  expect(result.framesPerSecond).toBeGreaterThan(55);
});
