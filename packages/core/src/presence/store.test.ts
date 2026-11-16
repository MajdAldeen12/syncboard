import { describe, expect, it, vi } from "vitest";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import * as Y from "yjs";
import {
  EMPTY_PRESENCE,
  PRESENCE_INTERVAL_MS,
  createPresenceStore,
  itemKey,
  parsePresence,
  type PresenceUser,
} from "./index";
import { fakeClock } from "./testing";

const ME: PresenceUser = { id: "u-me", name: "Me", color: "#2563eb" };
const ANA: PresenceUser = { id: "u-ana", name: "Ana", color: "#dc2626" };

function awareness(clientId: number): Awareness {
  const doc = new Y.Doc();
  doc.clientID = clientId;
  const created = new Awareness(doc);
  // The protocol's timer would keep the test process alive.
  clearInterval(created._checkInterval);
  return created;
}

/** Carries every change of one awareness to the other, as a server would. */
function link(a: Awareness, b: Awareness): void {
  const forward = (from: Awareness, to: Awareness) =>
    from.on(
      "update",
      (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === "network") return;
        const ids = [...changes.added, ...changes.updated, ...changes.removed];
        applyAwarenessUpdate(to, encodeAwarenessUpdate(from, ids), "network");
      },
    );
  forward(a, b);
  forward(b, a);
}

/** Me with a store, and Ana on the other end of the connection. */
function setUp() {
  const clock = fakeClock();
  const mine = awareness(1);
  const hers = awareness(2);
  link(mine, hers);

  const store = createPresenceStore(clock);
  /** How many times my state has been sent out. */
  let sent = 0;
  mine.on("update", (_changes: unknown, origin: unknown) => {
    if (origin === "local") sent += 1;
  });

  return {
    clock,
    mine,
    hers,
    store,
    sent: () => sent,
    /** What Ana's browser holds about me. */
    seenByAna: () => parsePresence(hers.getStates().get(1)),
  };
}

const idle = (user: PresenceUser) => ({
  user,
  cursor: null,
  editing: null,
  dragging: null,
});

describe("createPresenceStore", () => {
  it("shows nobody before it is attached", () => {
    const { store } = setUp();

    expect(store.getSnapshot()).toBe(EMPTY_PRESENCE);
  });

  it("announces the user as soon as it is attached", () => {
    const { store, mine, seenByAna } = setUp();

    store.attach(mine, ME);

    expect(seenByAna()).toEqual(idle(ME));
    expect(store.getSnapshot().people).toEqual([{ ...ME, isSelf: true }]);
  });

  it("lists someone who joins and drops them when they leave", () => {
    const { store, mine, hers } = setUp();
    store.attach(mine, ME);
    const listener = vi.fn();
    store.subscribe(listener);

    hers.setLocalState(idle(ANA));
    expect(store.getSnapshot().people.map((person) => person.name)).toEqual([
      "Me",
      "Ana",
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    hers.setLocalState(null);
    expect(store.getSnapshot().people.map((person) => person.name)).toEqual([
      "Me",
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops telling a listener that unsubscribed", () => {
    const { store, mine, hers } = setUp();
    store.attach(mine, ME);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    hers.setLocalState(idle(ANA));

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not report this tab's own changes as news", () => {
    const { store, mine, clock } = setUp();
    store.attach(mine, ME);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();

    store.setCursor({ over: "board", x: 10, y: 10 });
    clock.advance(1_000);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(before);
  });

  it("sends cursor moves about 15 times a second, and always the last one", () => {
    const { store, mine, clock, sent, seenByAna } = setUp();
    store.attach(mine, ME);
    const afterJoining = sent();

    // A pointer reporting 250 times a second for two seconds.
    for (let step = 0; step < 500; step += 1) {
      store.setCursor({ over: "board", x: step, y: 0 });
      clock.advance(4);
    }
    clock.advance(1_000);

    const messages = sent() - afterJoining;
    expect(messages).toBeLessThanOrEqual(2_000 / PRESENCE_INTERVAL_MS + 2);
    expect(messages).toBeGreaterThanOrEqual(28);
    expect(seenByAna()?.cursor).toEqual({ over: "board", x: 499, y: 0 });
  });

  it("sends nothing and keeps no timer while the pointer is still", () => {
    const { store, mine, clock, sent } = setUp();
    store.attach(mine, ME);
    store.setCursor({ over: "board", x: 1, y: 1 });
    store.setCursor({ over: "board", x: 2, y: 2 });
    clock.advance(PRESENCE_INTERVAL_MS);
    const afterMoving = sent();

    clock.advance(10 * 60_000);

    expect(sent()).toBe(afterMoving);
    expect(clock.pending()).toBe(0);
  });

  it("does not send a state that says nothing new", () => {
    const { store, mine, clock, sent } = setUp();
    store.attach(mine, ME);
    const afterJoining = sent();

    // The pointer is outside the board and stays there.
    for (let step = 0; step < 20; step += 1) {
      store.setCursor(null);
      clock.advance(100);
    }

    expect(sent()).toBe(afterJoining);
    expect(clock.pending()).toBe(0);
  });

  it("says what is being edited, and stops when the edit ends", () => {
    const { store, mine, clock, seenByAna } = setUp();
    store.attach(mine, ME);
    const card = { kind: "card", id: "c1" } as const;

    store.startEditing(card);
    clock.advance(PRESENCE_INTERVAL_MS);
    expect(seenByAna()?.editing).toEqual(card);

    store.stopEditing(card);
    clock.advance(PRESENCE_INTERVAL_MS);
    expect(seenByAna()?.editing).toBeNull();
  });

  it("keeps the current edit when an earlier one reports that it ended", () => {
    // Moving from one field straight to the next: the second opens before
    // the first has finished closing.
    const { store, mine, clock, seenByAna } = setUp();
    store.attach(mine, ME);
    const first = { kind: "card", id: "c1" } as const;
    const second = { kind: "card", id: "c2" } as const;

    store.startEditing(first);
    store.startEditing(second);
    store.stopEditing(first);
    clock.advance(PRESENCE_INTERVAL_MS);

    expect(seenByAna()?.editing).toEqual(second);
  });

  it("says what is being dragged, and stops when it is dropped", () => {
    const { store, mine, clock, seenByAna } = setUp();
    store.attach(mine, ME);
    const column = { kind: "column", id: "col1" } as const;

    store.startDragging(column);
    clock.advance(PRESENCE_INTERVAL_MS);
    expect(seenByAna()?.dragging).toEqual(column);

    store.stopDragging();
    clock.advance(PRESENCE_INTERVAL_MS);
    expect(seenByAna()?.dragging).toBeNull();
  });

  it("shows what the others are editing", () => {
    const { store, mine, hers } = setUp();
    store.attach(mine, ME);
    const card = { kind: "card", id: "c1" } as const;

    hers.setLocalState({ ...idle(ANA), editing: card });

    expect(store.getSnapshot().activity.get(itemKey(card))).toEqual([
      { user: ANA, doing: "editing" },
    ]);
  });

  it("carries on with a new connection where the old one stopped", () => {
    const { store, mine, clock } = setUp();
    const detach = store.attach(mine, ME);
    const card = { kind: "card", id: "c1" } as const;
    store.startEditing(card);
    clock.advance(PRESENCE_INTERVAL_MS);
    detach();

    // The page reconnects with a provider, and so an awareness, of its own.
    const next = awareness(3);
    store.attach(next, ME);

    expect(parsePresence(next.getLocalState())).toEqual({
      ...idle(ME),
      editing: card,
    });
  });

  it("stops sending and forgets the others once detached", () => {
    const { store, mine, hers, clock, sent } = setUp();
    const detach = store.attach(mine, ME);
    hers.setLocalState(idle(ANA));
    const listener = vi.fn();
    store.subscribe(listener);
    store.setCursor({ over: "board", x: 1, y: 1 });
    store.setCursor({ over: "board", x: 2, y: 2 });
    const beforeDetaching = sent();

    detach();
    clock.advance(1_000);
    store.setCursor({ over: "board", x: 3, y: 3 });
    clock.advance(1_000);

    expect(sent()).toBe(beforeDetaching);
    expect(clock.pending()).toBe(0);
    expect(store.getSnapshot()).toBe(EMPTY_PRESENCE);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores a detach that comes after a newer attach", () => {
    // React runs an effect, its clean-up and the effect again in development.
    const { store, mine, hers } = setUp();
    const detachFirst = store.attach(mine, ME);
    detachFirst();
    store.attach(mine, ME);

    detachFirst();
    hers.setLocalState(idle(ANA));

    expect(store.getSnapshot().people.map((person) => person.name)).toEqual([
      "Me",
      "Ana",
    ]);
  });
});
