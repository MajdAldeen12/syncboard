import * as Y from "yjs";
import type { BoardState, CardRecord, ColumnRecord } from "../board/types";
import { initBoard, insertCard, insertColumn } from "./mutations";
import { boardRoots } from "./schema";

/**
 * The client id every starting board is written under. Real clients get a
 * random 32-bit id, so they do not collide with it in practice.
 */
const SEED_CLIENT_ID = 1;

const text = (value: unknown): string =>
  value instanceof Y.Text ? value.toString() : "";

const isKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function readColumn(value: unknown): ColumnRecord | null {
  if (!(value instanceof Y.Map)) return null;
  const order = value.get("order");
  if (!isKey(order)) return null;
  return { title: text(value.get("title")), order };
}

function readCard(value: unknown): CardRecord | null {
  if (!(value instanceof Y.Map)) return null;
  const columnId = value.get("columnId");
  const order = value.get("order");
  if (!isKey(columnId) || !isKey(order)) return null;
  return {
    columnId,
    order,
    title: text(value.get("title")),
    description: text(value.get("description")),
  };
}

function sameFields<T extends object>(a: T, b: T): boolean {
  for (const key of Object.keys(a) as (keyof T)[]) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Reads one of the two maps into plain records. A record that has not
 * changed since `previous` is reused, and so is the whole result when no
 * record has, which lets the UI skip whatever did not change.
 */
function readRecords<T extends object>(
  map: Y.Map<unknown>,
  read: (value: unknown) => T | null,
  previous: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> {
  const records: Record<string, T> = {};
  let count = 0;
  let changed = previous === undefined;

  map.forEach((value, id) => {
    // Assigning to "__proto__" would replace the object's prototype.
    if (id === "__proto__") return;
    // Anyone on a public board can write to the document, so entries of the
    // wrong shape are skipped rather than trusted.
    const record = read(value);
    if (!record) return;

    const old =
      previous && Object.hasOwn(previous, id) ? previous[id] : undefined;
    if (old && sameFields(old, record)) {
      records[id] = old;
    } else {
      records[id] = record;
      changed = true;
    }
    count++;
  });

  if (previous && !changed && count === Object.keys(previous).length) {
    return previous;
  }
  return records;
}

/**
 * The board held in a document, as plain immutable records.
 *
 * Pass the result of the last call as `previous` to get the same objects
 * back for everything that has not changed.
 */
export function readBoardState(doc: Y.Doc, previous?: BoardState): BoardState {
  const { meta, columns, cards } = boardRoots(doc);
  const rawTitle = meta.get("title");
  const title = typeof rawTitle === "string" ? rawTitle : "";

  const nextColumns = readRecords(columns, readColumn, previous?.columns);
  const nextCards = readRecords(cards, readCard, previous?.cards);

  if (
    previous &&
    previous.title === title &&
    previous.columns === nextColumns &&
    previous.cards === nextCards
  ) {
    return previous;
  }
  return { title, columns: nextColumns, cards: nextCards };
}

/**
 * A Yjs update that holds `state`, for starting a board document:
 * `Y.applyUpdate(doc, encodeBoardState(state))`.
 *
 * The same board always gives the same update, written under a fixed client
 * id. Yjs recognises content it has seen before by client id and counter, so
 * several clients can each start from this update and later sync without
 * the starting content being duplicated or fought over.
 */
export function encodeBoardState(state: BoardState): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = SEED_CLIENT_ID;

  doc.transact(() => {
    initBoard(doc, state.title);
    // Sorted, so that the order the records were added in does not matter.
    for (const id of Object.keys(state.columns).sort()) {
      insertColumn(doc, { id, ...state.columns[id]! });
    }
    for (const id of Object.keys(state.cards).sort()) {
      insertCard(doc, {
        id,
        ...state.cards[id]!,
        createdBy: "system",
        createdAt: 0,
      });
    }
  });

  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
