/**
 * Editing shared text.
 *
 * A text field knows only its old and new value. Shared text needs to know
 * what changed, so that two people editing the same title at once both keep
 * their words. `diffText` turns "old value, new value" into one edit, and
 * `shiftIndex` keeps a caret in place when someone else's edit arrives.
 */

/** One edit: `remove` characters at `index` are replaced by `insert`. */
export interface TextSplice {
  readonly index: number;
  readonly remove: number;
  readonly insert: string;
}

/**
 * A piece of shared text while somebody is editing it. Changes go out as
 * they are typed and other people's changes come in as they arrive.
 */
export interface TextSession {
  /** The text as it is now. */
  getText(): string;
  /** Replaces `remove` characters at `index` with `insert`. */
  splice(index: number, remove: number, insert: string): void;
  /**
   * Calls `listener` when the text is changed by anything other than this
   * session's own `splice`. The edits are in order: each index refers to the
   * text as the edits before it left it. Returns a function that stops it.
   */
  subscribe(listener: (splices: readonly TextSplice[]) => void): () => void;
  /**
   * Ends the session and keeps what was typed, trimmed. If that would leave
   * the text blank, what was typed is taken back instead.
   */
  commit(): void;
  /**
   * Ends the session and takes back what was typed in it. Changes other
   * people made in the meantime stay.
   */
  cancel(): void;
}

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

/**
 * The edit that turns `before` into `after`, or null if they are equal.
 *
 * `caret` is where the caret sits in `after`. Typing, deleting and pasting
 * all leave the caret at the end of what they changed, so when a run of equal
 * characters makes the position ambiguous ("aaa" to "aaaa") the caret settles
 * it. A caret that does not fit the change is ignored.
 *
 * Characters stored as two code units are never cut in half.
 */
export function diffText(
  before: string,
  after: string,
  caret?: number,
): TextSplice | null {
  if (before === after) return null;

  const shorter = Math.min(before.length, after.length);

  // Text after the caret was not touched: use it as the unchanged tail.
  let suffix = 0;
  if (caret !== undefined && caret >= 0 && caret <= after.length) {
    const tail = after.length - caret;
    const fits =
      tail > 0 &&
      tail <= before.length &&
      after.endsWith(before.slice(before.length - tail));
    if (fits) suffix = tail;
  }

  let prefix = 0;
  const maxPrefix = shorter - suffix;
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix++;

  if (suffix === 0) {
    const maxSuffix = shorter - prefix;
    while (
      suffix < maxSuffix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) {
      suffix++;
    }
  }

  // Keep both halves of a two-unit character on the same side of the edit.
  if (prefix > 0 && isHighSurrogate(before.charCodeAt(prefix - 1))) prefix--;
  if (suffix > 0 && isLowSurrogate(before.charCodeAt(before.length - suffix))) {
    suffix--;
  }

  return {
    index: prefix,
    remove: before.length - prefix - suffix,
    insert: after.slice(prefix, after.length - suffix),
  };
}

/** `text` with `splice` applied. */
export function applySplice(text: string, splice: TextSplice): string {
  return (
    text.slice(0, splice.index) +
    splice.insert +
    text.slice(splice.index + splice.remove)
  );
}

/**
 * Where a caret at `index` ends up once `splice` has been applied.
 *
 * A caret inside removed text moves to where that text was. A caret exactly
 * at the edit stays ahead of whatever was inserted there.
 */
export function shiftIndex(index: number, splice: TextSplice): number {
  if (index <= splice.index) return index;
  if (index >= splice.index + splice.remove) {
    return index + splice.insert.length - splice.remove;
  }
  return splice.index;
}
