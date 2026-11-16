/**
 * Presence: what each person on a board tells the others about themselves
 * while they are there. Who they are, where their pointer is, and what they
 * have open or in hand. None of it is saved and none of it is trusted: a
 * client can say anything about itself, so nothing here may decide what a
 * person is allowed to do.
 */

/** Longest name shown for a person. Longer names are cut. */
export const MAX_NAME_LENGTH = 40;
/** Longest id accepted for a person, a card or a column. */
export const MAX_ID_LENGTH = 64;
/** Farthest a cursor may be from the board's corner, in pixels. */
export const MAX_BOARD_COORDINATE = 100_000;

/**
 * A person as the others see them. For now a guest made up in the browser;
 * a signed-in user fits the same shape.
 */
export interface PresenceUser {
  readonly id: string;
  readonly name: string;
  /** Six-digit hex, lower case, dark enough to carry white text. */
  readonly color: string;
}

/** A card or a column. */
export interface ItemRef {
  readonly kind: "card" | "column";
  readonly id: string;
}

/**
 * Where a pointer is, said in a way another screen can place.
 *
 * Screens differ: the board scrolls sideways, each column scrolls on its
 * own, windows have different sizes and text wraps differently. So a cursor
 * names what it is over and where on it. Over a card or a column, `x` and
 * `y` are fractions of that element's box (0 to 1). Over neither, they are
 * pixels from the top-left corner of the board's content, which stays put
 * however the board is scrolled.
 */
export type CursorPosition =
  | {
      readonly over: "card" | "column";
      readonly id: string;
      readonly x: number;
      readonly y: number;
    }
  | { readonly over: "board"; readonly x: number; readonly y: number };

/** One client's presence: a tab, not a person. A person may have several. */
export interface Presence {
  readonly user: PresenceUser;
  /** Null while the pointer is not over the board. */
  readonly cursor: CursorPosition | null;
  /** The card or column whose title they are typing in. */
  readonly editing: ItemRef | null;
  /** The card or column they are holding. */
  readonly dragging: ItemRef | null;
}
