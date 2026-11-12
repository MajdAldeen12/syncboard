import { nanoid } from "nanoid";
import { orderAtIndex } from "../ordering/index";
import { selectBoard } from "./select";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type BoardState,
  type BoardStore,
  type BoardView,
  type CardPatch,
} from "./types";

export interface LocalBoardStoreOptions {
  /** Generates ids for new columns and cards. Defaults to random ids. */
  readonly createId?: () => string;
}

/** Cuts text to `max` UTF-16 units without splitting a surrogate pair. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  const splitsPair = last >= 0xd800 && last <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max);
}

/** A trimmed, length-capped title, or null if nothing is left. */
function cleanTitle(raw: string): string | null {
  const title = truncate(raw.trim(), MAX_TITLE_LENGTH);
  return title.length > 0 ? title : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function omit<T>(
  record: Readonly<Record<string, T>>,
  remove: (id: string, value: T) => boolean,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [id, value] of Object.entries(record)) {
    if (!remove(id, value)) next[id] = value;
  }
  return next;
}

/**
 * A board held in memory, for a single browser tab. It implements the same
 * `BoardStore` interface a shared store does.
 */
export function createLocalBoardStore(
  initial: BoardState,
  options: LocalBoardStoreOptions = {},
): BoardStore {
  const createId = options.createId ?? (() => nanoid(12));
  const listeners = new Set<() => void>();
  let state = initial;
  let view: BoardView = selectBoard(state);

  function commit(next: BoardState): void {
    state = next;
    view = selectBoard(state);
    for (const listener of [...listeners]) listener();
  }

  // Ids arrive from the UI. `Object.hasOwn` keeps a stray "constructor" or
  // "__proto__" from matching something on the prototype.
  const column = (id: string) =>
    Object.hasOwn(state.columns, id) ? state.columns[id] : undefined;
  const card = (id: string) =>
    Object.hasOwn(state.cards, id) ? state.cards[id] : undefined;
  const columnView = (id: string) => view.columns.find((c) => c.id === id);

  return {
    getSnapshot: () => view,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    addColumn(rawTitle) {
      const title = cleanTitle(rawTitle);
      if (title === null) return null;

      const id = createId();
      const order = orderAtIndex(view.columns, view.columns.length);
      commit({
        ...state,
        columns: { ...state.columns, [id]: { title, order } },
      });
      return id;
    },

    renameColumn(columnId, rawTitle) {
      const current = column(columnId);
      const title = cleanTitle(rawTitle);
      if (!current || title === null || title === current.title) return;

      commit({
        ...state,
        columns: { ...state.columns, [columnId]: { ...current, title } },
      });
    },

    deleteColumn(columnId) {
      if (!column(columnId)) return;

      commit({
        ...state,
        columns: omit(state.columns, (id) => id === columnId),
        cards: omit(state.cards, (_, c) => c.columnId === columnId),
      });
    },

    moveColumn(columnId, toIndex) {
      const current = column(columnId);
      if (!current) return;

      const siblings = view.columns.filter((c) => c.id !== columnId);
      const from = view.columns.findIndex((c) => c.id === columnId);
      const to = clamp(toIndex, 0, siblings.length);
      if (to === from) return;

      const order = orderAtIndex(siblings, to);
      commit({
        ...state,
        columns: { ...state.columns, [columnId]: { ...current, order } },
      });
    },

    addCard(columnId, rawTitle) {
      const target = columnView(columnId);
      const title = cleanTitle(rawTitle);
      if (!target || title === null) return null;

      const id = createId();
      const order = orderAtIndex(target.cards, target.cards.length);
      commit({
        ...state,
        cards: {
          ...state.cards,
          [id]: { columnId, order, title, description: "" },
        },
      });
      return id;
    },

    updateCard(cardId, patch: CardPatch) {
      const current = card(cardId);
      if (!current) return;

      const title =
        patch.title === undefined
          ? current.title
          : (cleanTitle(patch.title) ?? current.title);
      const description =
        patch.description === undefined
          ? current.description
          : truncate(patch.description, MAX_DESCRIPTION_LENGTH);
      if (title === current.title && description === current.description) {
        return;
      }

      commit({
        ...state,
        cards: { ...state.cards, [cardId]: { ...current, title, description } },
      });
    },

    deleteCard(cardId) {
      if (!card(cardId)) return;

      commit({ ...state, cards: omit(state.cards, (id) => id === cardId) });
    },

    moveCard(cardId, toColumnId, toIndex) {
      const current = card(cardId);
      const target = columnView(toColumnId);
      if (!current || !target) return;

      const siblings = target.cards.filter((c) => c.id !== cardId);
      const to = clamp(toIndex, 0, siblings.length);
      const from =
        current.columnId === toColumnId
          ? target.cards.findIndex((c) => c.id === cardId)
          : -1;
      if (to === from) return;

      const order = orderAtIndex(siblings, to);
      commit({
        ...state,
        cards: {
          ...state.cards,
          [cardId]: { ...current, columnId: toColumnId, order },
        },
      });
    },
  };
}
