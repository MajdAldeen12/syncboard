import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { BoardStore } from "../board/index";
import type { TextSession } from "../text-binding/index";
import { boardRoots, createYjsBoardStore, readBoardState } from "./index";
import { BOARD, client, ids, sync, titleOf, type Client } from "./testing";

// What must hold when several people change a board at the same time and
// their changes reach each other late and in any order: everyone ends up
// looking at the same board, no card is shown twice, and no card is lost
// between columns.

afterEach(() => {
  vi.restoreAllMocks();
});

/** Deterministic pseudo-random numbers so a failing run can be repeated. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Where a card is stored: its column and its position key. */
function placeOf(who: Client, cardId: string) {
  const card = readBoardState(who.doc).cards[cardId];
  return card && { columnId: card.columnId, order: card.order };
}

/** Fails unless every card of the document is shown exactly once. */
function expectEveryCardOnce(who: Client): void {
  const view = who.store.getSnapshot();
  const shown = view.columns.flatMap((column) =>
    column.cards.map((card) => card.id),
  );
  const stored = Object.keys(readBoardState(who.doc).cards);

  expect(new Set(shown).size).toBe(shown.length);
  // With no column left there is nowhere to show a card.
  expect([...shown].sort()).toEqual(
    view.columns.length > 0 ? [...stored].sort() : [],
  );
  for (const column of view.columns) {
    for (const card of column.cards) expect(card.columnId).toBe(column.id);
  }
}

describe("move and move", () => {
  // Run with the client ids both ways round: which of two simultaneous
  // writes Yjs keeps depends on them, and the result must be sound either way.
  const bothWays: [number, number][] = [
    [10, 20],
    [20, 10],
  ];

  it.each(bothWays)(
    "one card to two columns: it lands in one of them (ids %i and %i)",
    (aliceId, bobId) => {
      const alice = client(aliceId);
      const bob = client(bobId);

      alice.store.moveCard("a", "doing", 0);
      bob.store.moveCard("a", "done", 0);
      const intended = [placeOf(alice, "a"), placeOf(bob, "a")];
      sync(alice, bob);

      expect(ids(bob.store)).toEqual(ids(alice.store));
      expectEveryCardOnce(alice);
      expect(intended).toContainEqual(placeOf(alice, "a"));
    },
  );

  it.each(bothWays)(
    "a reorder against a move across columns: one of the two wins outright (ids %i and %i)",
    (aliceId, bobId) => {
      const alice = client(aliceId);
      const bob = client(bobId);

      // Alice only changes the position. If that wrote the position alone,
      // the card could end up in Bob's column at Alice's position.
      alice.store.moveCard("a", "todo", 2);
      bob.store.moveCard("a", "done", 0);
      const intended = [placeOf(alice, "a"), placeOf(bob, "a")];
      sync(alice, bob);

      expect(ids(bob.store)).toEqual(ids(alice.store));
      expectEveryCardOnce(alice);
      expect(intended).toContainEqual(placeOf(alice, "a"));
      expect(placeOf(bob, "a")).toEqual(placeOf(alice, "a"));
    },
  );

  it("a second move by the same person does not split the pair either", () => {
    const alice = client(10);
    const bob = client(20);

    alice.store.moveCard("a", "doing", 0);
    alice.store.moveCard("a", "doing", 1);
    bob.store.moveCard("a", "done", 0);
    const intended = [placeOf(alice, "a"), placeOf(bob, "a")];
    sync(alice, bob);

    expect(intended).toContainEqual(placeOf(alice, "a"));
    expect(placeOf(bob, "a")).toEqual(placeOf(alice, "a"));
  });

  it("two cards to the same spot: both stay, in the same order for everyone", () => {
    const alice = client(10);
    const bob = client(20);

    alice.store.moveCard("a", "done", 0);
    bob.store.moveCard("d", "done", 0);
    sync(alice, bob);

    expect(ids(bob.store)).toEqual(ids(alice.store));
    expect([...ids(alice.store)[2]![1]].sort()).toEqual(["a", "d"]);
    expectEveryCardOnce(alice);
  });

  it("one column to two places: everyone agrees on the result", () => {
    const alice = client(10);
    const bob = client(20);

    alice.store.moveColumn("todo", 2);
    bob.store.moveColumn("todo", 1);
    sync(alice, bob);

    expect(ids(bob.store)).toEqual(ids(alice.store));
    expect(ids(alice.store).map(([id]) => id)).toHaveLength(3);
  });
});

describe("move and delete", () => {
  it("a card moved by one person and deleted by another is gone", () => {
    const [alice, bob] = [client(10), client(20)];

    alice.store.moveCard("a", "done", 0);
    bob.store.deleteCard("a");
    sync(alice, bob);

    for (const who of [alice, bob]) {
      expect(ids(who.store)).toEqual([
        ["todo", ["b", "c"]],
        ["doing", ["d"]],
        ["done", []],
      ]);
      expect(boardRoots(who.doc).cards.has("a")).toBe(false);
    }
  });

  it("holds whichever of the two has the higher client id", () => {
    const [alice, bob] = [client(20), client(10)];

    alice.store.moveCard("a", "done", 0);
    bob.store.deleteCard("a");
    sync(alice, bob);

    expect(titleOf(alice.store, "a")).toBeUndefined();
    expect(titleOf(bob.store, "a")).toBeUndefined();
  });

  it("a card moved into a column that someone deletes is shown in the first column", () => {
    const [alice, bob] = [client(10), client(20)];

    alice.store.moveCard("d", "done", 0);
    bob.store.deleteColumn("done");
    sync(alice, bob);

    expect(ids(bob.store)).toEqual(ids(alice.store));
    expect(ids(alice.store).map(([id]) => id)).toEqual(["todo", "doing"]);
    expect(ids(alice.store)[0]![1]).toContain("d");
    expectEveryCardOnce(alice);
    expectEveryCardOnce(bob);
  });

  it("a card moved out of a column that someone deletes is deleted with it", () => {
    // Bob deletes the column and the cards he sees in it, "a" among them.
    // Deleting wins over Alice's move: the card does not come back.
    const [alice, bob] = [client(10), client(20)];

    alice.store.moveCard("a", "done", 0);
    bob.store.deleteColumn("todo");
    sync(alice, bob);

    for (const who of [alice, bob]) {
      expect(ids(who.store)).toEqual([
        ["doing", ["d"]],
        ["done", []],
      ]);
    }
  });

  it("a card added to a column that someone deletes is shown in the first column", () => {
    const [alice, bob] = [client(10), client(20)];

    const added = alice.store.addCard("done", "late arrival")!;
    bob.store.deleteColumn("done");
    sync(alice, bob);

    expect(ids(bob.store)).toEqual(ids(alice.store));
    expect(ids(alice.store)[0]![1]).toContain(added);
    expectEveryCardOnce(bob);
  });
});

describe("edit and edit", () => {
  it("two people changing different words of a title both keep them", () => {
    const [alice, bob] = [client(10), client(20)];

    alice.store.updateCard("c", { title: "Fix login bug" });
    bob.store.updateCard("c", { title: "Fix bug today" });
    sync(alice, bob);

    expect(titleOf(alice.store, "c")).toBe("Fix login bug today");
    expect(titleOf(bob.store, "c")).toBe("Fix login bug today");
  });

  it("two people typing at the same place get the same text, with both parts", () => {
    const [alice, bob] = [client(10), client(20)];
    const hers = alice.store.editCardTitle("c")!;
    const his = bob.store.editCardTitle("c")!;

    for (const letter of "ABC") hers.splice(hers.getText().length, 0, letter);
    for (const letter of "xyz") his.splice(his.getText().length, 0, letter);
    sync(alice, bob);
    hers.commit();
    his.commit();
    sync(alice, bob);

    const title = titleOf(alice.store, "c")!;
    expect(titleOf(bob.store, "c")).toBe(title);
    // Each person's letters stay together and in the order they were typed.
    expect(["Fix bugABCxyz", "Fix bugxyzABC"]).toContain(title);
  });

  it("two people renaming a column both keep their words", () => {
    const [alice, bob] = [client(10), client(20)];

    alice.store.renameColumn("todo", "Todo soon");
    bob.store.renameColumn("todo", "My Todo");
    sync(alice, bob);

    const title = alice.store.getSnapshot().columns[0]!.title;
    expect(title).toBe("My Todo soon");
    expect(bob.store.getSnapshot().columns[0]!.title).toBe(title);
  });

  it("an edit to a card that someone deletes is dropped with the card", () => {
    const [alice, bob] = [client(10), client(20)];

    alice.store.updateCard("c", { title: "Fix bug today" });
    bob.store.deleteCard("c");
    sync(alice, bob);

    expect(ids(alice.store)[0]).toEqual(["todo", ["a", "b"]]);
    expect(ids(bob.store)[0]).toEqual(["todo", ["a", "b"]]);
  });

  it("an edit and a move of the same card both take effect", () => {
    const [alice, bob] = [client(10), client(20)];

    alice.store.updateCard("c", { title: "Fix bug today" });
    bob.store.moveCard("c", "done", 0);
    sync(alice, bob);

    for (const who of [alice, bob]) {
      expect(ids(who.store)[2]).toEqual(["done", ["c"]]);
      expect(titleOf(who.store, "c")).toBe("Fix bug today");
    }
  });
});

describe("random changes by three people", () => {
  interface Replica extends Client {
    /** Updates from the others that have not been applied here yet. */
    readonly inbox: Uint8Array[];
    /** A title this person is in the middle of editing, if any. */
    session: TextSession | null;
  }

  const REMOTE = "remote";

  function threeReplicas(): Replica[] {
    const replicas: Replica[] = [1, 2, 3].map((n) => ({
      ...client(n * 100),
      inbox: [],
      session: null,
    }));

    for (const replica of replicas) {
      replica.doc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin === REMOTE) return;
        for (const other of replicas) {
          if (other !== replica) other.inbox.push(update);
        }
      });
    }
    return replicas;
  }

  function run(seed: number, steps: number): Replica[] {
    const random = seededRandom(seed);
    // Position keys are jittered with Math.random; make that repeatable too.
    vi.spyOn(Math, "random").mockImplementation(random);

    const below = (limit: number) => Math.floor(random() * limit);
    const pick = <T>(list: readonly T[]): T | undefined =>
      list[below(list.length)];

    /** Applies one waiting update, chosen at random: out of order on purpose. */
    function receive(replica: Replica): void {
      if (replica.inbox.length === 0) return;
      const [update] = replica.inbox.splice(below(replica.inbox.length), 1);
      Y.applyUpdate(replica.doc, update!, REMOTE);
    }

    function type(session: TextSession): void {
      const text = session.getText();
      const index = below(text.length + 1);
      const remove = random() < 0.4 ? below(3) : 0;
      const insert = random() < 0.8 ? pick(["a", "bc", " ", "\u{1F600}"])! : "";
      session.splice(index, remove, insert);
    }

    function change(replica: Replica, step: number): void {
      const { store } = replica;
      const view = store.getSnapshot();
      const column = pick(view.columns);
      const card = pick(view.columns.flatMap((c) => c.cards));
      const roll = random();

      if (roll < 0.14 && column) {
        store.addCard(column.id, `card ${step}`);
      } else if (roll < 0.44 && column && card) {
        store.moveCard(card.id, column.id, below(5));
      } else if (roll < 0.5 && card) {
        store.deleteCard(card.id);
      } else if (roll < 0.58 && card) {
        store.updateCard(card.id, { title: `${card.title} ${step}` });
      } else if (roll < 0.63 && view.columns.length < 6) {
        store.addColumn(`column ${step}`);
      } else if (roll < 0.68 && column) {
        store.renameColumn(column.id, `${column.title}!`);
      } else if (roll < 0.76 && column) {
        store.moveColumn(column.id, below(view.columns.length));
      } else if (roll < 0.79 && column) {
        store.deleteColumn(column.id);
      } else if (roll < 0.84 && !replica.session) {
        replica.session =
          random() < 0.7 && card
            ? store.editCardTitle(card.id)
            : column
              ? store.editColumnTitle(column.id)
              : null;
      } else if (roll < 0.94 && replica.session) {
        type(replica.session);
      } else if (replica.session) {
        if (random() < 0.5) replica.session.commit();
        else replica.session.cancel();
        replica.session = null;
      }
    }

    const replicas = threeReplicas();
    for (let step = 0; step < steps; step++) {
      const replica = pick(replicas)!;
      if (random() < 0.35) receive(replica);
      else change(replica, step);
      expectEveryCardOnce(replica);
    }

    // Finish what is being typed, then let every update arrive, still in
    // random order. Ending a session can itself produce updates.
    for (const replica of replicas) {
      replica.session?.commit();
      replica.session = null;
    }
    while (replicas.some((replica) => replica.inbox.length > 0)) {
      receive(pick(replicas.filter((replica) => replica.inbox.length > 0))!);
    }
    return replicas;
  }

  const seeds = Array.from({ length: 40 }, (_, n) => n + 1);

  it.each(seeds)("ends with one board for everyone (seed %i)", (seed) => {
    const [one, two, three] = run(seed, 250) as [Replica, Replica, Replica];

    // Equal boards, as stored and as shown.
    expect(readBoardState(two.doc)).toEqual(readBoardState(one.doc));
    expect(readBoardState(three.doc)).toEqual(readBoardState(one.doc));
    expect(two.store.getSnapshot()).toEqual(one.store.getSnapshot());
    expect(three.store.getSnapshot()).toEqual(one.store.getSnapshot());

    // No card twice, every card in exactly one column.
    for (const replica of [one, two, three]) expectEveryCardOnce(replica);

    // Someone who opens the board now, from a saved copy, sees the same.
    const late = new Y.Doc();
    Y.applyUpdate(late, Y.encodeStateAsUpdate(one.doc));
    const lateStore: BoardStore = createYjsBoardStore(late);
    expect(lateStore.getSnapshot()).toEqual(one.store.getSnapshot());
  });

  it("really does change the board in these runs", () => {
    // Guards the test above against passing because nothing happened.
    const [one] = run(1, 250) as [Replica];
    const state = readBoardState(one.doc);

    expect(state).not.toEqual(BOARD);
    expect(Object.keys(state.cards).length).toBeGreaterThan(0);
    expect(Object.keys(state.columns).length).toBeGreaterThan(0);
  });
});
