"use client";

import {
  EMPTY_PRESENCE,
  type ItemRef,
  type PresenceStore,
  type PresenceView,
} from "@syncboard/core/presence";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

const PresenceContext = createContext<PresenceStore | null>(null);

/** Makes a board's presence available to the components drawn inside it. */
export const PresenceProvider = PresenceContext.Provider;

/**
 * One part of who is on the board. `select` must return a part of the view
 * as it is (`view.people`, `view.activity`, `view.others`): each keeps its
 * identity until it changes, so the component is redrawn only then, and not
 * every time somebody's pointer moves.
 */
export function usePresence<T>(
  store: PresenceStore,
  select: (view: PresenceView) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(EMPTY_PRESENCE),
  );
}

/**
 * Tells the others that `item` is being edited, for as long as the calling
 * component is on screen. Does nothing outside a board or without an item.
 */
export function useAnnounceEditing(item: ItemRef | undefined): void {
  const store = useContext(PresenceContext);
  const kind = item?.kind;
  const id = item?.id;

  useEffect(() => {
    if (!store || !kind || !id) return;

    const editing = { kind, id };
    store.startEditing(editing);
    return () => store.stopEditing(editing);
  }, [store, kind, id]);
}
