import { describe, expect, it, vi } from "vitest";
import { loadBoard, type SnapshotStore } from "./room-load";

const STORED = new Uint8Array([1, 2, 3]);
const SEED = new Uint8Array([9, 9]);

function storeWith(snapshot: Uint8Array | null): SnapshotStore & {
  saved: Uint8Array[];
} {
  const saved: Uint8Array[] = [];
  return {
    saved,
    load: vi.fn(async () => snapshot),
    save: vi.fn(async (_boardId: string, update: Uint8Array) => {
      saved.push(update);
    }),
  };
}

describe("loadBoard", () => {
  it("returns the stored snapshot", async () => {
    const store = storeWith(STORED);

    const result = await loadBoard(store, "board-1", () => SEED);

    expect(result).toEqual({ kind: "ready", snapshot: STORED, seeded: false });
    expect(store.saved).toEqual([]);
  });

  it("seeds a board that has a seed and stores it before serving it", async () => {
    const store = storeWith(null);

    const result = await loadBoard(store, "demo", () => SEED);

    expect(result).toEqual({ kind: "ready", snapshot: SEED, seeded: true });
    expect(store.saved).toEqual([SEED]);
  });

  it("reports a board with no snapshot and no seed as not found", async () => {
    const store = storeWith(null);

    const result = await loadBoard(store, "nope", () => null);

    expect(result).toEqual({ kind: "not-found" });
    expect(store.saved).toEqual([]);
  });

  it("asks for a seed with the board's id", async () => {
    const seedFor = vi.fn(() => null);

    await loadBoard(storeWith(null), "board-7", seedFor);

    expect(seedFor).toHaveBeenCalledWith("board-7");
  });

  it("is unavailable when storage cannot be read, and neither seeds nor saves", async () => {
    const failure = new Error("database paused");
    const store: SnapshotStore = {
      load: vi.fn(async () => {
        throw failure;
      }),
      save: vi.fn(async () => {}),
    };
    const seedFor = vi.fn(() => SEED);

    const result = await loadBoard(store, "demo", seedFor);

    expect(result).toEqual({ kind: "unavailable", error: failure });
    expect(seedFor).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("is unavailable when the seed cannot be stored", async () => {
    const failure = new Error("disk full");
    const store: SnapshotStore = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => {
        throw failure;
      }),
    };

    const result = await loadBoard(store, "demo", () => SEED);

    expect(result).toEqual({ kind: "unavailable", error: failure });
  });
});
