import { describe, expect, it } from "vitest";
import {
  compareOrdered,
  initialOrders,
  orderAtIndex,
  orderBetween,
  type Ordered,
} from "./index";

function item(id: string, order: string): Ordered {
  return { id, order };
}

/** Deterministic pseudo-random numbers so a failing run can be repeated. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("compareOrdered", () => {
  it("sorts by order key", () => {
    const [a, b, c] = initialOrders(3);
    const list = [item("x", c!), item("y", a!), item("z", b!)];

    expect(list.sort(compareOrdered).map((i) => i.id)).toEqual(["y", "z", "x"]);
  });

  it("breaks ties on id so every client sorts equal keys the same way", () => {
    const [key] = initialOrders(1);
    const list = [item("b", key!), item("c", key!), item("a", key!)];

    expect(list.sort(compareOrdered).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("compares by character code, not by locale", () => {
    // In the key alphabet upper-case letters sort before lower-case ones.
    expect(compareOrdered(item("1", "Zz"), item("2", "a0"))).toBeLessThan(0);
  });
});

describe("initialOrders", () => {
  it("returns strictly ascending keys", () => {
    const keys = initialOrders(25);

    expect(keys).toHaveLength(25);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  it("returns nothing when asked for nothing", () => {
    expect(initialOrders(0)).toEqual([]);
  });
});

describe("orderBetween", () => {
  it("returns a key for an empty list", () => {
    expect(orderBetween(null, null)).toMatch(/\S/);
  });

  it("returns a key strictly between two neighbours", () => {
    const [low, high] = initialOrders(2);
    const key = orderBetween(low!, high!);

    expect(low! < key).toBe(true);
    expect(key < high!).toBe(true);
  });

  it("returns a key before the first and after the last", () => {
    const [first, last] = initialOrders(2);

    expect(orderBetween(null, first!) < first!).toBe(true);
    expect(orderBetween(last!, null) > last!).toBe(true);
  });

  it("is jittered, so two clients inserting at the same spot rarely collide", () => {
    const [low, high] = initialOrders(2);
    const keys = new Set<string>();
    for (let i = 0; i < 20; i++) keys.add(orderBetween(low!, high!));

    expect(keys.size).toBeGreaterThan(1);
  });
});

describe("orderAtIndex", () => {
  const siblings = initialOrders(3).map((order, i) => item(`s${i}`, order));

  function positionOf(order: string, list: readonly Ordered[]): number {
    const sorted = [...list, item("new", order)].sort(compareOrdered);
    return sorted.findIndex((i) => i.id === "new");
  }

  it("places an item in an empty list", () => {
    expect(orderAtIndex([], 0)).toMatch(/\S/);
  });

  it.each([0, 1, 2, 3])("places an item at index %i", (index) => {
    expect(positionOf(orderAtIndex(siblings, index), siblings)).toBe(index);
  });

  it("clamps an index outside the list", () => {
    expect(positionOf(orderAtIndex(siblings, -5), siblings)).toBe(0);
    expect(positionOf(orderAtIndex(siblings, 99), siblings)).toBe(3);
  });

  it("does not throw when neighbours share a key", () => {
    const [low, high] = initialOrders(2);
    const colliding = [item("a", low!), item("b", low!), item("c", high!)];

    const key = orderAtIndex(colliding, 1);

    expect(key > low!).toBe(true);
    expect(key < high!).toBe(true);
  });

  it("does not throw when every sibling shares one key", () => {
    const [key] = initialOrders(1);
    const colliding = [item("a", key!), item("b", key!)];

    expect(orderAtIndex(colliding, 1) > key!).toBe(true);
    expect(orderAtIndex(colliding, 0) < key!).toBe(true);
  });

  it("keeps a list consistent across many random insertions", () => {
    const random = seededRandom(42);
    const expected: string[] = [];
    let list: Ordered[] = [];

    for (let n = 0; n < 300; n++) {
      const index = Math.floor(random() * (expected.length + 1));
      const id = `i${n}`;
      const sorted = [...list].sort(compareOrdered);

      list = [...list, item(id, orderAtIndex(sorted, index))];
      expected.splice(index, 0, id);
    }

    expect([...list].sort(compareOrdered).map((i) => i.id)).toEqual(expected);
  });
});
