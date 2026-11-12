/**
 * Ordering by fractional index.
 *
 * Every column and card carries an `order` key. Moving an item means giving
 * it a new key between its new neighbours; nothing else in the list changes.
 * That is what lets two people reorder the same list at once without
 * conflicts: each move is one small write to one item.
 */

import {
  generateJitteredKeyBetween,
  generateNKeysBetween,
} from "fractional-indexing-jittered";

export type OrderKey = string;

export interface Ordered {
  readonly id: string;
  readonly order: OrderKey;
}

/**
 * Sorts by order key, then by id. Keys are compared by character code,
 * which is how the key alphabet is defined; a locale-aware comparison would
 * sort them wrongly. The id tie-break makes equal keys sort identically on
 * every client.
 */
export function compareOrdered(a: Ordered, b: Ordered): number {
  if (a.order < b.order) return -1;
  if (a.order > b.order) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * A key that sorts between two neighbours. Pass `null` for an open end.
 * The key is jittered, so two clients inserting at the same spot at the
 * same time almost never produce the same key.
 */
export function orderBetween(
  before: OrderKey | null,
  after: OrderKey | null,
): OrderKey {
  return generateJitteredKeyBetween(before, after);
}

/**
 * Evenly spaced keys for a list created in one go. These are not jittered:
 * seed content must come out identical wherever it is generated.
 */
export function initialOrders(count: number): OrderKey[] {
  return count > 0 ? generateNKeysBetween(null, null, count) : [];
}

/**
 * The key that places an item at `index` among `siblings`.
 *
 * `siblings` must be sorted and must not contain the item being placed.
 * The index is clamped to the list. Neighbours that share a key (possible
 * after a concurrent insert) are tolerated: the new key lands after the
 * item before it and ahead of the next distinct key.
 */
export function orderAtIndex(
  siblings: readonly Ordered[],
  index: number,
): OrderKey {
  const at = Math.max(0, Math.min(index, siblings.length));
  const before = at > 0 ? siblings[at - 1]!.order : null;

  let after: OrderKey | null = null;
  for (let i = at; i < siblings.length; i++) {
    const candidate = siblings[i]!.order;
    if (before === null || candidate > before) {
      after = candidate;
      break;
    }
  }

  return orderBetween(before, after);
}
