import * as Y from "yjs";
import type { OrderKey } from "../ordering/index";
import { diffText } from "../text-binding/index";
import { SCHEMA_VERSION, boardRoots, entryOf } from "./schema";

// Writes to a board document. Each function is one Yjs transaction, so other
// clients never see half of a change. Nothing here validates input or works
// out positions; the store does that and then calls these.

export interface NewColumn {
  readonly id: string;
  readonly title: string;
  readonly order: OrderKey;
}

export interface NewCard {
  readonly id: string;
  readonly columnId: string;
  readonly order: OrderKey;
  readonly title: string;
  readonly description?: string;
  /** Id of the user who created the card. */
  readonly createdBy: string;
  /** When the card was created, in milliseconds since 1970. */
  readonly createdAt: number;
}

/** Marks a new document as a board and names it. */
export function initBoard(doc: Y.Doc, title: string): void {
  const { meta } = boardRoots(doc);
  doc.transact(() => {
    meta.set("schemaVersion", SCHEMA_VERSION);
    meta.set("title", title);
  });
}

export function insertColumn(doc: Y.Doc, column: NewColumn): void {
  const entry = new Y.Map<unknown>();
  entry.set("title", new Y.Text(column.title));
  entry.set("order", column.order);
  boardRoots(doc).columns.set(column.id, entry);
}

export function insertCard(doc: Y.Doc, card: NewCard): void {
  const entry = new Y.Map<unknown>();
  entry.set("columnId", card.columnId);
  entry.set("order", card.order);
  entry.set("title", new Y.Text(card.title));
  entry.set("description", new Y.Text(card.description ?? ""));
  entry.set("createdBy", card.createdBy);
  entry.set("createdAt", card.createdAt);
  boardRoots(doc).cards.set(card.id, entry);
}

export function moveColumn(
  doc: Y.Doc,
  columnId: string,
  order: OrderKey,
): void {
  entryOf(boardRoots(doc).columns, columnId)?.set("order", order);
}

/**
 * Puts a card at a position in a column.
 *
 * Both fields are written every time, even when the column does not change.
 * Yjs keeps one winner per field when two people write at once. Because the
 * two fields are only ever written together, the same person wins both, and
 * the card lands where one of them put it rather than in one person's column
 * at the other's position.
 */
export function moveCard(
  doc: Y.Doc,
  cardId: string,
  columnId: string,
  order: OrderKey,
): void {
  const card = entryOf(boardRoots(doc).cards, cardId);
  if (!card) return;

  doc.transact(() => {
    card.set("columnId", columnId);
    card.set("order", order);
  });
}

export function deleteCard(doc: Y.Doc, cardId: string): void {
  boardRoots(doc).cards.delete(cardId);
}

/**
 * Deletes a column together with the given cards. The caller lists the
 * cards: it knows which ones are shown in the column.
 */
export function deleteColumn(
  doc: Y.Doc,
  columnId: string,
  cardIds: Iterable<string>,
): void {
  const { columns, cards } = boardRoots(doc);
  if (!columns.has(columnId)) return;

  doc.transact(() => {
    for (const cardId of cardIds) cards.delete(cardId);
    columns.delete(columnId);
  });
}

function textOf(entry: Y.Map<unknown> | null, field: string): Y.Text | null {
  const value = entry?.get(field);
  return value instanceof Y.Text ? value : null;
}

export function columnText(doc: Y.Doc, columnId: string): Y.Text | null {
  return textOf(entryOf(boardRoots(doc).columns, columnId), "title");
}

export function cardText(
  doc: Y.Doc,
  cardId: string,
  field: "title" | "description",
): Y.Text | null {
  return textOf(entryOf(boardRoots(doc).cards, cardId), field);
}

/**
 * Makes `text` read `next` by changing only the part that differs, so that
 * an edit somebody else makes to another part at the same time is kept.
 */
export function writeText(text: Y.Text, next: string): void {
  const change = diffText(text.toString(), next);
  if (!change) return;

  const apply = () => {
    if (change.remove > 0) text.delete(change.index, change.remove);
    if (change.insert) text.insert(change.index, change.insert);
  };
  if (text.doc) text.doc.transact(apply);
  else apply();
}
