import type { SnapshotStore } from "./room-load";

/** The part of Durable Object storage this store uses. */
export interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

const SNAPSHOT_KEY = "snapshot";

/**
 * Largest snapshot stored. A value in SQLite-backed Durable Object storage
 * may be 2 MiB; this leaves room for the key and encoding overhead.
 */
export const MAX_SNAPSHOT_BYTES = 1_500_000;

export class SnapshotTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(
      `Snapshot is ${bytes} bytes; the limit is ${MAX_SNAPSHOT_BYTES} bytes.`,
    );
    this.name = "SnapshotTooLargeError";
  }
}

/**
 * Keeps a room's document in that room's own Durable Object storage. Each
 * room has its own storage, so the board id is not part of the key.
 */
export function durableObjectSnapshotStore(
  storage: KeyValueStorage,
): SnapshotStore {
  return {
    async load() {
      const stored = await storage.get<Uint8Array | ArrayBuffer>(SNAPSHOT_KEY);
      return stored ? new Uint8Array(stored) : null;
    },

    async save(_boardId, snapshot) {
      if (snapshot.byteLength > MAX_SNAPSHOT_BYTES) {
        throw new SnapshotTooLargeError(snapshot.byteLength);
      }
      await storage.put(SNAPSHOT_KEY, snapshot);
    },
  };
}
