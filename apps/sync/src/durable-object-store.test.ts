import { describe, expect, it } from "vitest";
import {
  MAX_SNAPSHOT_BYTES,
  SnapshotTooLargeError,
  durableObjectSnapshotStore,
  type KeyValueStorage,
} from "./durable-object-store";

function fakeStorage(): KeyValueStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      data.set(key, value);
    },
  };
}

describe("durableObjectSnapshotStore", () => {
  it("has nothing for a room that was never saved", async () => {
    const store = durableObjectSnapshotStore(fakeStorage());

    expect(await store.load("board")).toBeNull();
  });

  it("returns what was saved", async () => {
    const store = durableObjectSnapshotStore(fakeStorage());
    const snapshot = new Uint8Array([1, 2, 3, 4]);

    await store.save("board", snapshot);

    expect(await store.load("board")).toEqual(snapshot);
  });

  it("returns a Uint8Array even if storage hands back a plain buffer", async () => {
    const storage = fakeStorage();
    const store = durableObjectSnapshotStore(storage);
    await store.save("board", new Uint8Array([7, 8]));
    const [key] = [...storage.data.keys()];
    storage.data.set(key!, new Uint8Array([7, 8]).buffer);

    const loaded = await store.load("board");

    expect(loaded).toBeInstanceOf(Uint8Array);
    expect(loaded).toEqual(new Uint8Array([7, 8]));
  });

  it("refuses a snapshot too large for one storage value and writes nothing", async () => {
    const storage = fakeStorage();
    const store = durableObjectSnapshotStore(storage);

    await expect(
      store.save("board", new Uint8Array(MAX_SNAPSHOT_BYTES + 1)),
    ).rejects.toBeInstanceOf(SnapshotTooLargeError);
    expect(storage.data.size).toBe(0);
  });

  it("accepts a snapshot exactly at the limit", async () => {
    const storage = fakeStorage();
    const store = durableObjectSnapshotStore(storage);

    await store.save("board", new Uint8Array(MAX_SNAPSHOT_BYTES));

    expect(storage.data.size).toBe(1);
  });
});
