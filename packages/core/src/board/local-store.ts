import { nanoid } from "nanoid";
import { orderAtIndex } from "../ordering/index";
import {
  applySplice,
  diffText,
  type TextSession,
  type TextSplice,
} from "../text-binding/index";
import { cardPlacement, columnPlacement } from "./placement";
import { selectBoard } from "./select";
import { cleanTitle, fitSplice, truncate } from "./text";
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

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // Ids arrive from the UI. `Object.hasOwn` keeps a stray "constructor" or
  // "__proto__" from matching something on the prototype.
  const column = (id: string) =>
    Object.hasOwn(state.columns, id) ? state.columns[id] : undefined;
  const card = (id: string) =>
    Object.hasOwn(state.cards, id) ? state.cards[id] : undefined;

  function setColumnTitle(columnId: string, title: string): void {
    const current = column(columnId);
    if (!current || title === current.title) return;
    commit({
      ...state,
      columns: { ...state.columns, [columnId]: { ...current, title } },
    });
  }

  function setCardTitle(cardId: string, title: string): void {
    const current = card(cardId);
    if (!current || title === current.title) return;
    commit({
      ...state,
      cards: { ...state.cards, [cardId]: { ...current, title } },
    });
  }

  /**
   * A session over one title. Nobody else can be typing here, so taking an
   * edit back simply restores the title the session opened on.
   */
  function editTitle(
    read: () => string | undefined,
    write: (title: string) => void,
  ): TextSession | null {
    const opened = read();
    if (opened === undefined) return null;

    const watchers = new Set<(splices: readonly TextSplice[]) => void>();
    // The text as this session last saw it. A difference means that
    // something other than the session changed the title.
    let seen = opened;
    let ended = false;

    const stopWatching = subscribe(() => {
      const current = read();
      if (current === undefined || current === seen) return;
      const change = diffText(seen, current);
      seen = current;
      if (change) for (const watcher of [...watchers]) watcher([change]);
    });

    function end(): void {
      ended = true;
      watchers.clear();
      stopWatching();
    }

    return {
      getText: () => read() ?? seen,

      splice(index, remove, insert) {
        const current = read();
        if (ended || current === undefined) return;
        const edit = fitSplice(
          current,
          index,
          remove,
          insert,
          MAX_TITLE_LENGTH,
        );
        if (!edit) return;
        seen = applySplice(current, edit);
        write(seen);
      },

      subscribe(listener) {
        if (ended) return () => {};
        watchers.add(listener);
        return () => {
          watchers.delete(listener);
        };
      },

      commit() {
        if (ended) return;
        end();
        const current = read();
        if (current !== undefined) write(cleanTitle(current) ?? opened);
      },

      cancel() {
        if (ended) return;
        end();
        write(opened);
      },
    };
  }

  return {
    getSnapshot: () => view,
    subscribe,

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
      const title = cleanTitle(rawTitle);
      if (title !== null) setColumnTitle(columnId, title);
    },

    editColumnTitle(columnId) {
      return editTitle(
        () => column(columnId)?.title,
        (title) => setColumnTitle(columnId, title),
      );
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
      const order = columnPlacement(view, columnId, toIndex);
      if (!current || order === null) return;

      commit({
        ...state,
        columns: { ...state.columns, [columnId]: { ...current, order } },
      });
    },

    addCard(columnId, rawTitle) {
      const target = view.columns.find((c) => c.id === columnId);
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

    editCardTitle(cardId) {
      return editTitle(
        () => card(cardId)?.title,
        (title) => setCardTitle(cardId, title),
      );
    },

    deleteCard(cardId) {
      if (!card(cardId)) return;

      commit({ ...state, cards: omit(state.cards, (id) => id === cardId) });
    },

    moveCard(cardId, toColumnId, toIndex) {
      const current = card(cardId);
      if (!current) return;
      const order = cardPlacement(
        view,
        cardId,
        current.columnId,
        toColumnId,
        toIndex,
      );
      if (order === null) return;

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
