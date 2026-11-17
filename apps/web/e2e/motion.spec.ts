import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  FIRST_CARD,
  SECOND_CARD,
  THIRD_CARD,
  card,
  cardsIn,
  drop,
  newBoardId,
  openBoard,
  pickUp,
} from "./helpers";

interface Track {
  /** How many frames were sampled. */
  readonly samples: number;
  /** Distinct positions in the order they were seen. */
  readonly positions: number[];
  readonly from: number;
  readonly to: number;
  /** Positions strictly between the start and the end. */
  readonly between: number;
  /** The largest move from one frame to the next. */
  readonly largestStep: number;
}

/**
 * Starts recording where a card is drawn, once per frame. Returns once
 * frames are arriving: headless Chromium draws no frames for a second or
 * so after the board has opened, and a change made in that time would be
 * missed.
 */
async function startTracking(page: Page, title: string): Promise<void> {
  await page.evaluate(
    (title) =>
      new Promise<void>((resolve) => {
        const state = window as unknown as {
          __track: number[];
          __tracking: boolean;
        };
        state.__track = [];
        state.__tracking = true;
        const find = () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              "[data-card-id]:not([data-dnd-placeholder])",
            ),
          ].find((element) => element.innerText.includes(title));
        const frame = () => {
          if (!state.__tracking) return;
          const element = find();
          if (element) state.__track.push(element.getBoundingClientRect().top);
          if (state.__track.length === 3) resolve();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    title,
  );
}

async function stopTracking(page: Page): Promise<Track> {
  const samples = await page.evaluate(() => {
    const state = window as unknown as {
      __track: number[];
      __tracking: boolean;
    };
    state.__tracking = false;
    return state.__track;
  });

  const positions = samples.filter(
    (value, index) =>
      index === 0 || Math.abs(value - samples[index - 1]!) > 0.5,
  );
  const from = positions[0]!;
  const to = positions.at(-1)!;
  const low = Math.min(from, to) + 0.5;
  const high = Math.max(from, to) - 0.5;
  const steps = positions
    .slice(1)
    .map((value, i) => Math.abs(value - positions[i]!));
  return {
    samples: samples.length,
    positions,
    from,
    to,
    between: positions.filter((value) => value > low && value < high).length,
    largestStep: Math.max(0, ...steps),
  };
}

/** Moves the first card one place down, by keyboard, in `page`. */
async function moveFirstCardDown(page: Page): Promise<void> {
  await card(page, FIRST_CARD).focus();
  await pickUp(page, FIRST_CARD);
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => cardsIn(page, "Backlog"))
    .toEqual([SECOND_CARD, FIRST_CARD, THIRD_CARD]);
  await drop(page, FIRST_CARD);
}

async function watchRemoteReorder(
  watcher: Page,
  browser: Browser,
  reducedMotion: "reduce" | "no-preference",
): Promise<Track> {
  // The watcher samples where the card is drawn; the mover, in a browser of
  // its own, makes the change.
  await watcher.emulateMedia({ reducedMotion });
  const boardId = newBoardId();
  await openBoard(watcher, boardId);
  const otherBrowser = await browser.newContext();
  const mover = await otherBrowser.newPage();
  await openBoard(mover, boardId);

  await startTracking(watcher, FIRST_CARD);
  await moveFirstCardDown(mover);
  await expect
    .poll(() => cardsIn(watcher, "Backlog"))
    .toEqual([SECOND_CARD, FIRST_CARD, THIRD_CARD]);
  // Long enough for the slide to finish.
  await watcher.waitForTimeout(700);
  const track = await stopTracking(watcher);
  await otherBrowser.close();
  return track;
}

const opacity = (locator: Locator) =>
  locator.evaluate((element) => Number(getComputedStyle(element).opacity));

test.describe("picking up and setting down", () => {
  test("a held card is lifted and settles again when let go", async ({
    page,
  }) => {
    await openBoard(page);
    const shadow = card(page, FIRST_CARD).locator("[data-lift-shadow]");
    expect(await opacity(shadow)).toBe(0);

    await card(page, FIRST_CARD).focus();
    await pickUp(page, FIRST_CARD);
    await expect.poll(() => opacity(shadow)).toBe(1);

    await page.keyboard.press("Escape");
    await expect.poll(() => opacity(shadow)).toBe(0);
  });

  test("a held column is lifted too", async ({ page }) => {
    await openBoard(page);
    const handle = page.getByRole("button", { name: "Reorder column Backlog" });
    const shadow = page
      .locator("[data-column-id]")
      .filter({ has: handle })
      .locator(":scope > [data-lift-shadow]");

    await handle.focus();
    await page.keyboard.press("Space");
    await expect.poll(() => opacity(shadow)).toBe(1);

    await page.keyboard.press("Escape");
    await expect.poll(() => opacity(shadow)).toBe(0);
  });
});

test.describe("a reorder made by someone else", () => {
  test("slides into place instead of jumping", async ({ page, browser }) => {
    const track = await watchRemoteReorder(page, browser, "no-preference");

    const distance = track.to - track.from;
    expect(distance, JSON.stringify(track)).toBeGreaterThan(20);
    // Drawn at several places on the way, never more than half the way in
    // one frame.
    expect(track.between, JSON.stringify(track)).toBeGreaterThanOrEqual(4);
    expect(track.largestStep, JSON.stringify(track)).toBeLessThan(distance / 2);
  });

  test("moves at once when reduced motion is asked for", async ({
    page,
    browser,
  }) => {
    const track = await watchRemoteReorder(page, browser, "reduce");

    expect(track.to - track.from, JSON.stringify(track)).toBeGreaterThan(20);
    expect(track.between, JSON.stringify(track)).toBe(0);
  });
});

/**
 * Starts noting every transform seen on elements matching `selector`, once
 * per frame. Returns once frames are arriving (see `startTracking`).
 */
async function startSampling(page: Page, selector: string): Promise<void> {
  await page.evaluate(
    (selector) =>
      new Promise<void>((resolve) => {
        const state = window as unknown as {
          __seen: string[];
          __sampling: boolean;
        };
        state.__seen = [];
        state.__sampling = true;
        let frames = 0;
        const frame = () => {
          if (!state.__sampling) return;
          for (const element of document.querySelectorAll(selector)) {
            const transform = getComputedStyle(element).transform;
            if (!state.__seen.includes(transform)) state.__seen.push(transform);
          }
          frames += 1;
          if (frames === 3) resolve();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    selector,
  );
}

/** Stops sampling, and returns the transforms that moved something. */
async function stopSampling(page: Page): Promise<string[]> {
  const seen = await page.evaluate(() => {
    const state = window as unknown as {
      __seen: string[];
      __sampling: boolean;
    };
    state.__sampling = false;
    return state.__seen;
  });
  return seen.filter(
    (transform) =>
      transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)",
  );
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  const moves = reducedMotion === "no-preference";
  const what = moves ? "moves" : "only fades, with reduced motion";

  test.describe(`motion with prefers-reduced-motion: ${reducedMotion}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
    });

    test(`the card dialog ${what}`, async ({ page }) => {
      await openBoard(page);
      await startSampling(page, "[data-modal-panel]");
      await card(page, FIRST_CARD).hover();
      await page
        .getByRole("button", { name: `Open card: ${FIRST_CARD}`, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.waitForTimeout(400);
      const moved = await stopSampling(page);

      if (moves) expect(moved.length).toBeGreaterThan(0);
      else expect(moved).toEqual([]);
    });

    test(`a page reached from the home page ${what}`, async ({ page }) => {
      await page.goto("/");
      await startSampling(page, "[data-page-enter]");
      await page.getByRole("link", { name: "Open the demo board" }).click();
      await expect(page.locator("[data-page-enter]")).toBeVisible();
      await page.waitForTimeout(500);
      const moved = await stopSampling(page);

      if (moves) expect(moved.length).toBeGreaterThan(0);
      else expect(moved).toEqual([]);
    });

    test(`someone arriving ${what}`, async ({ page, browser }) => {
      const boardId = newBoardId();
      await openBoard(page, boardId);
      await startSampling(
        page,
        "[data-presence-person], [data-presence-cursor-body]",
      );
      const otherBrowser = await browser.newContext();
      const other = await otherBrowser.newPage();
      await openBoard(other, boardId);
      await expect(page.locator("[data-presence-person]")).toHaveCount(2);
      const box = await card(other, SECOND_CARD).boundingBox();
      await other.mouse.move(box!.x + 20, box!.y + 10, { steps: 4 });
      await expect(page.locator("[data-presence-cursor-body]")).toHaveCount(1);
      await page.waitForTimeout(400);
      const moved = await stopSampling(page);
      await otherBrowser.close();

      if (moves) expect(moved.length).toBeGreaterThan(0);
      else expect(moved).toEqual([]);
    });
  });
}
