import { clamp, truncate } from "../board/text";
import {
  MAX_BOARD_COORDINATE,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  type CursorPosition,
  type ItemRef,
  type Presence,
  type PresenceUser,
} from "./types";

// Presence arrives from other people's browsers and from this browser's own
// storage. Either can hold anything, so everything is checked here and what
// comes out is a fresh object with nothing extra on it.

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.length > 0 && value.length <= MAX_ID_LENGTH ? value : null;
}

/** A person, or null if `value` does not describe one. */
export function parseUser(value: unknown): PresenceUser | null {
  if (!isRecord(value)) return null;

  const id = parseId(value.id);
  if (id === null || typeof value.name !== "string") return null;

  const name = truncate(value.name.trim(), MAX_NAME_LENGTH).trimEnd();
  if (name === "") return null;

  // The colour ends up in a style attribute. Only a plain hex value may.
  if (typeof value.color !== "string" || !HEX_COLOR.test(value.color)) {
    return null;
  }

  return { id, name, color: value.color.toLowerCase() };
}

function parseCursor(value: unknown): CursorPosition | null {
  if (!isRecord(value)) return null;

  const { x, y } = value;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (value.over === "board") {
    return {
      over: "board",
      x: clamp(x, 0, MAX_BOARD_COORDINATE),
      y: clamp(y, 0, MAX_BOARD_COORDINATE),
    };
  }
  if (value.over === "card" || value.over === "column") {
    const id = parseId(value.id);
    if (id === null) return null;
    return { over: value.over, id, x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }
  return null;
}

function parseItem(value: unknown): ItemRef | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "card" && value.kind !== "column") return null;

  const id = parseId(value.id);
  return id === null ? null : { kind: value.kind, id };
}

/**
 * One client's presence, or null if `value` does not say who it is.
 *
 * Only the user is required. A cursor or an item that makes no sense is
 * dropped on its own: the person is still there.
 */
export function parsePresence(value: unknown): Presence | null {
  if (!isRecord(value)) return null;

  const user = parseUser(value.user);
  if (user === null) return null;

  return {
    user,
    cursor: parseCursor(value.cursor),
    editing: parseItem(value.editing),
    dragging: parseItem(value.dragging),
  };
}
