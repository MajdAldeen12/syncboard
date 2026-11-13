import { describe, expect, it } from "vitest";
import {
  SYNC_CLOSE_CODES,
  refusalFromCloseCode,
  syncStatus,
  type SyncSignals,
} from "./index";

const base: SyncSignals = {
  hasContent: false,
  connected: false,
  synced: false,
  unsentChanges: false,
  connectionFailed: false,
  refusal: null,
};

const signals = (overrides: Partial<SyncSignals>): SyncSignals => ({
  ...base,
  ...overrides,
});

describe("refusalFromCloseCode", () => {
  it("recognises the codes the sync server refuses a connection with", () => {
    expect(refusalFromCloseCode(SYNC_CLOSE_CODES.storageUnavailable)).toBe(
      "storage-unavailable",
    );
    expect(refusalFromCloseCode(SYNC_CLOSE_CODES.boardNotFound)).toBe(
      "board-not-found",
    );
  });

  it("treats every other close as an ordinary disconnect", () => {
    for (const code of [1000, 1001, 1006, 4000, 4999]) {
      expect(refusalFromCloseCode(code)).toBeNull();
    }
  });
});

describe("syncStatus with nothing to show yet", () => {
  it("is loading before the first connection attempt has finished", () => {
    expect(syncStatus(base)).toEqual({ kind: "loading" });
  });

  it("is loading while connected and waiting for the first sync", () => {
    expect(syncStatus(signals({ connected: true }))).toEqual({
      kind: "loading",
    });
  });

  it("is unavailable when the server cannot be reached", () => {
    expect(syncStatus(signals({ connectionFailed: true }))).toEqual({
      kind: "unavailable",
      reason: "offline",
    });
  });

  it("is unavailable when the server's storage is down", () => {
    expect(
      syncStatus(
        signals({ connectionFailed: true, refusal: "storage-unavailable" }),
      ),
    ).toEqual({ kind: "unavailable", reason: "storage-unavailable" });
  });

  // A server that accepts a connection and then refuses it would otherwise
  // make the screen flip between "loading" and "unavailable" on every retry.
  it("stays unavailable while a retry is open but has delivered nothing yet", () => {
    expect(
      syncStatus(signals({ connectionFailed: true, connected: true })),
    ).toEqual({ kind: "unavailable", reason: "offline" });
    expect(
      syncStatus(
        signals({
          connectionFailed: true,
          connected: true,
          refusal: "storage-unavailable",
        }),
      ),
    ).toEqual({ kind: "unavailable", reason: "storage-unavailable" });
  });
});

describe("syncStatus with a board on screen", () => {
  const shown = (overrides: Partial<SyncSignals>) =>
    syncStatus(signals({ hasContent: true, ...overrides }));

  it("is synced when connected and caught up", () => {
    expect(shown({ connected: true, synced: true })).toEqual({
      kind: "synced",
    });
  });

  it("is syncing while connected and still catching up", () => {
    expect(shown({ connected: true })).toEqual({ kind: "syncing" });
  });

  it("is offline when the connection is gone", () => {
    expect(shown({ connectionFailed: true })).toEqual({
      kind: "offline",
      unsent: false,
    });
  });

  it("says so when changes made offline are waiting to be sent", () => {
    expect(shown({ connectionFailed: true, unsentChanges: true })).toEqual({
      kind: "offline",
      unsent: true,
    });
  });

  it("keeps showing the local copy when the server's storage is down", () => {
    expect(
      shown({ connectionFailed: true, refusal: "storage-unavailable" }),
    ).toEqual({ kind: "offline", unsent: false });
  });

  it("is offline, not loading, before the first attempt has finished", () => {
    expect(shown({})).toEqual({ kind: "offline", unsent: false });
  });
});

describe("syncStatus for a board that does not exist", () => {
  it("is unavailable whether or not a local copy exists", () => {
    for (const hasContent of [false, true]) {
      expect(
        syncStatus(signals({ hasContent, refusal: "board-not-found" })),
      ).toEqual({ kind: "unavailable", reason: "board-not-found" });
    }
  });
});
