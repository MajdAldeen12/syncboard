import { parsePresence } from "./parse";
import type { CursorPosition, ItemRef, Presence, PresenceUser } from "./types";

/** Someone else's client, with the id Yjs gave it. */
export interface RemotePresence extends Presence {
  readonly clientId: number;
}

/** A person on the board, however many tabs they have open. */
export interface Person extends PresenceUser {
  readonly isSelf: boolean;
}

/** Someone doing something to a card or a column. */
export interface Activity {
  readonly user: PresenceUser;
  readonly doing: "editing" | "dragging";
}

/**
 * Everyone on the board, arranged for drawing.
 *
 * Cursors change many times a second; who is here and what they have open
 * change rarely. Each part keeps its identity until it really changes, so a
 * component that reads `people` is not redrawn because a pointer moved.
 */
export interface PresenceView {
  /** Every other client, in the order they arrived. One cursor each. */
  readonly others: readonly RemotePresence[];
  /** Each person once, this one first. */
  readonly people: readonly Person[];
  /** Who is editing or dragging each item, by `itemKey`. */
  readonly activity: ReadonlyMap<string, readonly Activity[]>;
}

export const EMPTY_PRESENCE: PresenceView = {
  others: [],
  people: [],
  activity: new Map(),
};

/** The key an item's activity is filed under. */
export function itemKey(item: ItemRef): string {
  return `${item.kind}:${item.id}`;
}

function sameUser(a: PresenceUser, b: PresenceUser): boolean {
  return a.id === b.id && a.name === b.name && a.color === b.color;
}

export function sameItem(a: ItemRef | null, b: ItemRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

export function sameCursor(
  a: CursorPosition | null,
  b: CursorPosition | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.over !== b.over || a.x !== b.x || a.y !== b.y) return false;
  return a.over === "board" || b.over === "board" || a.id === b.id;
}

function samePresence(a: Presence, b: Presence): boolean {
  return (
    sameUser(a.user, b.user) &&
    sameCursor(a.cursor, b.cursor) &&
    sameItem(a.editing, b.editing) &&
    sameItem(a.dragging, b.dragging)
  );
}

function sameList<T>(
  a: readonly T[],
  b: readonly T[],
  same: (a: T, b: T) => boolean,
): boolean {
  return (
    a.length === b.length && a.every((item, index) => same(item, b[index]!))
  );
}

const identical = <T>(a: T, b: T) => a === b;

/**
 * Reads everyone's presence out of the raw states, by client id, as the
 * awareness protocol holds them. States that cannot be read are skipped.
 *
 * Pass the previous view to get unchanged parts back as the same objects.
 */
export function readPresence(
  states: Iterable<readonly [number, unknown]>,
  self: { readonly clientId: number; readonly user: PresenceUser | null },
  previous: PresenceView = EMPTY_PRESENCE,
): PresenceView {
  const before = new Map(
    previous.others.map((other) => [other.clientId, other]),
  );

  const read: RemotePresence[] = [];
  for (const [clientId, raw] of states) {
    if (clientId === self.clientId) continue;
    const parsed = parsePresence(raw);
    if (parsed === null) continue;

    const known = before.get(clientId);
    read.push(
      known && samePresence(known, parsed) ? known : { ...parsed, clientId },
    );
  }
  const others = sameList(previous.others, read, identical)
    ? previous.others
    : read;

  const listed: Person[] = [];
  const seen = new Set<string>();
  if (self.user) {
    listed.push({ ...self.user, isSelf: true });
    seen.add(self.user.id);
  }
  for (const other of others) {
    if (seen.has(other.user.id)) continue;
    seen.add(other.user.id);
    listed.push({ ...other.user, isSelf: false });
  }
  const people = sameList(
    previous.people,
    listed,
    (a, b) => a.isSelf === b.isSelf && sameUser(a, b),
  )
    ? previous.people
    : listed;

  const found = new Map<string, Activity[]>();
  const note = (item: ItemRef | null, entry: Activity) => {
    if (item === null) return;
    const key = itemKey(item);
    const list = found.get(key);
    if (list) list.push(entry);
    else found.set(key, [entry]);
  };
  for (const other of others) {
    note(other.editing, { user: other.user, doing: "editing" });
    note(other.dragging, { user: other.user, doing: "dragging" });
  }

  const sameActivity = (a: Activity, b: Activity) =>
    a.doing === b.doing && sameUser(a.user, b.user);
  let activityChanged = found.size !== previous.activity.size;
  const merged = new Map<string, readonly Activity[]>();
  for (const [key, list] of found) {
    const known = previous.activity.get(key);
    if (known && sameList(known, list, sameActivity)) {
      merged.set(key, known);
    } else {
      merged.set(key, list);
      activityChanged = true;
    }
  }
  const activity = activityChanged ? merged : previous.activity;

  if (
    others === previous.others &&
    people === previous.people &&
    activity === previous.activity
  ) {
    return previous;
  }
  return { others, people, activity };
}
