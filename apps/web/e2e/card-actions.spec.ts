import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_CARD,
  SECOND_CARD,
  THIRD_CARD,
  card,
  cardsIn,
  centre,
  column,
  newBoardId,
  openBoard,
  pickUp,
} from "./helpers";

// Opening and deleting cards: by mouse, keyboard and touch, and taking a
// deletion back.

function toast(page: Page) {
  return page.locator("[data-undo-toast]");
}

async function deleteWithMouse(page: Page, title: string) {
  await card(page, title).hover();
  await page
    .getByRole("button", { name: `Delete card: ${title}`, exact: true })
    .click();
}

test.describe("taking back a deleted card", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("Undo puts the card back where it was", async ({ page }) => {
    await deleteWithMouse(page, SECOND_CARD);
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([FIRST_CARD, THIRD_CARD]);
    await expect(toast(page)).toContainText(`Card deleted: ${SECOND_CARD}`);

    await toast(page).getByRole("button", { name: "Undo" }).click();

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([FIRST_CARD, SECOND_CARD, THIRD_CARD]);
    await expect(toast(page)).toBeHidden();
    await expect(card(page, SECOND_CARD)).toBeFocused();
  });

  test("Ctrl+Z puts it back too, but not while typing", async ({ page }) => {
    await card(page, FIRST_CARD).focus();
    await page
      .getByRole("button", { name: `Delete card: ${FIRST_CARD}` })
      .press("Enter");
    await expect(toast(page)).toBeVisible();

    // In a text field, Ctrl+Z belongs to the field.
    const add = column(page, "Done").getByRole("button", {
      name: "Add a card",
    });
    await add.click();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(toast(page)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.keyboard.press("ControlOrMeta+Z");
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([FIRST_CARD, SECOND_CARD, THIRD_CARD]);
  });

  test("the offer goes after a while, and the card stays deleted", async ({
    page,
  }) => {
    // Real time: Playwright's fake clock also holds back the animation
    // frames the toast leaves with, so it would never finish leaving.
    await deleteWithMouse(page, THIRD_CARD);
    await expect(toast(page)).toBeVisible();
    // Away from the toast: pointing at it would keep it.
    await page.mouse.move(5, 5);

    await page.waitForTimeout(5000);
    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toBeHidden({ timeout: 5000 });
    expect(await cardsIn(page, "Backlog")).toEqual([FIRST_CARD, SECOND_CARD]);
  });

  test("a card can be deleted from its dialog, and taken back", async ({
    page,
  }) => {
    await card(page, FIRST_CARD).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: FIRST_CARD });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Delete card" }).click();

    await expect(dialog).toBeHidden();
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD]);
    // Focus goes to the card that took its place.
    await expect(card(page, SECOND_CARD)).toBeFocused();
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([FIRST_CARD, SECOND_CARD, THIRD_CARD]);
  });
});

test.describe("opening a card", () => {
  test("Enter opens a card, Space picks it up", async ({ page }) => {
    await openBoard(page);
    await card(page, FIRST_CARD).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: FIRST_CARD });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(card(page, FIRST_CARD)).toBeFocused();

    await pickUp(page, FIRST_CARD);
    await expect(dialog).toBeHidden();
    await page.keyboard.press("Escape");
  });
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

  test("a tap opens the card, and hidden buttons cannot be hit", async ({
    page,
  }) => {
    await openBoard(page);
    const target = card(page, FIRST_CARD);
    const box = (await target.boundingBox())!;

    // The top right corner, where the card's buttons appear on hover. A
    // finger there must not hit an invisible Delete button.
    const hit = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest("button")?.ariaLabel ?? null,
      { x: box.x + box.width - 10, y: box.y + 10 },
    );
    expect(hit).toBeNull();

    await page.touchscreen.tap(box.x + box.width - 10, box.y + 10);

    const dialog = page.getByRole("dialog", { name: FIRST_CARD });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Delete card" }),
    ).toBeVisible();
    expect(await cardsIn(page, "Backlog")).toContain(FIRST_CARD);
  });
});

test.describe("the board's header", () => {
  test("says who this person is, and how to see the board sync", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const hint = page.locator("[data-self-hint]");
    const name = await page
      .locator('[data-presence-person][data-self="true"]')
      .getAttribute("data-user-name");
    await expect(hint).toContainText(`You are ${name}`);
    await expect(hint.getByRole("button", { name: "Copy link" })).toBeVisible();

    // With someone else here, there is no need to ask.
    const other = await browser.newContext();
    await openBoard(await other.newPage(), boardId);
    await expect(hint.getByRole("button", { name: "Copy link" })).toHaveCount(
      0,
    );
    await expect(hint).toContainText(`You are ${name}`);
    await other.close();
  });

  test("four columns and Add a column fit in a 1280-pixel window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBoard(page);
    const board = (await page.locator("[data-board-scroll]").boundingBox())!;
    const add = (await page
      .getByRole("button", { name: "Add a column" })
      .boundingBox())!;
    // Its icon and its words, about 110 pixels, are in sight.
    expect(add.x + 110).toBeLessThan(board.x + board.width);
    // One bar across the top, not two.
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Demo board" }),
    ).toBeVisible();
    expect((await centre(page.getByRole("banner"))).y).toBeLessThan(30);
  });
});
