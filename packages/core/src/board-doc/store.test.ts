import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { describeBoardStore, shape } from "../board/store-contract";
import { applySplice, type TextSplice } from "../text-binding/index";
import { boardRoots, createYjsBoardStore, readBoardState } from "./index";
import { client, ids, sync, titleOf, type Client } from "./testing";

describe("createYjsBoardStore", () => {
  describeBoardStore((createId) =>
    createYjsBoardStore(new Y.Doc(), { createId }),
  );
});

/** Two people on the same board, not yet exchanging changes. */
function twoClients(): [Client, Client] {
  return [client(10), client(20)];
}

describe("a store on a shared document", () => {
  it("shows the board that is already in the document", () => {
    const [alice] = twoClients();

    expect(alice.store.getSnapshot().title).toBe("Shared board");
    expect(shape(alice.store.getSnapshot())).toEqual([
      ["Todo", ["a", "b", "Fix bug"]],
      ["Doing", ["d"]],
      ["Done", []],
    ]);
  });

  it("follows changes made by someone else", () => {
    const [alice, bob] = twoClients();
    const listener = vi.fn();
    bob.store.subscribe(listener);

    alice.store.addCard("done", "from Alice");
    alice.store.moveCard("a", "doing", 0);
    alice.store.renameColumn("todo", "Backlog");
    sync(alice, bob);

    expect(shape(bob.store.getSnapshot())).toEqual([
      ["Backlog", ["b", "Fix bug"]],
      ["Doing", ["a", "d"]],
      ["Done", ["from Alice"]],
    ]);
    // Everything arrived in one update, so the board is redrawn once.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the same objects for cards a remote change did not touch", () => {
    const [alice, bob] = twoClients();
    const before = bob.store.getSnapshot().columns[0]!.cards;

    alice.store.updateCard("a", { title: "changed" });
    sync(alice, bob);

    const after = bob.store.getSnapshot().columns[0]!.cards;
    expect(after[0]!.title).toBe("changed");
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it("stays quiet when an update changes nothing on the board", () => {
    const [alice, bob] = twoClients();
    alice.store.addCard("done", "from Alice");
    const update = Y.encodeStateAsUpdate(alice.doc);
    Y.applyUpdate(bob.doc, update);
    const snapshot = bob.store.getSnapshot();
    const listener = vi.fn();
    bob.store.subscribe(listener);

    Y.applyUpdate(bob.doc, update); // the same news twice
    bob.doc.getMap("something-else").set("key", "value");

    expect(listener).not.toHaveBeenCalled();
    expect(bob.store.getSnapshot()).toBe(snapshot);
  });

  it("records who created a card and when", () => {
    const doc = new Y.Doc();
    const store = createYjsBoardStore(doc, {
      userId: "user-7",
      now: () => 1234,
    });
    const column = store.addColumn("Todo")!;
    const card = store.addCard(column, "a")!;

    const entry = boardRoots(doc).cards.get(card) as Y.Map<unknown>;
    expect(entry.get("createdBy")).toBe("user-7");
    expect(entry.get("createdAt")).toBe(1234);
  });

  it("writes a move as a single update", () => {
    const [alice] = twoClients();
    const before = alice.updates();

    alice.store.moveCard("a", "done", 0);

    expect(alice.updates()).toBe(before + 1);
  });
});

describe("a card whose column was deleted by someone else", () => {
  /** Alice moves "d" into Done while Bob, who sees Done empty, deletes it. */
  function orphaned(): [Client, Client] {
    const [alice, bob] = twoClients();
    alice.store.moveCard("d", "done", 0);
    bob.store.deleteColumn("done");
    sync(alice, bob);
    return [alice, bob];
  }

  it("is shown in the first column, by both", () => {
    const [alice, bob] = orphaned();

    const [todo, doing] = ids(alice.store);
    expect(todo![0]).toBe("todo");
    expect([...todo![1]].sort()).toEqual(["a", "b", "c", "d"]);
    expect(doing).toEqual(["doing", []]);
    expect(ids(bob.store)).toEqual(ids(alice.store));
  });

  it("is not written back to the document", () => {
    const [alice, bob] = orphaned();
    const before = [alice.updates(), bob.updates()];

    alice.store.getSnapshot();
    bob.store.getSnapshot();

    expect([alice.updates(), bob.updates()]).toEqual(before);
    expect(readBoardState(alice.doc).cards.d!.columnId).toBe("done");
  });

  it("gets a real column as soon as it is moved, even to where it is shown", () => {
    const [alice, bob] = orphaned();
    const shownAt = ids(alice.store)[0]![1].indexOf("d");

    alice.store.moveCard("d", "todo", shownAt);
    sync(alice, bob);

    expect(readBoardState(bob.doc).cards.d!.columnId).toBe("todo");
    expect(ids(bob.store)[0]![1].indexOf("d")).toBe(shownAt);
  });

  it("is deleted along with the column it is shown in", () => {
    const [alice, bob] = orphaned();

    bob.store.deleteColumn("todo");
    sync(alice, bob);

    expect(Object.keys(readBoardState(alice.doc).cards)).toEqual([]);
    expect(ids(alice.store)).toEqual([["doing", []]]);
  });
});

describe("editing a title that someone else is editing too", () => {
  it("merges what both typed", () => {
    const [alice, bob] = twoClients();
    const hers = alice.store.editCardTitle("c")!;
    const his = bob.store.editCardTitle("c")!;

    hers.splice(4, 0, "login "); // Fix login bug
    his.splice(7, 0, " today"); // Fix bug today
    sync(alice, bob);
    hers.commit();
    his.commit();
    sync(alice, bob);

    expect(titleOf(alice.store, "c")).toBe("Fix login bug today");
    expect(titleOf(bob.store, "c")).toBe("Fix login bug today");
  });

  it("reports the other person's edit with its position", () => {
    const [alice, bob] = twoClients();
    const hers = alice.store.editCardTitle("c")!;
    const seen: TextSplice[] = [];
    hers.subscribe((splices) => seen.push(...splices));

    bob.store.updateCard("c", { title: "Fix the bug" });
    sync(alice, bob);

    expect(seen).toEqual([{ index: 4, remove: 0, insert: "the " }]);
    expect(seen.reduce(applySplice, "Fix bug")).toBe(hers.getText());
  });

  it("cancel takes back only what this session typed", () => {
    const [alice, bob] = twoClients();
    const hers = alice.store.editCardTitle("c")!;

    hers.splice(0, 3, "Break"); // Break bug
    bob.store.updateCard("c", { title: "Fix bug today" });
    sync(alice, bob);
    expect(titleOf(alice.store, "c")).toBe("Break bug today");

    hers.cancel();
    sync(alice, bob);

    expect(titleOf(alice.store, "c")).toBe("Fix bug today");
    expect(titleOf(bob.store, "c")).toBe("Fix bug today");
  });

  it("a blank result takes back the edit and keeps the other person's", () => {
    const [alice, bob] = twoClients();
    const hers = alice.store.editCardTitle("c")!;

    hers.splice(0, 7, "");
    hers.commit();
    bob.store.updateCard("c", { title: "Fix bug today" });
    sync(alice, bob);

    expect(titleOf(alice.store, "c")).toBe("Fix bug today");
  });

  it("trimming does not disturb the other person's edit", () => {
    const [alice, bob] = twoClients();
    const hers = alice.store.editCardTitle("c")!;

    hers.splice(7, 0, " now  "); // "Fix bug now  "
    bob.store.updateCard("c", { title: "Fix the bug" });
    sync(alice, bob);
    hers.commit();
    sync(alice, bob);

    expect(titleOf(bob.store, "c")).toBe("Fix the bug now");
  });

  it("ends quietly when the card is deleted in the meantime", () => {
    const [alice, bob] = twoClients();
    const hers = alice.store.editCardTitle("c")!;
    const other = alice.store.editCardTitle("c")!;
    hers.splice(0, 0, "x");
    bob.store.deleteCard("c");
    sync(alice, bob);
    const before = alice.updates();

    hers.splice(0, 0, "late");
    hers.commit();
    other.cancel();

    expect(alice.updates()).toBe(before);
    expect(titleOf(alice.store, "c")).toBeUndefined();
  });
});
