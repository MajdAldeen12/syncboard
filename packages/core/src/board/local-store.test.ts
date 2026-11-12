import { describe, expect, it } from "vitest";
import { createLocalBoardStore, createSeedBoard } from "./index";
import { describeBoardStore } from "./store-contract";

describe("createLocalBoardStore", () => {
  describeBoardStore((createId) =>
    createLocalBoardStore(
      { title: "Test board", columns: {}, cards: {} },
      { createId },
    ),
  );
});

describe("createSeedBoard", () => {
  it("builds a board with columns and cards to show on first visit", () => {
    const store = createLocalBoardStore(createSeedBoard());
    const view = store.getSnapshot();

    expect(view.title).toMatch(/\S/);
    expect(view.columns.length).toBeGreaterThanOrEqual(3);
    expect(
      view.columns.reduce((n, c) => n + c.cards.length, 0),
    ).toBeGreaterThanOrEqual(5);
  });
});
