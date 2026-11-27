/*
 * Where keyboard focus goes when the element that had it disappears. A
 * deleted card or column takes its buttons with it, and focus would fall
 * back to the top of the page; a keyboard user would have to find their
 * place again from there.
 */

/** Cards on screen in a column's list, not dnd-kit's placeholders. */
const REAL_CARD =
  ':scope > [data-card-id]:not([aria-hidden="true"]):not([data-dnd-placeholder])';

/**
 * The element to focus once `card` is gone: the card after it, else the one
 * before it, else its column's "Add a card" button.
 */
export function focusTargetAfterCard(card: HTMLElement): HTMLElement | null {
  const list = card.parentElement;
  const cards = list ? [...list.querySelectorAll<HTMLElement>(REAL_CARD)] : [];
  const index = cards.indexOf(card);
  const neighbour = cards[index + 1] ?? cards[index - 1];
  if (neighbour && neighbour !== card) return neighbour;
  return (
    card
      .closest("[data-column-id]")
      ?.querySelector<HTMLElement>("[data-add-button]") ?? null
  );
}

/**
 * A selector for the element to focus once the column `columnId` is gone:
 * the handle of the column after it, else of the one before it, else "Add a
 * column". A selector, because a dialog may still be closing when it is
 * used.
 */
export function focusTargetAfterColumn(columnId: string): string {
  const ids = [
    ...document.querySelectorAll<HTMLElement>("section[data-column-id]"),
  ].map((column) => column.dataset.columnId);
  const index = ids.indexOf(columnId);
  const neighbour = ids[index + 1] ?? ids[index - 1];
  return neighbour && neighbour !== columnId
    ? `[data-column-id="${CSS.escape(neighbour)}"] [data-drag-handle]`
    : "[data-add-column] [data-add-button]";
}
