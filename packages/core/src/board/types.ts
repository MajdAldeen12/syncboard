import type { OrderKey } from "../ordering/index";
import type { TextSession } from "../text-binding/index";

/** Longest title a column or card may have. Longer input is cut. */
export const MAX_TITLE_LENGTH = 200;
/** Longest description a card may have. Longer input is cut. */
export const MAX_DESCRIPTION_LENGTH = 5000;

// --- Stored shape ----------------------------------------------------------
// Flat maps keyed by id. A card names its column and its position; a move
// rewrites those two fields and touches nothing else.

export interface ColumnRecord {
  readonly title: string;
  readonly order: OrderKey;
}

export interface CardRecord {
  readonly columnId: string;
  readonly order: OrderKey;
  readonly title: string;
  readonly description: string;
}

export interface BoardState {
  readonly title: string;
  readonly columns: Readonly<Record<string, ColumnRecord>>;
  readonly cards: Readonly<Record<string, CardRecord>>;
}

// --- View shape ------------------------------------------------------------
// What the UI renders: columns in order, each holding its cards in order.

export interface CardView extends CardRecord {
  readonly id: string;
}

export interface ColumnView extends ColumnRecord {
  readonly id: string;
  readonly cards: readonly CardView[];
}

export interface BoardView {
  readonly title: string;
  readonly columns: readonly ColumnView[];
}

// --- Store -----------------------------------------------------------------

export interface CardPatch {
  readonly title?: string;
  readonly description?: string;
}

/**
 * Everything the UI may do to a board. The UI depends on this interface
 * only, so the in-memory store can be swapped for a shared one without
 * touching components.
 *
 * Calls that would change nothing (unknown ids, blank titles, a move to the
 * current position) are ignored and do not notify subscribers.
 *
 * Titles can be changed in two ways. `renameColumn` and `updateCard` set a
 * finished value in one go. `editColumnTitle` and `editCardTitle` open a
 * session for a text field: every keystroke is written as it happens and
 * other people's keystrokes arrive the same way, so two people typing in the
 * same title both keep their words.
 */
export interface BoardStore {
  /** The current board. The same object is returned until a change is made. */
  getSnapshot(): BoardView;
  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;

  /** Adds a column at the end. Returns its id, or null if the title is blank. */
  addColumn(title: string): string | null;
  renameColumn(columnId: string, title: string): void;
  /** Starts editing a column's title. Null if the column does not exist. */
  editColumnTitle(columnId: string): TextSession | null;
  /** Deletes a column and every card in it. */
  deleteColumn(columnId: string): void;
  /** Moves a column so that it ends up at `toIndex`. */
  moveColumn(columnId: string, toIndex: number): void;

  /** Adds a card at the end of a column. Returns its id, or null if refused. */
  addCard(columnId: string, title: string): string | null;
  updateCard(cardId: string, patch: CardPatch): void;
  /** Starts editing a card's title. Null if the card does not exist. */
  editCardTitle(cardId: string): TextSession | null;
  deleteCard(cardId: string): void;
  /** Moves a card so that it ends up at `toIndex` in `toColumnId`. */
  moveCard(cardId: string, toColumnId: string, toIndex: number): void;
}
