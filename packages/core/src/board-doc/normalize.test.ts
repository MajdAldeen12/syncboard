import { describe, expect, it } from "vitest";
import { selectBoard, type BoardState } from "../board/index";
import { initialOrders } from "../ordering/index";
import { normalizeBoard } from "./normalize";

const [first, second, third] = initialOrders(3) as [string, string, string];

function card(columnId: string, order: string, title: string) {
  return { columnId, order, title, description: "" };
}

/** Columns listed out of order on purpose: "todo" sorts first. */
function board(cards: BoardState["cards"]): BoardState {
  return {
    title: "Test board",
    columns: {
      done: { title: "Done", order: second },
      todo: { title: "Todo", order: first },
    },
    cards,
  };
}

describe("normalizeBoard", () => {
  it("returns the same object when every card has its column", () => {
    const state = board({ a: card("todo", first, "a") });

    expect(normalizeBoard(state)).toBe(state);
  });

  it("shows a card whose column is gone in the first column", () => {
    const state = board({
      a: card("todo", first, "a"),
      lost: card("deleted-column", second, "lost"),
      b: card("todo", third, "b"),
    });

    const view = selectBoard(normalizeBoard(state));

    expect(view.columns.map((c) => [c.id, c.cards.map((x) => x.id)])).toEqual([
      ["todo", ["a", "lost", "b"]],
      ["done", []],
    ]);
  });

  it("changes nothing about the card except where it is shown", () => {
    const lost = card("deleted-column", second, "lost");

    expect(normalizeBoard(board({ lost })).cards.lost).toEqual({
      ...lost,
      columnId: "todo",
    });
  });

  it("leaves the given state untouched", () => {
    const state = board({ lost: card("deleted-column", first, "lost") });
    const copy = structuredClone(state);

    normalizeBoard(state);

    expect(state).toEqual(copy);
  });

  it("leaves cards alone when there is no column to show them in", () => {
    const state: BoardState = {
      title: "Empty",
      columns: {},
      cards: { lost: card("deleted-column", first, "lost") },
    };

    expect(normalizeBoard(state)).toBe(state);
  });

  it("is not fooled by a column id that names an object property", () => {
    const state = board({ odd: card("constructor", first, "odd") });

    expect(normalizeBoard(state).cards.odd!.columnId).toBe("todo");
  });

  it("gives back the same record for a card until something about it changes", () => {
    const lost = card("deleted-column", second, "lost");
    const before = normalizeBoard(board({ lost }));
    const after = normalizeBoard(board({ lost, a: card("todo", first, "a") }));

    expect(after.cards.lost).toBe(before.cards.lost);
  });
});
