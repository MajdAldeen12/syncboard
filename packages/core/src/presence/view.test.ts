import { describe, expect, it } from "vitest";
import {
  EMPTY_PRESENCE,
  itemKey,
  readPresence,
  type Presence,
  type PresenceUser,
} from "./index";

const ME: PresenceUser = { id: "u-me", name: "Me", color: "#2563eb" };
const ANA: PresenceUser = { id: "u-ana", name: "Ana", color: "#dc2626" };
const BO: PresenceUser = { id: "u-bo", name: "Bo", color: "#15803d" };

function state(user: PresenceUser, rest: Partial<Presence> = {}): Presence {
  return { user, cursor: null, editing: null, dragging: null, ...rest };
}

const SELF = { clientId: 1, user: ME };

describe("readPresence", () => {
  it("lists me first, then the others in the order they arrived", () => {
    const view = readPresence(
      new Map<number, unknown>([
        [30, state(BO)],
        [1, state(ME)],
        [20, state(ANA)],
      ]),
      SELF,
    );

    expect(view.people).toEqual([
      { ...ME, isSelf: true },
      { ...BO, isSelf: false },
      { ...ANA, isSelf: false },
    ]);
  });

  it("leaves my own client out of the others", () => {
    const view = readPresence(
      new Map<number, unknown>([
        [1, state(ME)],
        [20, state(ANA)],
      ]),
      SELF,
    );

    expect(view.others.map((other) => other.clientId)).toEqual([20]);
  });

  it("shows a person once however many tabs they have open", () => {
    const view = readPresence(
      new Map<number, unknown>([
        [20, state(ANA)],
        [21, state(ANA)],
        // Another tab of mine is a client of its own, but it is still me.
        [2, state(ME)],
      ]),
      SELF,
    );

    expect(view.people.map((person) => person.name)).toEqual(["Me", "Ana"]);
    // Every tab still has its own cursor.
    expect(view.others.map((other) => other.clientId)).toEqual([20, 21, 2]);
  });

  it("skips states it cannot read", () => {
    const view = readPresence(
      new Map<number, unknown>([
        [20, { user: { id: "x", name: "", color: "#000000" } }],
        [21, "not a state"],
        [22, {}],
        [23, state(ANA)],
      ]),
      SELF,
    );

    expect(view.others.map((other) => other.clientId)).toEqual([23]);
  });

  it("lists nobody but me when I am alone", () => {
    const view = readPresence(new Map<number, unknown>(), SELF);

    expect(view.people).toEqual([{ ...ME, isSelf: true }]);
    expect(view.others).toEqual([]);
  });

  it("lists the others even before I have a name myself", () => {
    const view = readPresence(new Map<number, unknown>([[20, state(ANA)]]), {
      clientId: 1,
      user: null,
    });

    expect(view.people).toEqual([{ ...ANA, isSelf: false }]);
  });

  it("says who is editing and who is dragging each item", () => {
    const card = { kind: "card", id: "c1" } as const;
    const column = { kind: "column", id: "col1" } as const;
    const view = readPresence(
      new Map<number, unknown>([
        [20, state(ANA, { editing: card })],
        [30, state(BO, { editing: card, dragging: column })],
      ]),
      SELF,
    );

    expect(view.activity.get(itemKey(card))).toEqual([
      { user: ANA, doing: "editing" },
      { user: BO, doing: "editing" },
    ]);
    expect(view.activity.get(itemKey(column))).toEqual([
      { user: BO, doing: "dragging" },
    ]);
    expect(view.activity.get(itemKey({ kind: "card", id: "c2" }))).toBe(
      undefined,
    );
  });

  it("does not report my own editing back to me", () => {
    const view = readPresence(
      new Map<number, unknown>([
        [1, state(ME, { editing: { kind: "card", id: "c1" } })],
      ]),
      SELF,
    );

    expect(view.activity.size).toBe(0);
  });

  describe("reusing what did not change", () => {
    const card = { kind: "card", id: "c1" } as const;
    const before = new Map<number, unknown>([
      [20, state(ANA, { editing: card })],
      [30, state(BO)],
    ]);

    it("returns the same view when nothing changed", () => {
      const first = readPresence(before, SELF);
      // New objects with the same content, as a fresh message would carry.
      const again = new Map<number, unknown>([
        [20, state(ANA, { editing: { ...card } })],
        [30, state(BO)],
      ]);

      expect(readPresence(again, SELF, first)).toBe(first);
    });

    it("keeps people and activity when only a cursor moved", () => {
      const first = readPresence(before, SELF);
      const moved = new Map<number, unknown>([
        [20, state(ANA, { editing: card })],
        [30, state(BO, { cursor: { over: "board", x: 10, y: 20 } })],
      ]);

      const second = readPresence(moved, SELF, first);

      expect(second).not.toBe(first);
      expect(second.people).toBe(first.people);
      expect(second.activity).toBe(first.activity);
      // The person who did not move is the same object, so a component
      // drawing them has nothing to do.
      expect(second.others[0]).toBe(first.others[0]);
      expect(second.others[1]).not.toBe(first.others[1]);
    });

    it("keeps an item's activity when someone starts on another item", () => {
      const first = readPresence(before, SELF);
      const next = new Map<number, unknown>([
        [20, state(ANA, { editing: card })],
        [30, state(BO, { editing: { kind: "card", id: "c2" } })],
      ]);

      const second = readPresence(next, SELF, first);

      expect(second.activity).not.toBe(first.activity);
      expect(second.activity.get(itemKey(card))).toBe(
        first.activity.get(itemKey(card)),
      );
      expect(second.people).toBe(first.people);
    });

    it("changes people when someone leaves", () => {
      const first = readPresence(before, SELF);
      const second = readPresence(
        new Map<number, unknown>([[30, state(BO)]]),
        SELF,
        first,
      );

      expect(second.people.map((person) => person.name)).toEqual(["Me", "Bo"]);
      expect(second.activity.size).toBe(0);
    });
  });

  it("starts from an empty view", () => {
    expect(EMPTY_PRESENCE.people).toEqual([]);
    expect(EMPTY_PRESENCE.others).toEqual([]);
    expect(EMPTY_PRESENCE.activity.size).toBe(0);
  });
});
