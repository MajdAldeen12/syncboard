import { expect, test, type Page } from "@playwright/test";
import { CARD, openBoard } from "./helpers";

const HEADLINE = "Move a card, and it moves for everyone.";
const TOUR = [
  "See who is here",
  "Keep working offline",
  "Drag with a mouse, a finger or the keyboard",
  "Try it without an account",
];

/** Waits until the page is drawing frames (none come for a second or so after loading). */
async function framesRunning(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const frame = () => {
          frames += 1;
          if (frames === 3) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

/** How every animated part of the pictures is drawn right now. */
function pictureState(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const state: Record<string, string> = {};
    for (const element of document.querySelectorAll("[data-sketch]")) {
      const style = getComputedStyle(element);
      state[element.getAttribute("data-sketch")!] =
        `${style.transform}|${style.opacity}`;
    }
    return state;
  });
}

/** Scrolls each step of the tour to the middle of the window, in turn. */
async function readTheTour(page: Page): Promise<void> {
  const steps = page.locator("[data-tour-steps] > section");
  for (let i = 0; i < (await steps.count()); i += 1) {
    await steps
      .nth(i)
      .evaluate((step) => step.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(400);
  }
}

/** Layout shift so far, as Lighthouse counts it (not after input). */
function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          })[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(total), 100);
      }),
  );
}

test.describe("the landing page", () => {
  test("says what SyncBoard is, even without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: HEADLINE }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open the demo board" }),
    ).toBeVisible();
    for (const title of TOUR) {
      await expect(page.getByRole("heading", { name: title })).toBeAttached();
    }
    await expect(
      page.getByRole("heading", { name: "How it is built" }),
    ).toBeAttached();
    await expect(
      page.getByRole("img", { name: /^Quiet Otter's screen/ }),
    ).toBeVisible();
    // The pictures are complete in the HTML. Only what the drawing itself
    // leaves out (a tag nobody shows yet, a shadow) may be invisible.
    const hiddenByStyle = await page
      .locator("[data-sketch]")
      .evaluateAll((elements) =>
        elements
          .filter(
            (element) =>
              getComputedStyle(element).opacity === "0" &&
              element.getAttribute("opacity") !== "0",
          )
          .map((element) => element.getAttribute("data-sketch")),
      );
    expect(hiddenByStyle).toEqual([]);
    await context.close();
  });

  test("leads to the demo board", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Open the demo board" }).click();

    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 25_000 });
  });

  test("keeps GSAP off the board", async ({ page }) => {
    // GSAP records its version on `window` as soon as it loads.
    const gsapVersions = () =>
      page.evaluate(
        () => (window as { gsapVersions?: string[] }).gsapVersions ?? null,
      );
    await page.goto("/");
    await expect.poll(gsapVersions).not.toBeNull();

    // A fresh page load, so nothing is left over from the landing page.
    await openBoard(page);
    expect(await gsapVersions()).toBeNull();
  });

  test("animates the hero and follows the scroll through the tour", async ({
    page,
  }) => {
    await page.goto("/");
    await framesRunning(page);
    const before = await pictureState(page);
    await page.waitForTimeout(2500);
    const hero = await pictureState(page);
    const heroMoved = Object.keys(before).filter(
      (key) => key.startsWith("a-") && before[key] !== hero[key],
    );
    expect(heroMoved.length).toBeGreaterThan(0);

    await readTheTour(page);
    const toured = await pictureState(page);
    const tourMoved = Object.keys(hero).filter(
      (key) => key.startsWith("t-") && hero[key] !== toured[key],
    );
    expect(tourMoved.length).toBeGreaterThan(0);
  });

  test("stays still with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await framesRunning(page);
    const before = await pictureState(page);

    await page.waitForTimeout(2500);
    await readTheTour(page);
    const after = await pictureState(page);

    expect(after).toEqual(before);
  });

  test("does not shift its layout, moving or still", async ({ page }) => {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      await page.emulateMedia({ reducedMotion });
      await page.goto("/");
      await framesRunning(page);
      await page.waitForTimeout(1000);
      await readTheTour(page);

      expect(await layoutShift(page), reducedMotion).toBeLessThan(0.01);
    }
  });
});
