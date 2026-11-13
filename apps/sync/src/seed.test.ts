import { readBoardState } from "@syncboard/core/board-doc";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { DEMO_BOARD_ID, seedFor, shouldFailLoad } from "./seed";

const OFF = { allowTestBoards: false };
const ON = { allowTestBoards: true };

describe("seedFor", () => {
  it("gives the demo board its starting content", () => {
    const seed = seedFor(DEMO_BOARD_ID, OFF);
    expect(seed).not.toBeNull();

    const doc = new Y.Doc();
    Y.applyUpdate(doc, seed!);
    const state = readBoardState(doc);

    expect(state.title).toBe("Demo board");
    expect(Object.keys(state.columns).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(state.cards).length).toBeGreaterThanOrEqual(5);
  });

  it("produces the same bytes every time, so separate rooms and devices merge", () => {
    expect(seedFor(DEMO_BOARD_ID, OFF)).toEqual(seedFor(DEMO_BOARD_ID, OFF));
  });

  it("has no seed for a board that was never created", () => {
    expect(seedFor("some-board", OFF)).toBeNull();
    expect(seedFor("some-board", ON)).toBeNull();
    expect(seedFor("", ON)).toBeNull();
    expect(seedFor("demo-2", ON)).toBeNull();
  });

  it("seeds test boards only when they are switched on", () => {
    expect(seedFor("test-abc", OFF)).toBeNull();
    expect(seedFor("test-abc", ON)).toEqual(seedFor(DEMO_BOARD_ID, OFF));
  });
});

describe("shouldFailLoad", () => {
  it("fails boards named test-fail-* when test boards are on", () => {
    expect(shouldFailLoad("test-fail-1", ON)).toBe(true);
  });

  it("never fails anything when test boards are off", () => {
    expect(shouldFailLoad("test-fail-1", OFF)).toBe(false);
  });

  it("leaves other boards alone", () => {
    expect(shouldFailLoad("test-abc", ON)).toBe(false);
    expect(shouldFailLoad(DEMO_BOARD_ID, ON)).toBe(false);
  });
});
