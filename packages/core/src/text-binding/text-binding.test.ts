import { describe, expect, it } from "vitest";
import { applySplice, diffText, rebaseSplice, shiftIndex } from "./index";

/** Deterministic pseudo-random numbers so a failing run can be repeated. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("diffText", () => {
  it("returns null when nothing changed", () => {
    expect(diffText("abc", "abc")).toBeNull();
  });

  it("finds text added at the end", () => {
    expect(diffText("abc", "abcd")).toEqual({
      index: 3,
      remove: 0,
      insert: "d",
    });
  });

  it("finds text added at the start", () => {
    expect(diffText("abc", "xabc")).toEqual({
      index: 0,
      remove: 0,
      insert: "x",
    });
  });

  it("finds text removed from the middle", () => {
    expect(diffText("abcd", "ad")).toEqual({ index: 1, remove: 2, insert: "" });
  });

  it("finds a replaced word and leaves the rest alone", () => {
    expect(diffText("hello world!", "hello there!")).toEqual({
      index: 6,
      remove: 5,
      insert: "there",
    });
  });

  it("handles an empty text on either side", () => {
    expect(diffText("", "abc")).toEqual({ index: 0, remove: 0, insert: "abc" });
    expect(diffText("abc", "")).toEqual({ index: 0, remove: 3, insert: "" });
  });

  describe("with the caret position after the edit", () => {
    it("places a typed character where the caret is, not after its twins", () => {
      // "a|aa" + "a" typed at the bar. Without the caret the edit could be
      // anywhere in the run of equal characters.
      expect(diffText("aaa", "aaaa", 2)).toEqual({
        index: 1,
        remove: 0,
        insert: "a",
      });
    });

    it("places a backspace where the caret is", () => {
      expect(diffText("aaa", "aa", 1)).toEqual({
        index: 1,
        remove: 1,
        insert: "",
      });
    });

    it("ignores a caret that does not fit the change", () => {
      expect(diffText("abc", "abcd", 0)).toEqual({
        index: 3,
        remove: 0,
        insert: "d",
      });
    });
  });

  describe("characters made of two code units", () => {
    it("replaces a whole emoji when only its second half differs", () => {
      // U+1F600 and U+1F601 share their first code unit.
      expect(diffText("a\u{1F600}b", "a\u{1F601}b")).toEqual({
        index: 1,
        remove: 2,
        insert: "\u{1F601}",
      });
    });

    it("replaces a whole emoji when only its first half differs", () => {
      // U+1F200 and U+1F600 share their second code unit.
      expect(diffText("a\u{1F200}b", "a\u{1F600}b")).toEqual({
        index: 1,
        remove: 2,
        insert: "\u{1F600}",
      });
    });
  });

  it("always describes an edit that turns the old text into the new one", () => {
    const random = seededRandom(11);
    const alphabet = ["a", "b", " ", "\u{1F600}", "\u{1F601}", "\u{1F200}"];
    const text = () =>
      Array.from(
        { length: Math.floor(random() * 8) },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join("");

    for (let n = 0; n < 2000; n++) {
      const before = text();
      const after = text();
      const caret =
        random() < 0.5 ? undefined : Math.floor(random() * (after.length + 1));
      const splice = diffText(before, after, caret);

      expect(splice ? applySplice(before, splice) : before).toBe(after);
    }
  });
});

describe("applySplice", () => {
  it("replaces the removed range with the inserted text", () => {
    expect(
      applySplice("hello world", { index: 6, remove: 5, insert: "you" }),
    ).toBe("hello you");
  });
});

describe("shiftIndex", () => {
  const insert = { index: 4, remove: 0, insert: "xyz" };
  const remove = { index: 4, remove: 3, insert: "" };

  it("leaves a caret before the edit where it is", () => {
    expect(shiftIndex(2, insert)).toBe(2);
    expect(shiftIndex(2, remove)).toBe(2);
  });

  it("leaves a caret at the edit where it is, ahead of inserted text", () => {
    expect(shiftIndex(4, insert)).toBe(4);
  });

  it("moves a caret after an insertion to the right", () => {
    expect(shiftIndex(6, insert)).toBe(9);
  });

  it("moves a caret after a removal to the left", () => {
    expect(shiftIndex(9, remove)).toBe(6);
    expect(shiftIndex(7, remove)).toBe(4);
  });

  it("pulls a caret inside removed text back to where the text was", () => {
    expect(shiftIndex(5, remove)).toBe(4);
    expect(shiftIndex(5, { index: 4, remove: 3, insert: "new" })).toBe(4);
  });
});

describe("rebaseSplice", () => {
  // An edit made on a copy of the text that has not yet seen other people's
  // edits, carried over so that it applies after them. Used while an input
  // method is composing: other people's edits wait, and the composed text
  // is put in afterwards.
  const local = { index: 3, remove: 0, insert: "XY" };

  it("leaves the edit alone when nothing else happened", () => {
    expect(rebaseSplice(local, [])).toEqual(local);
  });

  it("moves the edit along when text was added before it", () => {
    expect(
      rebaseSplice(local, [{ index: 0, remove: 0, insert: "ab" }]),
    ).toEqual({ index: 5, remove: 0, insert: "XY" });
  });

  it("leaves the edit in place when text after it changed", () => {
    expect(rebaseSplice(local, [{ index: 4, remove: 1, insert: "" }])).toEqual(
      local,
    );
  });

  it("puts the edit ahead of text added at the same place", () => {
    const remote = { index: 3, remove: 0, insert: "rr" };
    expect(rebaseSplice(local, [remote])).toEqual(local);
  });

  it("removes less when someone else already removed part of it", () => {
    // "abcdef": this person replaces "cde", someone else deletes "de".
    const replace = { index: 2, remove: 3, insert: "Z" };
    expect(
      rebaseSplice(replace, [{ index: 3, remove: 2, insert: "" }]),
    ).toEqual({ index: 2, remove: 1, insert: "Z" });
  });

  it("goes where the text went after several edits in a row", () => {
    const remote = [
      { index: 0, remove: 1, insert: "" },
      { index: 0, remove: 0, insert: "hello " },
    ];
    expect(rebaseSplice(local, remote)).toEqual({
      index: 8,
      remove: 0,
      insert: "XY",
    });
  });

  it("gives the same text as applying both sides in either order, for edits apart", () => {
    const random = seededRandom(7);
    for (let run = 0; run < 200; run += 1) {
      const text = "the quick brown fox";
      const at = () => Math.floor(random() * (text.length + 1));
      // Mine near the start, theirs near the end, so the two never touch.
      const mineAt = Math.min(at(), 8);
      const mine = { index: mineAt, remove: 0, insert: "<m>" };
      const theirsAt = Math.max(at(), 10);
      const theirs = {
        index: theirsAt,
        remove: Math.min(2, text.length - theirsAt),
        insert: "<t>",
      };

      const together = applySplice(
        applySplice(text, theirs),
        rebaseSplice(mine, [theirs]),
      );
      const mineFirst = applySplice(applySplice(text, mine), {
        ...theirs,
        index: theirs.index + mine.insert.length,
      });
      expect(together).toBe(mineFirst);
    }
  });
});
