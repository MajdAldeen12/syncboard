import { clamp } from "../board/text";
import { MAX_BOARD_COORDINATE, type CursorPosition } from "./types";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle on screen. Any coordinate space, as long as it is one. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The card or column a pointer is over, and where that is on screen. */
export interface CursorTarget {
  readonly over: "card" | "column";
  readonly id: string;
  readonly box: Box;
}

// Four decimals of a 288-pixel column is a thirtieth of a pixel: more than
// enough, and it keeps the messages short.
const FRACTION_STEPS = 10_000;

function fraction(offset: number, length: number): number {
  if (length <= 0) return 0;
  return (
    Math.round(clamp(offset / length, 0, 1) * FRACTION_STEPS) / FRACTION_STEPS
  );
}

/**
 * Says where a pointer is in terms another screen can place.
 *
 * `target` is the card or column under the pointer, if any. `boardOrigin` is
 * where the top-left corner of the board's content is on this screen, which
 * is off-screen once the board is scrolled.
 */
export function describeCursor(
  point: Point,
  target: CursorTarget | null,
  boardOrigin: Point,
): CursorPosition {
  if (target) {
    return {
      over: target.over,
      id: target.id,
      x: fraction(point.x - target.box.left, target.box.width),
      y: fraction(point.y - target.box.top, target.box.height),
    };
  }
  return {
    over: "board",
    x: clamp(Math.round(point.x - boardOrigin.x), 0, MAX_BOARD_COORDINATE),
    y: clamp(Math.round(point.y - boardOrigin.y), 0, MAX_BOARD_COORDINATE),
  };
}

/**
 * Where a cursor described on another screen belongs on this one. Null if
 * the card or column it is over is not here, for instance because it was
 * deleted a moment ago.
 */
export function locateCursor(
  cursor: CursorPosition,
  boxOf: (over: "card" | "column", id: string) => Box | null,
  boardOrigin: Point,
): Point | null {
  if (cursor.over === "board") {
    return { x: boardOrigin.x + cursor.x, y: boardOrigin.y + cursor.y };
  }

  const box = boxOf(cursor.over, cursor.id);
  if (box === null) return null;
  return {
    x: box.left + cursor.x * box.width,
    y: box.top + cursor.y * box.height,
  };
}
