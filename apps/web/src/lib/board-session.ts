import type { BoardStore } from "@syncboard/core/board";
import { boardRoots, createYjsBoardStore } from "@syncboard/core/board-doc";
import {
  createStallDetector,
  refusalFromCloseCode,
  syncStatus,
  type SyncSignals,
  type SyncStatus,
} from "@syncboard/core/sync-status";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

/**
 * Identifies which document a board currently is. A reset board gets a new
 * generation, and copies kept under the old one are left behind instead of
 * being merged back in. Fixed until boards can be reset (M5).
 */
const DOC_GENERATION = 1;

/** How long a connection attempt may take before it is abandoned and retried. */
const HANDSHAKE_TIMEOUT_MS = 8_000;

const NOT_CONNECTED: SyncSignals = {
  hasContent: false,
  connected: false,
  synced: false,
  unsentChanges: false,
  connectionFailed: false,
  refusal: null,
};

/** One board in this tab: its document, its store, and how it is doing. */
export interface BoardSession {
  readonly boardId: string;
  readonly store: BoardStore;
  getStatus(): SyncStatus;
  subscribeStatus(listener: () => void): () => void;
  /**
   * Opens this device's saved copy and the connection to the sync server.
   * Returns a function that closes both. The document itself is kept, so
   * connecting again carries on from where it was.
   */
  connect(host: string): () => void;
}

/**
 * Creates the board's document and store. Nothing is read or sent until
 * `connect` is called, so this is safe to call while rendering.
 *
 * The document starts empty. Its content comes from this device's saved copy
 * or from the server, never from a seed written in the browser: two devices
 * that each wrote their own starting content could not be merged.
 */
export function createBoardSession(boardId: string): BoardSession {
  const doc = new Y.Doc();
  const store = createYjsBoardStore(doc);
  const listeners = new Set<() => void>();

  let signals = NOT_CONNECTED;
  let status = syncStatus(signals);

  function update(change: Partial<SyncSignals>): void {
    signals = { ...signals, ...change };
    const next = syncStatus(signals);
    // Statuses are small plain objects; compare them by value.
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    boardId,
    store,
    getStatus: () => status,

    subscribeStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    connect(host) {
      // This device's copy. It is what makes the board open instantly on a
      // return visit and keeps edits made while offline.
      const saved = new IndexeddbPersistence(
        `syncboard:board:${boardId}:${DOC_GENERATION}`,
        doc,
      );
      // The provider also talks to other tabs of this browser directly, so
      // tabs stay in step with each other even while the server is away.
      const provider = new YProvider(host, boardId, doc, {
        party: "board",
        connect: navigator.onLine,
      });
      if (!navigator.onLine) update({ connectionFailed: true });

      // The provider only learns that a connection is dead when the socket
      // closes, which can take a long time after the network has gone. The
      // browser usually knows sooner, so take its word: hang up when it says
      // offline and dial again when it says online.
      let gaveUp = false;
      const onOffline = () => {
        update({ connected: false, synced: false, connectionFailed: true });
        provider.disconnect();
      };
      const onOnline = () => {
        if (!gaveUp) void provider.connect();
      };
      window.addEventListener("offline", onOffline);
      window.addEventListener("online", onOnline);

      // A WebSocket has no connect timeout. Abandon a handshake that hangs;
      // closing the socket makes the provider try again.
      const stalled = createStallDetector(HANDSHAKE_TIMEOUT_MS);
      const watchdog = setInterval(() => {
        if (stalled(provider.wsconnecting, Date.now())) provider.ws?.close();
      }, 1_000);

      const refreshContent = () =>
        update({ hasContent: boardRoots(doc).meta.size > 0 });

      const onDocUpdate = (_update: Uint8Array, origin: unknown) => {
        refreshContent();
        const madeHere = origin !== provider && origin !== saved;
        // Goes by this session's own view of the connection. The provider's
        // flag only changes once the socket has finished closing, which can
        // be well after the browser has gone offline.
        if (madeHere && !signals.connected) update({ unsentChanges: true });
      };

      doc.on("update", onDocUpdate);
      void saved.whenSynced.then(refreshContent);

      provider.on("status", (event: { status: string }) => {
        if (event.status === "connected") {
          update({ connected: true });
        } else if (event.status === "disconnected") {
          update({ connected: false, synced: false });
        }
      });

      provider.on("sync", (synced: boolean) => {
        // Only a completed sync counts as the connection working. A server
        // that refuses a board first accepts the socket and then closes it.
        update(
          synced
            ? {
                synced: true,
                unsentChanges: false,
                connectionFailed: false,
                refusal: null,
              }
            : { synced: false },
        );
      });

      provider.on("connection-close", (event: CloseEvent | null) => {
        const refusal = event ? refusalFromCloseCode(event.code) : null;
        update({
          connected: false,
          synced: false,
          connectionFailed: true,
          refusal,
        });
        // The provider retries on its own, which is right when the server or
        // its storage is briefly away. A board that does not exist will not
        // appear by being asked for again.
        if (refusal === "board-not-found") {
          gaveUp = true;
          provider.disconnect();
        }
      });

      provider.on("connection-error", () => {
        update({ connectionFailed: true });
      });

      return () => {
        clearInterval(watchdog);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
        doc.off("update", onDocUpdate);
        provider.destroy();
        void saved.destroy();
        update({ connected: false, synced: false });
      };
    },
  };
}
