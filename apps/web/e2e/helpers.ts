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
  return column(page, name)
    .locator(CARD)
    .evaluateAll((cards) =>
      cards.map((card) => {
        // A card someone else is editing or holding carries a tag saying
        // so. The tag is not part of the title.
        const tag = card.querySelector<HTMLElement>("[data-presence-activity]");
        const text = (card as HTMLElement).innerText;
        return (tag ? text.replace(tag.innerText, "") : text).trim();
      }),
    );
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

// --- Presence ---------------------------------------------------------------

/** The avatars of the people on the board, this browser's own first. */
export function people(page: Page): Locator {
  return page.locator("[data-presence-person]");
}

/** The made-up name this browser goes by. */
export async function ownName(page: Page): Promise<string> {
  const name = await page
    .locator('[data-presence-person][data-self="true"]')
    .getAttribute("data-user-name");
  if (!name) throw new Error("This browser has no name yet");
  return name;
}

/** Another person's pointer, as drawn on this page. */
export function cursorOf(page: Page, name: string): Locator {
  return page.locator(`[data-presence-cursor][data-user-name="${name}"]`);
}

/** Where the tip of another person's pointer is drawn on this page. */
export async function cursorTip(
  page: Page,
  name: string,
): Promise<{ x: number; y: number }> {
  const box = await cursorOf(page, name).boundingBox();
  if (!box) throw new Error(`${name}'s cursor is not on screen`);
  return { x: box.x, y: box.y };
}

/** The "… is editing" or "… is moving this" tag on a card or column. */
export function activityOn(item: Locator): Locator {
  return item.locator("[data-presence-activity]");
}

/**
 * Makes the page unable to send anything more. Closing it afterwards is
 * what a crashed tab or a pulled network cable looks like from the server:
 * the connection just ends, with no goodbye from the app.
 */
export async function silence(page: Page): Promise<void> {
  await page.evaluate(() => {
    WebSocket.prototype.send = () => {};
  });
}
