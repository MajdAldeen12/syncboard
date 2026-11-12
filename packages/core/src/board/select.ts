import { compareOrdered } from "../ordering/index";
import type {
  BoardState,
  BoardView,
  CardRecord,
  CardView,
  ColumnView,
} from "./types";

// Records are immutable and replaced on change, so a record that is still the
// same object yields the same view object. Unchanged cards keep their
// identity across snapshots and the UI can skip re-rendering them.
const cardViews = new WeakMap<CardRecord, CardView>();

function cardView(id: string, record: CardRecord): CardView {
  let view = cardViews.get(record);
  if (!view || view.id !== id) {
    view = { id, ...record };
    cardViews.set(record, view);
  }
  return view;
}

/**
 * Turns stored state into the ordered tree the UI renders.
 *
 * A card whose column does not exist is left out. The in-memory store never
 * produces one.
 */
export function selectBoard(state: BoardState): BoardView {
  const cardsByColumn = new Map<string, CardView[]>();
  for (const [id, record] of Object.entries(state.cards)) {
    const list = cardsByColumn.get(record.columnId);
    if (list) list.push(cardView(id, record));
    else cardsByColumn.set(record.columnId, [cardView(id, record)]);
  }

  const columns: ColumnView[] = Object.entries(state.columns)
    .map(([id, record]) => ({
      id,
      ...record,
      cards: (cardsByColumn.get(id) ?? []).sort(compareOrdered),
    }))
    .sort(compareOrdered);

  return { title: state.title, columns };
}
