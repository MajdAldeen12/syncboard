import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSeedBoard, type BoardState } from "../board/index";
import { initialOrders } from "../ordering/index";
import {
  SCHEMA_VERSION,
  boardRoots,
  encodeBoardState,
  fingerprint,
  readBoardState,
} from "./index";

const [first, second] = initialOrders(2) as [string, string];

const SMALL: BoardState = {
  title: "Small board",
  columns: {
    todo: { title: "Todo", order: first },
    done: { title: "Done", order: second },
  },
  cards: {
    a: { columnId: "todo", order: first, title: "a", description: "about a" },
    b: { columnId: "todo", order: second, title: "b", description: "" },
  },
};

function docFrom(state: BoardState): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, encodeBoardState(state));
  return doc;
}

/** Copies everything each document has into the other. */
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("encodeBoardState", () => {
  it("round-trips a board through a document", () => {
    expect(readBoardState(docFrom(SMALL))).toEqual(SMALL);
    expect(readBoardState(docFrom(createSeedBoard()))).toEqual(
      createSeedBoard(),
    );
  });

  it("lays the document out as the plan describes", () => {
    const { meta, columns, cards } = boardRoots(docFrom(SMALL));

    expect(meta.get("schemaVersion")).toBe(SCHEMA_VERSION);
    expect(meta.get("title")).toBe("Small board");

    const column = columns.get("todo") as Y.Map<unknown>;
    expect(column).toBeInstanceOf(Y.Map);
    expect(column.get("title")).toBeInstanceOf(Y.Text);
    expect(String(column.get("title"))).toBe("Todo");
    expect(column.get("order")).toBe(first);

    const card = cards.get("a") as Y.Map<unknown>;
    expect(card).toBeInstanceOf(Y.Map);
    expect(card.get("columnId")).toBe("todo");
    expect(card.get("order")).toBe(first);
    expect(card.get("title")).toBeInstanceOf(Y.Text);
    expect(String(card.get("title"))).toBe("a");
    expect(card.get("description")).toBeInstanceOf(Y.Text);
    expect(String(card.get("description"))).toBe("about a");
    expect(typeof card.get("createdBy")).toBe("string");
    expect(typeof card.get("createdAt")).toBe("number");
  });

  it("gives the same bytes for the same board, however it was built", () => {
    const reordered: BoardState = {
      title: SMALL.title,
      columns: { done: SMALL.columns.done!, todo: SMALL.columns.todo! },
      cards: { b: SMALL.cards.b!, a: SMALL.cards.a! },
    };

    expect(encodeBoardState(reordered)).toEqual(encodeBoardState(SMALL));
  });

  it("merges instead of duplicating when two documents start from it", () => {
    // Two tabs each build the starting board on their own, then meet.
    const one = docFrom(SMALL);
    const two = docFrom(SMALL);
    (boardRoots(one).cards.get("a") as Y.Map<unknown>).set("order", second);
    boardRoots(two).cards.delete("b");

    sync(one, two);

    const expected: BoardState = {
      ...SMALL,
      cards: { a: { ...SMALL.cards.a!, order: second } },
    };
    expect(readBoardState(one)).toEqual(expected);
    expect(readBoardState(two)).toEqual(expected);
  });
});

describe("readBoardState", () => {
  it("reads an empty document as an empty board", () => {
    expect(readBoardState(new Y.Doc())).toEqual({
      title: "",
      columns: {},
      cards: {},
    });
  });

  it("returns the previous state when nothing changed", () => {
    const doc = docFrom(SMALL);
    const before = readBoardState(doc);

    expect(readBoardState(doc, before)).toBe(before);
  });

  it("keeps the records that did not change", () => {
    const doc = docFrom(SMALL);
    const before = readBoardState(doc);
    (boardRoots(doc).cards.get("a") as Y.Map<unknown>).set("order", second);

    const after = readBoardState(doc, before);

    expect(after).not.toBe(before);
    expect(after.cards.a).not.toBe(before.cards.a);
    expect(after.cards.b).toBe(before.cards.b);
    expect(after.columns).toBe(before.columns);
  });

  it("notices a column or card that was removed", () => {
    const doc = docFrom(SMALL);
    const before = readBoardState(doc);
    boardRoots(doc).cards.delete("b");
    boardRoots(doc).columns.delete("done");

    const after = readBoardState(doc, before);

    expect(Object.keys(after.cards)).toEqual(["a"]);
    expect(Object.keys(after.columns)).toEqual(["todo"]);
  });

  it("skips entries that are not shaped like a column or a card", () => {
    // Anyone on a public board can write to the document. Bad data from one
    // client must not break the board for the others.
    const doc = docFrom(SMALL);
    const { columns, cards } = boardRoots(doc);
    columns.set("not-a-map", "oops");
    columns.set("no-order", new Y.Map([["title", new Y.Text("x")]]));
    cards.set("not-a-map", 42);
    cards.set("no-column", new Y.Map([["order", first]]));
    cards.set("__proto__", new Y.Map([["columnId", "todo"]]));

    expect(readBoardState(doc)).toEqual(SMALL);
  });
});

describe("fingerprint", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("is the FNV-1a hash of the bytes, in hexadecimal", () => {
    expect(fingerprint(bytes(""))).toBe("811c9dc5");
    expect(fingerprint(bytes("a"))).toBe("e40c292c");
    expect(fingerprint(bytes("foobar"))).toBe("bf9cf968");
  });

  it("tells apart boards that start with different content", () => {
    const other = { ...SMALL, title: "Another board" };

    expect(fingerprint(encodeBoardState(other))).not.toBe(
      fingerprint(encodeBoardState(SMALL)),
    );
  });
});
