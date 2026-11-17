import { expect, test, type Page } from "@playwright/test";
import { FIRST_CARD, card, newBoardId, openBoard } from "./helpers";

function cardDialog(page: Page, title = FIRST_CARD) {
  return page.getByRole("dialog", { name: title });
}

function description(page: Page) {
  return page.getByRole("textbox", { name: "Description" });
}

/** Presses Tab until `target` has focus, as a keyboard user would. */
async function tabTo(page: Page, target: ReturnType<Page["locator"]>) {
  for (let presses = 0; presses < 8; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/** Opens a card's dialog with the mouse. */
async function openWithMouse(page: Page, title = FIRST_CARD) {
  await card(page, title).hover();
  await page
    .getByRole("button", { name: `Open card: ${title}`, exact: true })
    .click();
  await expect(cardDialog(page, title)).toBeVisible();
}

test.describe("a card opened on its own", () => {
  test("works by keyboard alone, and hands focus back to the card", async ({
    page,
  }) => {
    await openBoard(page);
    await card(page, FIRST_CARD).focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: `Open card: ${FIRST_CARD}` }),
    ).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = cardDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("In Backlog");
    await tabTo(page, description(page));
    await page.keyboard.type("Steps: open the app");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("then drag.");
    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(card(page, FIRST_CARD)).toBeFocused();
    await expect(
      card(page, FIRST_CARD).getByRole("img", { name: "Has a description" }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(description(page)).toHaveValue(
      "Steps: open the app\nthen drag.",
    );
  });

  test("keeps focus inside while it is open", async ({ page }) => {
    await openBoard(page);
    await openWithMouse(page);

    for (let presses = 0; presses < 8; presses += 1) {
      await page.keyboard.press("Tab");
      const onTheBoard = await page.evaluate(
        () => document.activeElement?.closest("[data-board-scroll]") !== null,
      );
      expect(onTheBoard).toBe(false);
    }
  });

  test("works with the mouse, and closes from outside the panel", async ({
    page,
  }) => {
    await openBoard(page);
    await openWithMouse(page);
    await description(page).click();
    await page.keyboard.type("Typed with the mouse in hand");
    await cardDialog(page).getByRole("button", { name: "Close" }).click();
    await expect(cardDialog(page)).toBeHidden();

    await openWithMouse(page);
    await expect(description(page)).toHaveValue("Typed with the mouse in hand");
    // A click on the dimmed board around the panel closes it too.
    await page.mouse.click(8, 8);
    await expect(cardDialog(page)).toBeHidden();
  });

  test("renames the card from inside", async ({ page }) => {
    await openBoard(page);
    await openWithMouse(page);
    await page
      .getByRole("button", { name: `Edit title: ${FIRST_CARD}` })
      .click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Renamed in the dialog");
    await page.keyboard.press("Enter");

    await expect(cardDialog(page, "Renamed in the dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page, "Renamed in the dialog")).toBeVisible();
  });
});

test.describe("two people on one card", () => {
  test("both keep their words in the description", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const otherBrowser = await browser.newContext();
    const other = await otherBrowser.newPage();
    await openBoard(other, boardId);

    await openWithMouse(page);
    await openWithMouse(other);
    await description(page).click();
    await page.keyboard.type("Alpha beta");
    await expect(description(other)).toHaveValue("Alpha beta");

    // Both type at once: one at the start, the other at the end.
    await description(other).click();
    await other.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+Home");
    await Promise.all([
      page.keyboard.type("Start: ", { delay: 30 }),
      other.keyboard.type(" gamma", { delay: 30 }),
    ]);

    for (const tab of [page, other]) {
      await expect(description(tab)).toHaveValue("Start: Alpha beta gamma");
    }
    await otherBrowser.close();
  });

  test("closes when someone else deletes the card", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const otherBrowser = await browser.newContext();
    const other = await otherBrowser.newPage();
    await openBoard(other, boardId);

    await openWithMouse(page);
    await card(other, FIRST_CARD).hover();
    await other
      .getByRole("button", { name: `Delete card: ${FIRST_CARD}`, exact: true })
      .click();

    await expect(cardDialog(page)).toBeHidden();
    await otherBrowser.close();
  });
});
