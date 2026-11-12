import type { BoardState, CardRecord } from "../board/types";
import { compareOrdered } from "../ordering/index";

// A re-homed card is a new record. Remembering it per original record keeps
// its identity stable from one snapshot to the next, so the UI does not
// re-render the card every time something else on the board changes.
const rehomed = new WeakMap<CardRecord, CardRecord>();

function rehome(record: CardRecord, columnId: string): CardRecord {
  let moved = rehomed.get(record);
  if (!moved || moved.columnId !== columnId) {
    moved = { ...record, columnId };
    rehomed.set(record, moved);
  }
  return moved;
}

/**
 * Makes a board showable when a card points at a column that no longer
 * exists.
 *
 * That happens when one person moves a card into a column while another
 * deletes the column: the delete could not know about the card. Such a card
 * is shown in the first column. This only changes what is displayed; the
 * shared document is not written to, so two clients never race to repair it.
 *
 * Returns the same object when there is nothing to fix.
 */
export function normalizeBoard(state: BoardState): BoardState {
  let firstColumn: { id: string; order: string } | null = null;
  for (const [id, column] of Object.entries(state.columns)) {
    const candidate = { id, order: column.order };
    if (!firstColumn || compareOrdered(candidate, firstColumn) < 0) {
      firstColumn = candidate;
    }
  }
  if (!firstColumn) return state;

  let cards: Record<string, CardRecord> | null = null;
  for (const [id, card] of Object.entries(state.cards)) {
    if (Object.hasOwn(state.columns, card.columnId)) continue;
    cards ??= { ...state.cards };
    cards[id] = rehome(card, firstColumn.id);
  }

  return cards ? { ...state, cards } : state;
}
