import { orderAtIndex, type OrderKey } from "../ordering/index";
import { clamp } from "./text";
import type { BoardView } from "./types";

// Turns "put it at index N" into an order key, for any store. Both return
// null when the request should be ignored: the target does not exist, or the
// item is already there.

/** The key that moves a column so that it ends up at `toIndex`. */
export function columnPlacement(
  view: BoardView,
  columnId: string,
  toIndex: number,
): OrderKey | null {
  const from = view.columns.findIndex((column) => column.id === columnId);
  if (from === -1) return null;

  const siblings = view.columns.filter((column) => column.id !== columnId);
  const to = clamp(toIndex, 0, siblings.length);
  return to === from ? null : orderAtIndex(siblings, to);
}

/**
 * The key that moves a card so that it ends up at `toIndex` in `toColumnId`.
 * `fromColumnId` is the column the card is stored in.
 */
export function cardPlacement(
  view: BoardView,
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  toIndex: number,
): OrderKey | null {
  const target = view.columns.find((column) => column.id === toColumnId);
  if (!target) return null;

  const siblings = target.cards.filter((card) => card.id !== cardId);
  const to = clamp(toIndex, 0, siblings.length);
  const from =
    fromColumnId === toColumnId
      ? target.cards.findIndex((card) => card.id === cardId)
      : -1;
  return to === from ? null : orderAtIndex(siblings, to);
}
