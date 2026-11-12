// Test support, not part of the package's API: the behaviour every
// `BoardStore` must have. Each implementation runs this same list of tests
// from its own test file, so the in-memory store and the shared one cannot
// drift apart.

import { describe, expect, it, vi } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type BoardStore,
  type BoardView,
} from "./index";

/** Ids that are easy to read in assertions: id1, id2, ... */
export function counterIds(): () => string {
  let n = 0;
  return () => `id${++n}`;
}

/** A compact picture of the board: [["Todo", ["a", "b"]], ["Done", []]] */
export function shape(view: BoardView): [string, string[]][] {
  return view.columns.map((column) => [
    column.title,
    column.cards.map((card) => card.title),
  ]);
}

/**
 * Runs the shared tests against one implementation. `createEmptyStore`
 * returns a store holding an empty board that takes new ids from `createId`.
 */
export function describeBoardStore(
  createEmptyStore: (createId: () => string) => BoardStore,
): void {
  const emptyStore = () => createEmptyStore(counterIds());

  function boardWithCards(): {
    store: BoardStore;
    todo: string;
    doing: string;
    done: string;
    cards: Record<"a" | "b" | "c" | "d", string>;
  } {
    const store = emptyStore();
    const todo = store.addColumn("Todo")!;
    const doing = store.addColumn("Doing")!;
    const done = store.addColumn("Done")!;
    const cards = {
      a: store.addCard(todo, "a")!,
      b: store.addCard(todo, "b")!,
      c: store.addCard(todo, "c")!,
      d: store.addCard(doing, "d")!,
    };
    return { store, todo, doing, done, cards };
  }

  describe("columns", () => {
    it("adds columns to the end", () => {
      const store = emptyStore();
      store.addColumn("Todo");
      store.addColumn("Done");

      expect(shape(store.getSnapshot())).toEqual([
        ["Todo", []],
        ["Done", []],
      ]);
    });

    it("renames a column", () => {
      const store = emptyStore();
      const id = store.addColumn("Todo")!;
      store.renameColumn(id, "Backlog");

      expect(shape(store.getSnapshot())).toEqual([["Backlog", []]]);
    });

    it("deletes a column together with its cards", () => {
      const { store, todo } = boardWithCards();
      store.deleteColumn(todo);

      expect(shape(store.getSnapshot())).toEqual([
        ["Doing", ["d"]],
        ["Done", []],
      ]);
    });

    it("moves a column to a new position", () => {
      const { store, todo, done } = boardWithCards();

      store.moveColumn(done, 0);
      expect(store.getSnapshot().columns.map((c) => c.title)).toEqual([
        "Done",
        "Todo",
        "Doing",
      ]);

      store.moveColumn(todo, 2);
      expect(store.getSnapshot().columns.map((c) => c.title)).toEqual([
        "Done",
        "Doing",
        "Todo",
      ]);
    });
  });

  describe("cards", () => {
    it("adds cards to the end of a column", () => {
      const { store } = boardWithCards();

      expect(shape(store.getSnapshot())).toEqual([
        ["Todo", ["a", "b", "c"]],
        ["Doing", ["d"]],
        ["Done", []],
      ]);
    });

    it("updates a card's title and description", () => {
      const { store, cards } = boardWithCards();
      store.updateCard(cards.a, { title: "renamed" });
      store.updateCard(cards.a, { description: "details" });

      const card = store.getSnapshot().columns[0]!.cards[0]!;
      expect(card.title).toBe("renamed");
      expect(card.description).toBe("details");
    });

    it("deletes a card", () => {
      const { store, cards } = boardWithCards();
      store.deleteCard(cards.b);

      expect(shape(store.getSnapshot())[0]).toEqual(["Todo", ["a", "c"]]);
    });

    it("does not add a card to a column that does not exist", () => {
      const store = emptyStore();

      expect(store.addCard("missing", "a")).toBeNull();
    });
  });

  describe("moving cards", () => {
    it("moves a card down within its column", () => {
      const { store, todo, cards } = boardWithCards();
      store.moveCard(cards.a, todo, 2);

      expect(shape(store.getSnapshot())[0]).toEqual(["Todo", ["b", "c", "a"]]);
    });

    it("moves a card up within its column", () => {
      const { store, todo, cards } = boardWithCards();
      store.moveCard(cards.c, todo, 0);

      expect(shape(store.getSnapshot())[0]).toEqual(["Todo", ["c", "a", "b"]]);
    });

    it("moves a card into the middle of another column", () => {
      const { store, todo, cards } = boardWithCards();
      store.moveCard(cards.d, todo, 1);

      expect(shape(store.getSnapshot())).toEqual([
        ["Todo", ["a", "d", "b", "c"]],
        ["Doing", []],
        ["Done", []],
      ]);
    });

    it("moves a card into an empty column", () => {
      const { store, done, cards } = boardWithCards();
      store.moveCard(cards.b, done, 0);

      expect(shape(store.getSnapshot())).toEqual([
        ["Todo", ["a", "c"]],
        ["Doing", ["d"]],
        ["Done", ["b"]],
      ]);
    });

    it("clamps a target index past the end", () => {
      const { store, doing, cards } = boardWithCards();
      store.moveCard(cards.a, doing, 99);

      expect(shape(store.getSnapshot())[1]).toEqual(["Doing", ["d", "a"]]);
    });

    it("ignores a move to a column that does not exist", () => {
      const { store, cards } = boardWithCards();
      const before = store.getSnapshot();
      store.moveCard(cards.a, "missing", 0);

      expect(store.getSnapshot()).toBe(before);
    });
  });

  describe("input rules", () => {
    it("trims titles", () => {
      const store = emptyStore();
      const column = store.addColumn("  Todo  ")!;
      store.addCard(column, "  write tests  ");

      expect(shape(store.getSnapshot())).toEqual([["Todo", ["write tests"]]]);
    });

    it("refuses blank titles and keeps the old one", () => {
      const store = emptyStore();
      const column = store.addColumn("Todo")!;
      const card = store.addCard(column, "a")!;

      expect(store.addColumn("   ")).toBeNull();
      expect(store.addCard(column, "")).toBeNull();
      store.renameColumn(column, "  ");
      store.updateCard(card, { title: "\n" });

      expect(shape(store.getSnapshot())).toEqual([["Todo", ["a"]]]);
    });

    it("caps the length of titles and descriptions", () => {
      const store = emptyStore();
      const column = store.addColumn("x".repeat(MAX_TITLE_LENGTH + 50))!;
      const card = store.addCard(column, "y".repeat(MAX_TITLE_LENGTH + 50))!;
      store.updateCard(card, {
        description: "z".repeat(MAX_DESCRIPTION_LENGTH + 50),
      });

      const view = store.getSnapshot().columns[0]!;
      expect(view.title).toHaveLength(MAX_TITLE_LENGTH);
      expect(view.cards[0]!.title).toHaveLength(MAX_TITLE_LENGTH);
      expect(view.cards[0]!.description).toHaveLength(MAX_DESCRIPTION_LENGTH);
    });
  });

  describe("subscriptions", () => {
    it("returns the same snapshot object until something changes", () => {
      const { store, cards } = boardWithCards();
      const first = store.getSnapshot();

      expect(store.getSnapshot()).toBe(first);

      store.updateCard(cards.a, { title: "changed" });

      expect(store.getSnapshot()).not.toBe(first);
    });

    it("notifies listeners on change and stops after unsubscribe", () => {
      const store = emptyStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.addColumn("Todo");
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.addColumn("Done");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies once for a change that touches several things", () => {
      const { store, todo } = boardWithCards();
      const listener = vi.fn();
      store.subscribe(listener);

      store.deleteColumn(todo); // one column and three cards

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not notify when a call changes nothing", () => {
      const { store, todo, cards } = boardWithCards();
      const listener = vi.fn();
      store.subscribe(listener);

      store.moveCard(cards.a, todo, 0); // already first
      store.moveColumn(todo, 0); // already first
      store.renameColumn(todo, "Todo"); // same title
      store.updateCard(cards.a, { title: "a" }); // same title
      store.deleteCard("missing");
      store.deleteColumn("missing");

      expect(listener).not.toHaveBeenCalled();
    });

    it("keeps the same object for a card that did not change", () => {
      const { store, cards } = boardWithCards();
      const before = store.getSnapshot().columns[0]!.cards;

      store.updateCard(cards.a, { title: "changed" });

      const after = store.getSnapshot().columns[0]!.cards;
      expect(after[0]).not.toBe(before[0]);
      expect(after[1]).toBe(before[1]);
      expect(after[2]).toBe(before[2]);
    });
  });

  describe("editing a title as it is typed", () => {
    function titled(): { store: BoardStore; column: string; card: string } {
      const store = emptyStore();
      const column = store.addColumn("Todo")!;
      const card = store.addCard(column, "Fix bug")!;
      return { store, column, card };
    }

    const cardTitle = (store: BoardStore) =>
      store.getSnapshot().columns[0]!.cards[0]!.title;
    const columnTitle = (store: BoardStore) =>
      store.getSnapshot().columns[0]!.title;

    it("opens on the current title", () => {
      const { store, column, card } = titled();

      expect(store.editCardTitle(card)!.getText()).toBe("Fix bug");
      expect(store.editColumnTitle(column)!.getText()).toBe("Todo");
    });

    it("cannot be opened on something that does not exist", () => {
      const { store } = titled();

      expect(store.editCardTitle("missing")).toBeNull();
      expect(store.editColumnTitle("missing")).toBeNull();
    });

    it("shows each edit on the board straight away", () => {
      const { store, card } = titled();
      const listener = vi.fn();
      store.subscribe(listener);
      const session = store.editCardTitle(card)!;

      session.splice(4, 0, "login ");

      expect(session.getText()).toBe("Fix login bug");
      expect(cardTitle(store)).toBe("Fix login bug");
      expect(listener).toHaveBeenCalledTimes(1);

      session.splice(0, 3, "Mend");

      expect(cardTitle(store)).toBe("Mend login bug");
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("keeps an edit that reaches past the end inside the text", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;

      session.splice(4, 99, "it");
      session.splice(99, 0, "!");

      expect(cardTitle(store)).toBe("Fix it!");
    });

    it("trims the title when the edit is kept", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;

      session.splice(7, 0, " today  ");
      session.splice(0, 0, "  ");
      session.commit();

      expect(cardTitle(store)).toBe("Fix bug today");
    });

    it("takes the edit back when it is cancelled", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;

      session.splice(0, 3, "Break");
      session.splice(9, 0, "!");
      session.cancel();

      expect(cardTitle(store)).toBe("Fix bug");
    });

    it("takes the edit back when it would leave the title blank", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;

      session.splice(0, 7, "   ");
      session.commit();

      expect(cardTitle(store)).toBe("Fix bug");
    });

    it("ignores edits made after the session has ended", () => {
      const { store, card } = titled();
      const kept = store.editCardTitle(card)!;
      kept.commit();
      kept.splice(0, 0, "late ");
      kept.cancel();

      const cancelled = store.editCardTitle(card)!;
      cancelled.splice(0, 0, "x");
      cancelled.cancel();
      cancelled.splice(0, 0, "late ");
      cancelled.commit();

      expect(cardTitle(store)).toBe("Fix bug");
    });

    it("cuts an edit that would make the title too long", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;

      session.splice(7, 0, "x".repeat(MAX_TITLE_LENGTH));

      expect(cardTitle(store)).toHaveLength(MAX_TITLE_LENGTH);
      expect(cardTitle(store).startsWith("Fix bugxxx")).toBe(true);
    });

    it("reports changes made elsewhere, but not its own", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;
      const seen: unknown[] = [];
      session.subscribe((splices) => seen.push(...splices));

      session.splice(0, 0, "A");
      expect(seen).toEqual([]);

      store.updateCard(card, { title: "AFix bug!" });
      expect(seen).toEqual([{ index: 8, remove: 0, insert: "!" }]);
    });

    it("stops reporting after unsubscribe and after the session ends", () => {
      const { store, card } = titled();
      const session = store.editCardTitle(card)!;
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribe = session.subscribe(first);
      session.subscribe(second);

      unsubscribe();
      store.updateCard(card, { title: "Fix bug!" });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);

      session.commit();
      store.updateCard(card, { title: "Fix bug?" });
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("edits a column title the same way", () => {
      const { store, column } = titled();

      const kept = store.editColumnTitle(column)!;
      kept.splice(4, 0, " list ");
      expect(columnTitle(store)).toBe("Todo list ");
      kept.commit();
      expect(columnTitle(store)).toBe("Todo list");

      const cancelled = store.editColumnTitle(column)!;
      cancelled.splice(0, 9, "Nothing");
      cancelled.cancel();
      expect(columnTitle(store)).toBe("Todo list");

      const blank = store.editColumnTitle(column)!;
      blank.splice(0, 9, "");
      blank.commit();
      expect(columnTitle(store)).toBe("Todo list");
    });
  });

  describe("invariants", () => {
    it("keeps every card in exactly one column through random edits", () => {
      let state = 7;
      const random = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
      const pick = <T>(list: readonly T[]): T | undefined =>
        list[Math.floor(random() * list.length)];

      const store = emptyStore();
      const live = new Set<string>();
      for (const title of ["A", "B", "C"]) store.addColumn(title);

      for (let n = 0; n < 400; n++) {
        const view = store.getSnapshot();
        const column = pick(view.columns);
        const cardIds = [...live];
        const roll = random();

        if (roll < 0.35 && column) {
          const id = store.addCard(column.id, `card ${n}`);
          if (id) live.add(id);
        } else if (roll < 0.8 && column && cardIds.length > 0) {
          store.moveCard(pick(cardIds)!, column.id, Math.floor(random() * 6));
        } else if (roll < 0.9 && cardIds.length > 0) {
          const id = pick(cardIds)!;
          store.deleteCard(id);
          live.delete(id);
        } else if (column) {
          store.moveColumn(column.id, Math.floor(random() * 3));
        }

        const seen = store
          .getSnapshot()
          .columns.flatMap((c) => c.cards.map((card) => card.id));
        expect(seen).toHaveLength(live.size);
        expect(new Set(seen)).toEqual(live);
      }
    });
  });
}
