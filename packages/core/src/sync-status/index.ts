/**
 * What to tell the person about the connection to the sync server, worked
 * out from a handful of facts. Shared by the server (the close codes) and
 * the browser (everything else).
 */

/** WebSocket close codes the sync server uses when it refuses a connection. */
export const SYNC_CLOSE_CODES = {
  /** The board exists but its stored document could not be read. */
  storageUnavailable: 4503,
  /** There is no such board. */
  boardNotFound: 4404,
} as const;

export type Refusal = "storage-unavailable" | "board-not-found";

/** Why the server closed the connection, or null for an ordinary disconnect. */
export function refusalFromCloseCode(code: number): Refusal | null {
  if (code === SYNC_CLOSE_CODES.storageUnavailable)
    return "storage-unavailable";
  if (code === SYNC_CLOSE_CODES.boardNotFound) return "board-not-found";
  return null;
}

/**
 * Spots a connection attempt that has been going on for too long.
 *
 * Call the returned function regularly with whether an attempt is in
 * progress and the current time. It returns true once an attempt has lasted
 * `timeoutMs`; the caller should then abandon that attempt. Each attempt is
 * timed from when it was first seen, and reporting a stall ends it, so the
 * retry that follows gets the full time again.
 *
 * WebSockets have no connect timeout of their own. Without this, a handshake
 * that never completes leaves the board waiting for ever.
 */
export function createStallDetector(
  timeoutMs: number,
): (connecting: boolean, now: number) => boolean {
  let since: number | null = null;

  return (connecting, now) => {
    if (!connecting) {
      since = null;
      return false;
    }
    if (since === null) {
      since = now;
      return false;
    }
    if (now - since < timeoutMs) return false;

    since = null;
    return true;
  };
}

export interface SyncSignals {
  /** The document holds a board, from this device's copy or from the server. */
  readonly hasContent: boolean;
  /** A connection to the server is open. */
  readonly connected: boolean;
  /** Since connecting, the server and this device have exchanged everything. */
  readonly synced: boolean;
  /** Changes were made here that the server has not received yet. */
  readonly unsentChanges: boolean;
  /** A connection has failed or closed since the last successful sync. */
  readonly connectionFailed: boolean;
  /** Why the server refused the connection, if it has since the last sync. */
  readonly refusal: Refusal | null;
}

export type SyncStatus =
  /** Nothing to show yet, and still trying to get it. */
  | { readonly kind: "loading" }
  /** Showing the board; everything is exchanged with the server. */
  | { readonly kind: "synced" }
  /** Showing the board; connected and catching up. */
  | { readonly kind: "syncing" }
  /** Showing this device's copy; no connection. */
  | { readonly kind: "offline"; readonly unsent: boolean }
  /** Nothing to show, and no way to get it right now. */
  | { readonly kind: "unavailable"; readonly reason: "offline" | Refusal };

export function syncStatus(signals: SyncSignals): SyncStatus {
  // A board that does not exist is not shown, even from a leftover copy.
  if (signals.refusal === "board-not-found") {
    return { kind: "unavailable", reason: "board-not-found" };
  }

  if (!signals.hasContent) {
    // An open connection is not checked here on purpose. A server that
    // accepts a connection and then refuses it would otherwise flip the
    // screen between "loading" and "unavailable" on every retry. The failure
    // stands until content arrives; the caller clears it on a real sync.
    if (signals.refusal)
      return { kind: "unavailable", reason: signals.refusal };
    if (signals.connectionFailed)
      return { kind: "unavailable", reason: "offline" };
    return { kind: "loading" };
  }

  if (!signals.connected) {
    return { kind: "offline", unsent: signals.unsentChanges };
  }
  return signals.synced ? { kind: "synced" } : { kind: "syncing" };
}
