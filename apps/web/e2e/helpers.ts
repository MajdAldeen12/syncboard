import { expect, type Locator, type Page } from "@playwright/test";

export const FIRST_CARD = "Drag this card to another column";
export const SECOND_CARD =
  "Press Space on a card, then use the arrow keys to move it";
export const THIRD_CARD = "Double-click a card to edit its text";

export function column(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

// While a card is being dragged or is settling after a drop, dnd-kit leaves a
// hidden copy of it in the list to hold its place. Tests look at real cards.
export const CARD =
  '[data-card-id]:not([aria-hidden="true"]):not([data-dnd-placeholder])';

export function card(page: Page, title: string): Locator {
  return page.locator(CARD).filter({ hasText: title });
}

/** Card titles in a column, top to bottom. */
export async function cardsIn(page: Page, name: string): Promise<string[]> {
  const titles = await column(page, name).locator(CARD).allInnerTexts();
  return titles.map((title) => title.trim());
}

export async function columnNames(page: Page): Promise<(string | null)[]> {
  return page
    .locator("[data-column-id]")
    .evaluateAll((columns) =>
      columns.map((column) => column.getAttribute("aria-label")),
    );
}

export async function centre(
  locator: Locator,
): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element is not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with the mouse in small steps, the way a person would. */
export async function dragWithMouse(
  page: Page,
  from: Locator,
  to: Locator,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): Promise<void> {
  // The board scrolls sideways, for instance after a column is added at its
  // far end. The mouse works in screen coordinates, so bring the item back
  // into view first, as a person would.
  await from.scrollIntoViewIfNeeded();
  const start = await centre(from);
  const end = await centre(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 });
  await page.mouse.move(end.x + offset.x, end.y + offset.y, { steps: 25 });
  await page.mouse.up();
}

/** Lifts the focused card with the keyboard and waits until it is held. */
export async function pickUp(page: Page, title: string): Promise<void> {
  await page.keyboard.press("Space");
  await expect(card(page, title)).toHaveAttribute("data-dnd-dragging", "true");
}

/** Drops the held card with the keyboard and waits until it has settled. */
export async function drop(page: Page, title: string): Promise<void> {
  await page.keyboard.press("Space");
  await expect(card(page, title)).not.toHaveAttribute("data-dnd-dragging");
}

/** The id of a board no other test uses. It starts with the demo content. */
export function newBoardId(): string {
  return `test-${crypto.randomUUID().slice(0, 13)}`;
}

export function boardUrl(boardId: string): string {
  return `/demo?board=${boardId}`;
}

/** The "Synced" / "Syncing" / "Offline" indicator. */
export function syncIndicator(page: Page): Locator {
  return page.locator("[data-sync-status]");
}

/**
 * Opens a board and waits until it has arrived from the sync server. Without
 * a board id the page gets a board of its own; pass the same id to put two
 * pages on one board.
 */
export async function openBoard(
  page: Page,
  boardId: string = newBoardId(),
): Promise<void> {
  await page.goto(boardUrl(boardId));
  // Long enough for one abandoned connection attempt and its retry. On the
  // Windows dev machine a second browser's handshake occasionally hangs.
  await expect(card(page, FIRST_CARD)).toBeVisible({ timeout: 25_000 });
  await expect(syncIndicator(page)).toHaveAttribute(
    "data-sync-status",
    "synced",
  );
}

export async function addCard(
  page: Page,
  columnName: string,
  title: string,
): Promise<void> {
  const target = column(page, columnName);
  await target.getByRole("button", { name: "Add a card" }).click();
  await target.getByRole("textbox", { name: "Card title" }).fill(title);
  await page.keyboard.press("Enter");
}
