import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  FIRST_CARD,
  SECOND_CARD,
  THIRD_CARD,
  card,
  cardsIn,
  column,
  columnNames,
  drop,
  openBoard,
  pickUp,
} from "./helpers";

// Using the board with the keyboard alone, and what a screen reader is told
// on the way. Nothing in this file clicks or hovers.

/** Presses Tab (or Shift+Tab) until `target` has focus, as a person would. */
async function tabTo(
  page: Page,
  target: Locator,
  { backwards = false, limit = 80 } = {},
): Promise<void> {
  await expect(target).toBeAttached();
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  throw new Error(`${target} could not be reached with the Tab key`);
}

/** What the board last told a screen reader about a drag. */
function announcement(page: Page): Locator {
  return page.locator("[data-drag-announcer]");
}

/** The element that has keyboard focus. */
function focused(page: Page): Locator {
  return page.locator(":focus");
}

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test.describe("what a screen reader is told during a drag", () => {
  test("a card is described by its title and its place", async ({ page }) => {
    await card(page, FIRST_CARD).focus();

    await pickUp(page, FIRST_CARD);
    await expect(announcement(page)).toHaveText(
      `Picked up card: ${FIRST_CARD}. Column Backlog, position 1 of 3.`,
    );

    await page.keyboard.press("ArrowDown");
    await expect(announcement(page)).toHaveText(
      "Column Backlog, position 2 of 3.",
    );

    await page.keyboard.press("ArrowRight");
    await expect(announcement(page)).toHaveText(
      /^Column In progress, position [1-3] of 3\.$/,
    );

    await drop(page, FIRST_CARD);
    await expect(announcement(page)).toHaveText(
      /^Dropped card: Drag this card to another column\. Column In progress, position [1-3] of 3\.$/,
    );
    // Never the internal ids the drag-and-drop library would read out.
    await expect(announcement(page)).not.toContainText("seed-");
  });

  test("a cancelled move says where the card went back to", async ({
    page,
  }) => {
    await card(page, SECOND_CARD).focus();
    await pickUp(page, SECOND_CARD);
    await page.keyboard.press("ArrowRight");
    await expect(announcement(page)).toHaveText(/^Column In progress/);

    await page.keyboard.press("Escape");
    await expect(announcement(page)).toHaveText(
      `Move cancelled. ${SECOND_CARD} is back in column Backlog, position 2 of 3.`,
    );
  });

  test("a column is described by its title and its place", async ({ page }) => {
    const handle = page.getByRole("button", { name: "Reorder column Backlog" });
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(announcement(page)).toHaveText(
      "Picked up column: Backlog. Position 1 of 4.",
    );

    await page.keyboard.press("ArrowRight");
    await expect(announcement(page)).toHaveText("Position 2 of 4.");

    await page.keyboard.press("Space");
    await expect(announcement(page)).toHaveText(
      "Dropped column: Backlog. Position 2 of 4.",
    );
    await expect
      .poll(() => columnNames(page))
      .toEqual(["In progress", "Backlog", "Review", "Done"]);
  });

  test("cards and handles say how to move them", async ({ page }) => {
    const instructions = /Press Space to pick it up/;
    await expect(card(page, FIRST_CARD)).toHaveAccessibleDescription(
      instructions,
    );
    await expect(
      page.getByRole("button", { name: "Reorder column Backlog" }),
    ).toHaveAccessibleDescription(instructions);
  });
});

test.describe("where focus goes", () => {
  test("closing the add-a-card form returns to its button", async ({
    page,
  }) => {
    const add = column(page, "Done").getByRole("button", {
      name: "Add a card",
    });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(
      column(page, "Done").getByRole("textbox", { name: "Card title" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");

    await expect(add).toBeFocused();
  });

  test("deleting a card moves focus to the next card", async ({ page }) => {
    const remove = page.getByRole("button", {
      name: `Delete card: ${FIRST_CARD}`,
    });
    await remove.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => cardsIn(page, "Backlog")).not.toContain(FIRST_CARD);
    await expect(card(page, SECOND_CARD)).toBeFocused();
  });

  test("deleting the last card of a column moves focus to the one before", async ({
    page,
  }) => {
    const remove = page.getByRole("button", {
      name: `Delete card: ${THIRD_CARD}`,
    });
    await remove.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => cardsIn(page, "Backlog")).not.toContain(THIRD_CARD);
    await expect(card(page, SECOND_CARD)).toBeFocused();
  });

  test("deleting a column's only card moves focus to its add button", async ({
    page,
  }) => {
    const remove = column(page, "Review").getByRole("button", {
      name: /^Delete card: /,
    });
    await remove.focus();
    await page.keyboard.press("Enter");

    await expect(
      column(page, "Review").getByRole("button", { name: "Add a card" }),
    ).toBeFocused();
  });

  test("deleting a column moves focus to the next column", async ({ page }) => {
    await page
      .getByRole("button", { name: "Delete column Review" })
      .press("Enter");
    const confirm = page.getByRole("dialog", { name: 'Delete "Review"?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete column" }).press("Enter");

    await expect(confirm).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Reorder column Done" }),
    ).toBeFocused();
  });

  test("deleting the last column moves focus to the one before", async ({
    page,
  }) => {
    // Empty, so it goes without a question.
    await column(page, "Done")
      .getByRole("button", { name: /^Delete card: / })
      .press("Enter");
    await page
      .getByRole("button", { name: "Delete column Done" })
      .press("Enter");

    await expect.poll(() => columnNames(page)).not.toContain("Done");
    await expect(
      page.getByRole("button", { name: "Reorder column Review" }),
    ).toBeFocused();
  });
});

test("a keyboard-only walkthrough: create, move, edit, open, delete", async ({
  page,
}) => {
  // Sharing a board is part of the plan's walkthrough but does not exist
  // until M5 (sign-in and sharing). It is left out here, not faked.
  test.info().annotations.push({
    type: "deferred",
    description: "Sharing a board: arrives with M5.",
  });
  const title = "Typed without a mouse";
  const backlog = column(page, "Backlog");

  // Create: from the top of the page to Backlog's "Add a card".
  const add = backlog.getByRole("button", { name: "Add a card" });
  await tabTo(page, add);
  await page.keyboard.press("Enter");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect.poll(() => cardsIn(page, "Backlog")).toContain(title);
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();

  // Move: back to the new card, then into the next column.
  await tabTo(page, card(page, title), { backwards: true });
  await pickUp(page, title);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => cardsIn(page, "In progress")).toContain(title);
  await drop(page, title);
  await expect(card(page, title)).toBeFocused();
  await expect.poll(() => cardsIn(page, "Backlog")).not.toContain(title);

  // Edit its title.
  const renamed = "Edited without a mouse";
  await tabTo(page, page.getByRole("button", { name: `Edit card: ${title}` }));
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: `Edit card: ${title}` }),
  ).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(renamed);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: `Edit card: ${renamed}` }),
  ).toBeFocused();
  await expect.poll(() => cardsIn(page, "In progress")).toContain(renamed);

  // Open it and write a description.
  await tabTo(
    page,
    page.getByRole("button", { name: `Open card: ${renamed}` }),
    {
      backwards: true,
    },
  );
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: renamed });
  await expect(dialog).toBeVisible();
  await tabTo(page, dialog.getByRole("textbox", { name: "Description" }));
  await page.keyboard.type("Written with the keyboard.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card(page, renamed)).toBeFocused();

  // Delete it.
  await tabTo(
    page,
    page.getByRole("button", { name: `Delete card: ${renamed}` }),
  );
  await page.keyboard.press("Enter");
  await expect.poll(() => cardsIn(page, "In progress")).not.toContain(renamed);
  // Focus stays in the column, on a card or its add button.
  await expect(column(page, "In progress").locator(":focus")).toHaveCount(1);
  await expect(focused(page)).toHaveCount(1);
});
