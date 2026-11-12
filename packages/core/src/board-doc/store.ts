import { nanoid } from "nanoid";
import * as Y from "yjs";
import { cardPlacement, columnPlacement } from "../board/placement";
import { selectBoard } from "../board/select";
import { cleanTitle, fitSplice, truncate } from "../board/text";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type BoardStore,
} from "../board/types";
import { orderAtIndex } from "../ordering/index";
import type { TextSession, TextSplice } from "../text-binding/index";
import * as write from "./mutations";
import { normalizeBoard } from "./normalize";
import { readBoardState } from "./state";

export interface YjsBoardStoreOptions {
  /** Generates ids for new columns and cards. Defaults to random ids. */
  readonly createId?: () => string;
  /** Recorded as the creator of new cards. */
  readonly userId?: string;
  /** The current time in milliseconds since 1970. Defaults to the clock. */
  readonly now?: () => number;
}

/** The edits in a Yjs text event, in the order they apply. */
function splicesOf(delta: Y.YTextEvent["delta"]): TextSplice[] {
  const splices: TextSplice[] = [];
  let index = 0;
  for (const step of delta) {
    if (step.retain !== undefined) {
      index += step.retain;
    } else if (step.delete !== undefined) {
      splices.push({ index, remove: step.delete, insert: "" });
    } else if (typeof step.insert === "string") {
      splices.push({ index, remove: 0, insert: step.insert });
      index += step.insert.length;
    }
  }
  return splices;
}

/**
 * A board held in a Yjs document. Whoever else has the document, in another
 * tab now and on a server later, sees every change, and theirs show up here.
 *
 * The store reads the document; it does not own it. Connecting the document
 * to other clients is the job of a provider.
 */
export function createYjsBoardStore(
  doc: Y.Doc,
  options: YjsBoardStoreOptions = {},
): BoardStore {
  const createId = options.createId ?? (() => nanoid(12));
  const userId = options.userId ?? "anonymous";
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();

  // `state` is the document as stored. `view` is what is shown: ordered, and
  // with cards whose column is gone placed in the first column.
  let state = readBoardState(doc);
  let view = selectBoard(normalizeBoard(state));

  // Fires once per transaction, local or remote, that changed the document.
  doc.on("update", () => {
    const next = readBoardState(doc, state);
    if (next === state) return;
    state = next;
    view = selectBoard(normalizeBoard(state));
    for (const listener of [...listeners]) listener();
  });

  /**
   * A session over one shared text. What is typed is written under an origin
   * of its own, which lets an undo manager take back exactly this session's
   * edits and nobody else's.
   */
  function editText(find: () => Y.Text | null): TextSession | null {
    const found = find();
    if (!found) return null;
    const text: Y.Text = found;

    const origin = {};
    const undo = new Y.UndoManager(text, { trackedOrigins: new Set([origin]) });
    const watchers = new Set<(splices: readonly TextSplice[]) => void>();
    let ended = false;

    const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === origin) return;
      const splices = splicesOf(event.delta);
      if (splices.length === 0) return;
      for (const watcher of [...watchers]) watcher(splices);
    };
    text.observe(observer);

    // False once the card or column the text belongs to has been deleted.
    const exists = () => find() === text;

    function end(): void {
      ended = true;
      watchers.clear();
      text.unobserve(observer);
    }

    function takeBack(): void {
      while (undo.canUndo()) undo.undo();
    }

    function release(): void {
      undo.clear();
      undo.destroy();
    }

    return {
      getText: () => text.toString(),

      splice(index, remove, insert) {
        if (ended || !exists()) return;
        const edit = fitSplice(
          text.toString(),
          index,
          remove,
          insert,
          MAX_TITLE_LENGTH,
        );
        if (!edit) return;

        doc.transact(() => {
          if (edit.remove > 0) text.delete(edit.index, edit.remove);
          if (edit.insert) text.insert(edit.index, edit.insert);
        }, origin);
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
        if (exists()) {
          const title = cleanTitle(text.toString());
          if (title === null) takeBack();
          else write.writeText(text, title);
        }
        release();
      },

      cancel() {
        if (ended) return;
        end();
        if (exists()) takeBack();
        release();
      },
    };
  }

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
      write.insertColumn(doc, { id, title, order });
      return id;
    },

    renameColumn(columnId, rawTitle) {
      const text = write.columnText(doc, columnId);
      const title = cleanTitle(rawTitle);
      if (text && title !== null) write.writeText(text, title);
    },

    editColumnTitle(columnId) {
      return editText(() => write.columnText(doc, columnId));
    },

    deleteColumn(columnId) {
      // The cards shown in the column go with it. For the first column that
      // includes cards whose own column was deleted by someone else.
      const shown = view.columns.find((column) => column.id === columnId);
      if (!shown) return;
      write.deleteColumn(
        doc,
        columnId,
        shown.cards.map((card) => card.id),
      );
    },

    moveColumn(columnId, toIndex) {
      const order = columnPlacement(view, columnId, toIndex);
      if (order !== null) write.moveColumn(doc, columnId, order);
    },

    addCard(columnId, rawTitle) {
      const target = view.columns.find((column) => column.id === columnId);
      const title = cleanTitle(rawTitle);
      if (!target || title === null) return null;

      const id = createId();
      const order = orderAtIndex(target.cards, target.cards.length);
      write.insertCard(doc, {
        id,
        columnId,
        order,
        title,
        createdBy: userId,
        createdAt: now(),
      });
      return id;
    },

    updateCard(cardId, patch) {
      const title = write.cardText(doc, cardId, "title");
      const description = write.cardText(doc, cardId, "description");
      if (!title || !description) return;

      doc.transact(() => {
        const cleaned =
          patch.title === undefined ? null : cleanTitle(patch.title);
        if (cleaned !== null) write.writeText(title, cleaned);
        if (patch.description !== undefined) {
          write.writeText(
            description,
            truncate(patch.description, MAX_DESCRIPTION_LENGTH),
          );
        }
      });
    },

    editCardTitle(cardId) {
      return editText(() => write.cardText(doc, cardId, "title"));
    },

    deleteCard(cardId) {
      write.deleteCard(doc, cardId);
    },

    moveCard(cardId, toColumnId, toIndex) {
      const stored = Object.hasOwn(state.cards, cardId)
        ? state.cards[cardId]
        : undefined;
      if (!stored) return;

      // Compared against the column the card is stored in, not the one it is
      // shown in: moving a card whose column is gone always writes, which
      // gives it a real column again.
      const order = cardPlacement(
        view,
        cardId,
        stored.columnId,
        toColumnId,
        toIndex,
      );
      if (order !== null) write.moveCard(doc, cardId, toColumnId, order);
    },
  };
}
