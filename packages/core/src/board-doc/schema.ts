import * as Y from "yjs";

/**
 * The shape of a board inside a Yjs document.
 *
 *   meta    : Y.Map { schemaVersion: number, title: string }
 *   columns : Y.Map<columnId, Y.Map { title: Y.Text, order: string }>
 *   cards   : Y.Map<cardId,   Y.Map { columnId: string, order: string,
 *                                     title: Y.Text, description: Y.Text,
 *                                     createdBy: string, createdAt: number }>
 *
 * Columns and cards are flat maps keyed by id. A card names its column and
 * its position; there are no arrays, so nothing is ever deleted and
 * re-inserted to move it.
 */
export const SCHEMA_VERSION = 1;

export interface BoardRoots {
  readonly meta: Y.Map<unknown>;
  readonly columns: Y.Map<unknown>;
  readonly cards: Y.Map<unknown>;
}

export function boardRoots(doc: Y.Doc): BoardRoots {
  return {
    meta: doc.getMap("meta"),
    columns: doc.getMap("columns"),
    cards: doc.getMap("cards"),
  };
}

/** The column or card stored under `id`, or null if there is none. */
export function entryOf(
  map: Y.Map<unknown>,
  id: string,
): Y.Map<unknown> | null {
  const value = map.get(id);
  return value instanceof Y.Map ? value : null;
}
