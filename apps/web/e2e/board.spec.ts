import { expect, test, type Locator, type Page } from "@playwright/test";

const FIRST_CARD = "Drag this card to another column";
const SECOND_CARD = "Press Space on a card, then use the arrow keys to move it";
const THIRD_CARD = "Double-click a card to edit its text";

function column(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

// While a card is being dragged or is settling after a drop, dnd-kit leaves a
// hidden copy of it in the list to hold its place. Tests look at real cards.
const CARD =
  '[data-card-id]:not([aria-hidden="true"]):not([data-dnd-placeholder])';

function card(page: Page, title: string): Locator {
  return page.locator(CARD).filter({ hasText: title });
}

/** Card titles in a column, top to bottom. */
async function cardsIn(page: Page, name: string): Promise<string[]> {
  const titles = await column(page, name).locator(CARD).allInnerTexts();
  return titles.map((title) => title.trim());
}

async function columnNames(page: Page): Promise<(string | null)[]> {
  return page
    .locator("[data-column-id]")
    .evaluateAll((columns) =>
      columns.map((column) => column.getAttribute("aria-label")),
    );
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element is not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with the mouse in small steps, the way a person would. */
async function dragWithMouse(
  page: Page,
  from: Locator,
  to: Locator,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): Promise<void> {
  const start = await centre(from);
  const end = await centre(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 });
  await page.mouse.move(end.x + offset.x, end.y + offset.y, { steps: 25 });
  await page.mouse.up();
}

/** Lifts the focused card with the keyboard and waits until it is held. */
async function pickUp(page: Page, title: string): Promise<void> {
  await page.keyboard.press("Space");
  await expect(card(page, title)).toHaveAttribute("data-dnd-dragging", "true");
}

/** Drops the held card with the keyboard and waits until it has settled. */
async function drop(page: Page, title: string): Promise<void> {
  await page.keyboard.press("Space");
  await expect(card(page, title)).not.toHaveAttribute("data-dnd-dragging");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/demo");
  await expect(card(page, FIRST_CARD)).toBeVisible();
});

test.describe("dragging with the mouse", () => {
  test("moves a card to another column", async ({ page }) => {
    await dragWithMouse(
      page,
      card(page, FIRST_CARD),
      column(page, "Review").locator(CARD).first(),
    );

    await expect.poll(() => cardsIn(page, "Review")).toContain(FIRST_CARD);
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD]);
  });

  test("reorders cards within a column", async ({ page }) => {
    await dragWithMouse(page, card(page, FIRST_CARD), card(page, THIRD_CARD), {
      x: 0,
      y: 10,
    });

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD, FIRST_CARD]);
  });

  test("moves a card into an empty column", async ({ page }) => {
    // Empty the Review column first.
    await column(page, "Review").locator(CARD).hover();
    await column(page, "Review")
      .getByRole("button", { name: /^Delete card: / })
      .click();
    await expect.poll(() => cardsIn(page, "Review")).toEqual([]);

    await dragWithMouse(page, card(page, FIRST_CARD), column(page, "Review"));

    await expect.poll(() => cardsIn(page, "Review")).toEqual([FIRST_CARD]);
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD]);
  });

  test("reorders columns by their handle", async ({ page }) => {
    await dragWithMouse(
      page,
      page.getByRole("button", { name: "Reorder column Backlog" }),
      column(page, "In progress"),
      { x: 60, y: 0 },
    );

    await expect
      .poll(() => columnNames(page))
      .toEqual(["In progress", "Backlog", "Review", "Done"]);
  });
});

test.describe("dragging with the keyboard", () => {
  test("moves a card down, then across to the next column", async ({
    page,
  }) => {
    await card(page, FIRST_CARD).focus();

    // Each step waits for what a person would see before pressing the next
    // key: the card lifting, the card moving, the card settling.
    await pickUp(page, FIRST_CARD);
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, FIRST_CARD, THIRD_CARD]);
    await drop(page, FIRST_CARD);

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, FIRST_CARD, THIRD_CARD]);
    await expect(card(page, FIRST_CARD)).toBeFocused();

    await pickUp(page, FIRST_CARD);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => cardsIn(page, "In progress")).toContain(FIRST_CARD);
    await drop(page, FIRST_CARD);

    await expect.poll(() => cardsIn(page, "In progress")).toContain(FIRST_CARD);
    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([SECOND_CARD, THIRD_CARD]);
    // Focus follows the card into its new column.
    await expect(card(page, FIRST_CARD)).toBeFocused();
  });

  test("Escape puts the card back", async ({ page }) => {
    await card(page, FIRST_CARD).focus();

    await pickUp(page, FIRST_CARD);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => cardsIn(page, "In progress")).toContain(FIRST_CARD);
    await page.keyboard.press("Escape");

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([FIRST_CARD, SECOND_CARD, THIRD_CARD]);
    await expect
      .poll(() => cardsIn(page, "In progress"))
      .not.toContain(FIRST_CARD);
  });
});

test.describe("dragging by touch", () => {
  test.use({ hasTouch: true });

  test("moves a card to another column", async ({ page }) => {
    const start = await centre(card(page, FIRST_CARD));
    const end = await centre(column(page, "Review").locator(CARD).first());
    const client = await page.context().newCDPSession(page);
    const touch = (type: string, x: number, y: number) =>
      client.send("Input.dispatchTouchEvent", {
        type: type as "touchStart",
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });

    await touch("touchStart", start.x, start.y);
    // A touch has to rest on the card briefly before it becomes a drag.
    await page.waitForTimeout(400);
    for (let step = 1; step <= 20; step++) {
      await touch(
        "touchMove",
        start.x + ((end.x - start.x) * step) / 20,
        start.y + ((end.y - start.y) * step) / 20,
      );
      await page.waitForTimeout(16);
    }
    await touch("touchEnd", end.x, end.y);

    await expect.poll(() => cardsIn(page, "Review")).toContain(FIRST_CARD);
  });
});

test.describe("editing", () => {
  const editName = { name: `Edit card: ${FIRST_CARD}`, exact: true };

  test("renames a card with the edit button", async ({ page }) => {
    await page.getByRole("button", editName).click();
    const field = page.getByRole("textbox", editName);
    await field.fill("Renamed card");
    await field.press("Enter");

    await expect.poll(() => cardsIn(page, "Backlog")).toContain("Renamed card");
    // Focus returns to the edit button, not to the top of the page.
    await expect(
      page.getByRole("button", {
        name: "Edit card: Renamed card",
        exact: true,
      }),
    ).toBeFocused();
  });

  test("renames a card by double-clicking it", async ({ page }) => {
    await card(page, FIRST_CARD).dblclick();
    const field = page.getByRole("textbox", editName);
    await field.fill("Renamed by double-click");
    await page.getByRole("heading", { name: "Demo board" }).click();

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toContain("Renamed by double-click");
  });

  test("Escape discards an edit", async ({ page }) => {
    await page.getByRole("button", editName).click();
    const field = page.getByRole("textbox", editName);
    await field.fill("Should not be saved");
    await field.press("Escape");

    await expect
      .poll(() => cardsIn(page, "Backlog"))
      .toEqual([FIRST_CARD, SECOND_CARD, THIRD_CARD]);
  });

  test("renames a column", async ({ page }) => {
    await page.getByRole("button", { name: "Rename column Backlog" }).click();
    const field = page.getByRole("textbox", { name: "Rename column Backlog" });
    await field.fill("Ideas");
    await field.press("Enter");

    await expect(column(page, "Ideas")).toBeVisible();
  });

  test("adds and deletes a card", async ({ page }) => {
    const done = column(page, "Done");
    await done.getByRole("button", { name: "Add a card" }).click();
    await done.getByRole("textbox", { name: "Card title" }).fill("New card");
    await page.keyboard.press("Enter");

    await expect.poll(() => cardsIn(page, "Done")).toContain("New card");

    await card(page, "New card").hover();
    await page
      .getByRole("button", { name: "Delete card: New card", exact: true })
      .click();

    await expect.poll(() => cardsIn(page, "Done")).not.toContain("New card");
  });

  test("deletes a column after confirmation", async ({ page }) => {
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete column Review" }).click();

    await expect
      .poll(() => columnNames(page))
      .toEqual(["Backlog", "In progress", "Done"]);
  });
});
