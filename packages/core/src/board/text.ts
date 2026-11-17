import type { TextSplice } from "../text-binding/index";
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from "./types";

/** Cuts text to `max` UTF-16 units without splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 0) return "";
  const last = text.charCodeAt(max - 1);
  const splitsPair = last >= 0xd800 && last <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max);
}

/** A trimmed, length-capped title, or null if nothing is left. */
export function cleanTitle(raw: string): string | null {
  const title = truncate(raw.trim(), MAX_TITLE_LENGTH);
  return title.length > 0 ? title : null;
}

/** What a text editing session may hold, and what it is kept as. */
export interface TextRules {
  /** The longest the text may become while it is typed. */
  readonly maxLength: number;
  /** The text to keep when the session ends, or null to take the edit back. */
  readonly settle: (text: string) => string | null;
}

/** Titles are trimmed when kept, and may not end up blank. */
export const TITLE_RULES: TextRules = {
  maxLength: MAX_TITLE_LENGTH,
  settle: cleanTitle,
};

/** Descriptions are kept exactly as typed, empty included. */
export const DESCRIPTION_RULES: TextRules = {
  maxLength: MAX_DESCRIPTION_LENGTH,
  settle: (text) => text,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * An edit as it can safely be applied to `text`: kept inside the text, with
 * the inserted part cut so that the result is at most `max` long. Null if
 * nothing would change.
 */
export function fitSplice(
  text: string,
  index: number,
  remove: number,
  insert: string,
  max: number,
): TextSplice | null {
  const at = clamp(index, 0, text.length);
  const cut = clamp(remove, 0, text.length - at);
  const fitted = truncate(insert, max - (text.length - cut));
  if (cut === 0 && fitted.length === 0) return null;
  return { index: at, remove: cut, insert: fitted };
}
