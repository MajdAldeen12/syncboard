/** Where a board's document is kept between visits. */
export interface SnapshotStore {
  /** The stored document, or null if there is none. Throws if it cannot tell. */
  load(boardId: string): Promise<Uint8Array | null>;
  save(boardId: string, snapshot: Uint8Array): Promise<void>;
}

export type LoadResult =
  /** The document to serve. `seeded` is true if it was created just now. */
  | { kind: "ready"; snapshot: Uint8Array; seeded: boolean }
  /** No such board. */
  | { kind: "not-found" }
  /** Storage could not be read or written. The board must not be served. */
  | { kind: "unavailable"; error: unknown };

/**
 * Decides what a room starts with.
 *
 * The rule that matters: if storage cannot be read, the answer is
 * "unavailable", never an empty or freshly seeded document. An empty document
 * served in place of a real one would be edited, saved, and overwrite the
 * board. A seed is stored before it is served for the same reason: a board
 * that cannot be saved must not be handed out.
 *
 * `seedFor` returns starting content for boards that are created on first
 * visit, and null for every other board.
 */
export async function loadBoard(
  store: SnapshotStore,
  boardId: string,
  seedFor: (boardId: string) => Uint8Array | null,
): Promise<LoadResult> {
  let stored: Uint8Array | null;
  try {
    stored = await store.load(boardId);
  } catch (error) {
    return { kind: "unavailable", error };
  }
  if (stored) return { kind: "ready", snapshot: stored, seeded: false };

  const seed = seedFor(boardId);
  if (!seed) return { kind: "not-found" };

  try {
    await store.save(boardId, seed);
  } catch (error) {
    return { kind: "unavailable", error };
  }
  return { kind: "ready", snapshot: seed, seeded: true };
}
