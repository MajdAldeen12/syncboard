// Test support, not part of the package's API: a few people sharing one
// board, each with a document and a store of their own.

import * as Y from "yjs";
import type { BoardState, BoardStore } from "../board/index";
import { initialOrders } from "../ordering/index";
import { encodeBoardState } from "./state";
import { createYjsBoardStore } from "./store";

const [first, second, third] = initialOrders(3) as [string, string, string];

/** Three columns; cards a, b and c in Todo, d in Doing. */
export const BOARD: BoardState = {
  title: "Shared board",
  columns: {
    todo: { title: "Todo", order: first },
    doing: { title: "Doing", order: second },
    done: { title: "Done", order: third },
  },
  cards: {
    a: { columnId: "todo", order: first, title: "a", description: "" },
    b: { columnId: "todo", order: second, title: "b", description: "" },
    c: { columnId: "todo", order: third, title: "Fix bug", description: "" },
    d: { columnId: "doing", order: first, title: "d", description: "" },
  },
};

export interface Client {
  readonly doc: Y.Doc;
  readonly store: BoardStore;
  /** How many updates this client's document has produced or received. */
  readonly updates: () => number;
}

/**
 * One person on the board. The client id is fixed so that a test runs the
 * same way every time: when two people write the same field at once, Yjs
 * keeps the write of the higher client id.
 */
export function client(clientID: number, board: BoardState = BOARD): Client {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  Y.applyUpdate(doc, encodeBoardState(board));

  let ids = 0;
  let updates = 0;
  doc.on("update", () => updates++);
  const store = createYjsBoardStore(doc, {
    createId: () => `client${clientID}-${++ids}`,
  });
  return { doc, store, updates: () => updates };
}

/** Copies everything each document has into the other. */
export function sync(a: Client, b: Client): void {
  Y.applyUpdate(
    b.doc,
    Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)),
  );
  Y.applyUpdate(
    a.doc,
    Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)),
  );
}

/** The board as ids: [["todo", ["a", "b"]], ["done", []]] */
export function ids(store: BoardStore): [string, string[]][] {
  return store
    .getSnapshot()
    .columns.map((column) => [column.id, column.cards.map((card) => card.id)]);
}

/** A card's title, or undefined if the card is not on the board. */
export function titleOf(store: BoardStore, cardId: string): string | undefined {
  return store
    .getSnapshot()
    .columns.flatMap((column) => column.cards)
    .find((card) => card.id === cardId)?.title;
}
