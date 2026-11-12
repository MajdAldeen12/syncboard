import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { initialOrders } from "../ordering/index";
import {
  boardRoots,
  cardText,
  columnText,
  deleteCard,
  deleteColumn,
  initBoard,
  insertCard,
  insertColumn,
  moveCard,
  moveColumn,
  readBoardState,
  writeText,
} from "./index";

const [first, second, third] = initialOrders(3) as [string, string, string];

/** A document with two columns and two cards, plus a count of its updates. */
function setup(): { doc: Y.Doc; updates: () => number } {
  const doc = new Y.Doc();
  initBoard(doc, "Test board");
  insertColumn(doc, { id: "todo", title: "Todo", order: first });
  insertColumn(doc, { id: "done", title: "Done", order: second });
  for (const [id, order] of [
    ["a", first],
    ["b", second],
  ] as const) {
    insertCard(doc, {
      id,
      columnId: "todo",
      order,
      title: id,
      createdBy: "tester",
      createdAt: 1000,
    });
  }

  let count = 0;
  doc.on("update", () => count++);
  return { doc, updates: () => count };
}

function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("creating", () => {
  it("writes the board title and the schema version", () => {
    const { doc } = setup();

    expect(readBoardState(doc).title).toBe("Test board");
    expect(boardRoots(doc).meta.get("schemaVersion")).toBe(1);
  });

  it("adds columns and cards", () => {
    const { doc } = setup();

    expect(readBoardState(doc)).toEqual({
      title: "Test board",
      columns: {
        todo: { title: "Todo", order: first },
        done: { title: "Done", order: second },
      },
      cards: {
        a: { columnId: "todo", order: first, title: "a", description: "" },
        b: { columnId: "todo", order: second, title: "b", description: "" },
      },
    });
  });

  it("records who created a card and when", () => {
    const { doc } = setup();
    const card = boardRoots(doc).cards.get("a") as Y.Map<unknown>;

    expect(card.get("createdBy")).toBe("tester");
    expect(card.get("createdAt")).toBe(1000);
  });
});

describe("moveCard", () => {
  it("sets the column and the position in one transaction", () => {
    const { doc, updates } = setup();

    moveCard(doc, "a", "done", third);

    expect(updates()).toBe(1);
    expect(readBoardState(doc).cards.a).toMatchObject({
      columnId: "done",
      order: third,
    });
  });

  it("writes the column even when the card stays in it", () => {
    // Both fields are always written together, so that when two people move
    // the same card at once the same person wins both. Writing only the
    // position could pair one person's column with the other's position.
    const { doc } = setup();
    const changed: string[] = [];
    (boardRoots(doc).cards.get("a") as Y.Map<unknown>).observe((event) => {
      changed.push(...event.keysChanged);
    });

    moveCard(doc, "a", "todo", third);

    expect(changed.sort()).toEqual(["columnId", "order"]);
  });

  it("ignores a card that does not exist", () => {
    const { doc, updates } = setup();

    moveCard(doc, "missing", "done", third);

    expect(updates()).toBe(0);
  });
});

describe("moveColumn", () => {
  it("sets the column's position", () => {
    const { doc, updates } = setup();

    moveColumn(doc, "todo", third);

    expect(updates()).toBe(1);
    expect(readBoardState(doc).columns.todo!.order).toBe(third);
  });

  it("ignores a column that does not exist", () => {
    const { doc, updates } = setup();

    moveColumn(doc, "missing", third);

    expect(updates()).toBe(0);
  });
});

describe("deleting", () => {
  it("removes a card", () => {
    const { doc, updates } = setup();

    deleteCard(doc, "a");

    expect(updates()).toBe(1);
    expect(Object.keys(readBoardState(doc).cards)).toEqual(["b"]);
  });

  it("removes a column and its cards in one transaction", () => {
    const { doc, updates } = setup();

    deleteColumn(doc, "todo", ["a", "b"]);

    expect(updates()).toBe(1);
    expect(readBoardState(doc)).toMatchObject({
      columns: { done: { title: "Done" } },
      cards: {},
    });
  });

  it("ignores ids that do not exist", () => {
    const { doc, updates } = setup();

    deleteCard(doc, "missing");
    deleteColumn(doc, "missing", ["a"]);

    expect(updates()).toBe(0);
    expect(Object.keys(readBoardState(doc).cards)).toEqual(["a", "b"]);
  });
});

describe("text", () => {
  it("finds the text of a card and of a column", () => {
    const { doc } = setup();

    expect(String(cardText(doc, "a", "title"))).toBe("a");
    expect(String(cardText(doc, "a", "description"))).toBe("");
    expect(String(columnText(doc, "todo"))).toBe("Todo");
    expect(cardText(doc, "missing", "title")).toBeNull();
    expect(columnText(doc, "missing")).toBeNull();
  });

  it("replaces text", () => {
    const { doc } = setup();
    const title = cardText(doc, "a", "title")!;

    writeText(title, "a new title");

    expect(readBoardState(doc).cards.a!.title).toBe("a new title");
  });

  it("writes nothing when the text is already right", () => {
    const { doc, updates } = setup();

    writeText(cardText(doc, "a", "title")!, "a");

    expect(updates()).toBe(0);
  });

  it("changes only what differs, so another person's edit survives", () => {
    const { doc: one } = setup();
    const two = new Y.Doc();
    sync(one, two);
    writeText(cardText(one, "a", "title")!, "Fix bug");
    sync(one, two);

    writeText(cardText(one, "a", "title")!, "Fix login bug");
    writeText(cardText(two, "a", "title")!, "Fix bug today");
    sync(one, two);

    expect(readBoardState(one).cards.a!.title).toBe("Fix login bug today");
    expect(readBoardState(two).cards.a!.title).toBe("Fix login bug today");
  });
});
