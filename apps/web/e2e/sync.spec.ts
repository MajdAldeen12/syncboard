import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_CARD,
  SECOND_CARD,
  THIRD_CARD,
  addCard,
  boardUrl,
  card,
  cardsIn,
  column,
  columnNames,
  dragWithMouse,
  drop,
  newBoardId,
  openBoard,
  pickUp,
} from "./helpers";

const LAST_CARD = "Open the demo board";

// Two tabs of one browser, both on the same board. `page` is the first tab,
// `other` the second.
let boardId: string;
let other: Page;

test.beforeEach(async ({ page, context }) => {
  boardId = newBoardId();
  await openBoard(page, boardId);
  other = await context.newPage();
  await openBoard(other, boardId);
});

async function deleteCard(tab: Page, title: string) {
  await card(tab, title).hover();
  await tab
    .getByRole("button", { name: `Delete card: ${title}`, exact: true })
    .click();
}

async function startEditing(tab: Page, title: string) {
  await tab
    .getByRole("button", { name: `Edit card: ${title}`, exact: true })
    .click();
  await expect(tab.getByRole("textbox")).toBeFocused();
}

test.describe("two tabs mirror each other", () => {
  test("adding and deleting a card", async ({ page }) => {
    await addCard(page, "Done", "Made in the first tab");
    await expect
      .poll(() => cardsIn(other, "Done"))
      .toEqual([LAST_CARD, "Made in the first tab"]);

    await deleteCard(other, "Made in the first tab");
    await expect.poll(() => cardsIn(page, "Done")).toEqual([LAST_CARD]);
  });

  test("moving a card with the keyboard", async ({ page }) => {
    await card(page, FIRST_CARD).focus();
    await pickUp(page, FIRST_CARD);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => cardsIn(page, "In progress")).toContain(FIRST_CARD);
    await drop(page, FIRST_CARD);

    await expect
      .poll(() => cardsIn(other, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD]);
    expect(await cardsIn(other, "In progress")).toEqual(
      await cardsIn(page, "In progress"),
    );
  });

  test("moving a card with the mouse", async ({ page }) => {
    await dragWithMouse(
      other,
      card(other, FIRST_CARD),
      card(other, THIRD_CARD),
      {
        x: 0,
        y: 10,
      },
    );

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD, FIRST_CARD]);
    await expect
      .poll(() => cardsIn(other, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD, FIRST_CARD]);
  });

  test("typing in a card, letter by letter", async ({ page }) => {
    await startEditing(page, FIRST_CARD);
    await page.keyboard.type("Typed live");

    // The other tab sees the text before the edit is finished.
    await expect.poll(() => cardsIn(other, "Backlog")).toContain("Typed live");

    await page.keyboard.press("Enter");
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual(["Typed live", SECOND_CARD, THIRD_CARD]);
  });

  test("taking an edit back with Escape", async ({ page }) => {
    await startEditing(page, FIRST_CARD);
    await page.keyboard.type("A mistake");
    await expect.poll(() => cardsIn(other, "Backlog")).toContain("A mistake");

    await page.keyboard.press("Escape");

    for (const tab of [page, other]) {
      await expect
        .poll(() => cardsIn(tab, "Backlog"))
        .toEqual([FIRST_CARD, SECOND_CARD, THIRD_CARD]);
    }
  });

  test("adding, renaming, reordering and deleting columns", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add a column" }).click();
    await page.getByRole("textbox", { name: "Column title" }).fill("Later");
    await page.keyboard.press("Enter");
    // Close the form. Left open, its field keeps focus, and the browser
    // scrolls the board back to it when a drag starts (see Open items).
    await page.keyboard.press("Escape");
    await expect
      .poll(() => columnNames(other))
      .toEqual(["Backlog", "In progress", "Review", "Done", "Later"]);

    await other.getByRole("button", { name: "Rename column Review" }).click();
    await other
      .getByRole("textbox", { name: "Rename column Review" })
      .fill("Checks");
    await other.keyboard.press("Enter");
    await expect(column(page, "Checks")).toBeVisible();

    await dragWithMouse(
      page,
      page.getByRole("button", { name: "Reorder column Backlog" }),
      column(page, "In progress"),
      { x: 60, y: 0 },
    );
    await expect
      .poll(() => columnNames(other))
      .toEqual(["In progress", "Backlog", "Checks", "Done", "Later"]);

    other.once("dialog", (dialog) => dialog.accept());
    await other.getByRole("button", { name: "Delete column Done" }).click();
    await expect
      .poll(() => columnNames(page))
      .toEqual(["In progress", "Backlog", "Checks", "Later"]);
  });
});

test.describe("two tabs, harder cases", () => {
  test("a tab opened later shows what was done before", async ({
    page,
    context,
  }) => {
    await addCard(page, "Review", "Before the third tab");
    await deleteCard(other, LAST_CARD);
    await expect.poll(() => cardsIn(page, "Done")).toEqual([]);

    const late = await context.newPage();
    await late.goto(boardUrl(boardId));

    await expect
      .poll(() => cardsIn(late, "Review"))
      .toContain("Before the third tab");
    await expect.poll(() => cardsIn(late, "Done")).toEqual([]);

    // And what the late tab does reaches the tabs that were already open.
    await addCard(late, "Done", "From the third tab");
    for (const tab of [page, other]) {
      await expect
        .poll(() => cardsIn(tab, "Done"))
        .toEqual(["From the third tab"]);
    }
  });

  test("both tabs typing in the same title keep their words and their place", async ({
    page,
  }) => {
    // The first tab types at the start of the title.
    await startEditing(page, LAST_CARD);
    await page.keyboard.press("Home");
    await page.keyboard.type("A ");
    await expect.poll(() => cardsIn(other, "Done")).toEqual([`A ${LAST_CARD}`]);

    // The second tab types at the end of the same title.
    await startEditing(other, `A ${LAST_CARD}`);
    await other.keyboard.press("End");
    await other.keyboard.type(" Z");
    await expect(page.getByRole("textbox")).toHaveValue(`A ${LAST_CARD} Z`);

    // The first tab's caret is still where it was typing, not at the end.
    await page.keyboard.type("B ");
    await expect(page.getByRole("textbox")).toHaveValue(`A B ${LAST_CARD} Z`);
    await expect(other.getByRole("textbox")).toHaveValue(`A B ${LAST_CARD} Z`);

    await page.keyboard.press("Enter");
    await other.keyboard.press("Enter");
    for (const tab of [page, other]) {
      await expect
        .poll(() => cardsIn(tab, "Done"))
        .toEqual([`A B ${LAST_CARD} Z`]);
    }
  });

  test("changes from the other tab wait while a card is held, then both agree", async ({
    page,
  }) => {
    await card(page, FIRST_CARD).focus();
    await pickUp(page, FIRST_CARD);

    // Meanwhile the other tab changes the same column.
    await addCard(other, "Backlog", "Added meanwhile");
    await deleteCard(other, SECOND_CARD);
    await expect
      .poll(() => cardsIn(other, "Backlog"))
      .toEqual([FIRST_CARD, THIRD_CARD, "Added meanwhile"]);

    // The tab holding the card keeps showing the board as it was. There is
    // nothing to wait for here, so give the change time to arrive.
    await page.waitForTimeout(500);
    expect(await cardsIn(page, "Backlog")).toEqual([
      FIRST_CARD,
      SECOND_CARD,
      THIRD_CARD,
    ]);

    // Drop the card below the third one.
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, FIRST_CARD, THIRD_CARD]);
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD, FIRST_CARD]);
    await drop(page, FIRST_CARD);

    // It lands below the third card, where it was dropped, not at the same
    // row number: the list above it got shorter and a card was added below.
    for (const tab of [page, other]) {
      await expect
        .poll(() => cardsIn(tab, "Backlog"))
        .toEqual([THIRD_CARD, FIRST_CARD, "Added meanwhile"]);
    }
    await expect(card(page, FIRST_CARD)).toBeFocused();
  });
});
