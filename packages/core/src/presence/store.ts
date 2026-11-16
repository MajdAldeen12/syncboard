import {
  PRESENCE_INTERVAL_MS,
  createThrottle,
  type Throttle,
  type ThrottleClock,
} from "./throttle";
import type { CursorPosition, ItemRef, Presence, PresenceUser } from "./types";
import {
  EMPTY_PRESENCE,
  readPresence,
  sameCursor,
  sameItem,
  type PresenceView,
} from "./view";

/**
 * The part of the Yjs awareness protocol this module uses. Spelled out so
 * that this package does not depend on y-protocols.
 */
export interface AwarenessLike {
  readonly clientID: number;
  getStates(): ReadonlyMap<number, unknown>;
  setLocalState(state: { [key: string]: unknown } | null): void;
  on(name: "change", listener: () => void): void;
  off(name: "change", listener: () => void): void;
}

/**
 * This tab's presence on a board: what it tells the others, and what the
 * others have told it.
 */
export interface PresenceStore {
  /** Everyone on the board. The same object until something changes. */
  getSnapshot(): PresenceView;
  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;

  /** Where this tab's pointer is. Null when it is not over the board. */
  setCursor(cursor: CursorPosition | null): void;
  startEditing(item: ItemRef): void;
  /** Ends the edit of `item`. Ignored if something else is being edited by now. */
  stopEditing(item: ItemRef): void;
  startDragging(item: ItemRef): void;
  stopDragging(): void;

  /**
   * Starts announcing `user` through `awareness` and listening to it.
   * Returns a function that stops both. What was being edited or dragged is
   * kept, so attaching again, after a reconnect for instance, carries on.
   */
  attach(awareness: AwarenessLike, user: PresenceUser): () => void;
}

interface Attachment {
  readonly awareness: AwarenessLike;
  readonly user: PresenceUser;
  readonly throttle: Throttle<Presence>;
}

/**
 * Creates the store. Nothing is sent until `attach` is called.
 *
 * Everything this tab says about itself goes through one throttle, so it
 * sends at most one message per `PRESENCE_INTERVAL_MS` whatever the pointer
 * is doing, and none at all while nothing changes.
 */
export function createPresenceStore(clock: ThrottleClock): PresenceStore {
  const listeners = new Set<() => void>();
  let view = EMPTY_PRESENCE;
  let attached: Attachment | null = null;

  let cursor: CursorPosition | null = null;
  let editing: ItemRef | null = null;
  let dragging: ItemRef | null = null;

  function show(next: PresenceView): void {
    if (next === view) return;
    view = next;
    for (const listener of [...listeners]) listener();
  }

  /** Offers the current state for sending. Does nothing while detached. */
  function publish(): void {
    attached?.throttle.push({
      user: attached.user,
      cursor,
      editing,
      dragging,
    });
  }

  return {
    getSnapshot: () => view,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setCursor(next) {
      if (sameCursor(cursor, next)) return;
      cursor = next;
      publish();
    },

    startEditing(item) {
      if (sameItem(editing, item)) return;
      editing = item;
      publish();
    },

    stopEditing(item) {
      if (!sameItem(editing, item)) return;
      editing = null;
      publish();
    },

    startDragging(item) {
      if (sameItem(dragging, item)) return;
      dragging = item;
      publish();
    },

    stopDragging() {
      if (dragging === null) return;
      dragging = null;
      publish();
    },

    attach(awareness, user) {
      attached?.throttle.cancel();

      const mine: Attachment = {
        awareness,
        user,
        throttle: createThrottle<Presence>(
          PRESENCE_INTERVAL_MS,
          (state) => awareness.setLocalState({ ...state }),
          clock,
        ),
      };
      attached = mine;

      const read = () => {
        if (attached !== mine) return;
        show(
          readPresence(
            awareness.getStates(),
            { clientId: awareness.clientID, user },
            view,
          ),
        );
      };
      awareness.on("change", read);

      // The announcement itself is not held back: it happens once per
      // connection, and the others should see the newcomer at once.
      awareness.setLocalState({ user, cursor, editing, dragging });
      read();

      return () => {
        awareness.off("change", read);
        // A detach that arrives after a newer attach has nothing left to do.
        if (attached !== mine) return;
        mine.throttle.cancel();
        attached = null;
        show(EMPTY_PRESENCE);
      };
    },
  };
}
