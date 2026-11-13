import { SYNC_CLOSE_CODES } from "@syncboard/core/sync-status";
import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { durableObjectSnapshotStore } from "./durable-object-store";
import { loadBoard, type SnapshotStore } from "./room-load";
import { seedFor, shouldFailLoad, type TestBoardOptions } from "./seed";

/** Why this room is turning connections away. */
interface Refusal {
  readonly code: number;
  readonly reason: string;
  /** Storage may come back; a missing board will not appear by itself. */
  readonly retry: boolean;
}

/** How long to wait before asking storage again after it failed. */
const RETRY_LOAD_AFTER_MS = 5_000;

/**
 * One board. Relays Yjs updates between the people on it and keeps the
 * document in storage.
 *
 * The room hibernates: about ten seconds after the last message it is
 * dropped from memory while its WebSockets stay open, and it is constructed
 * again, and `onLoad` run again, when the next message arrives. See
 * docs/decisions/0001-durable-object-hibernation.md.
 */
export class BoardRoom extends YServer<Env> {
  static override options = { hibernate: true };

  #refusal: Refusal | null = null;
  #lastLoadAttempt = 0;

  get #testBoards(): TestBoardOptions {
    return { allowTestBoards: this.env.ALLOW_TEST_BOARDS === "1" };
  }

  get #store(): SnapshotStore {
    if (shouldFailLoad(this.name, this.#testBoards)) {
      return {
        load: async () => {
          throw new Error("Storage failure requested by a test board.");
        },
        save: async () => {},
      };
    }
    return durableObjectSnapshotStore(this.ctx.storage);
  }

  override async onLoad(): Promise<void> {
    this.#lastLoadAttempt = Date.now();
    const result = await loadBoard(this.#store, this.name, (boardId) =>
      seedFor(boardId, this.#testBoards),
    );

    switch (result.kind) {
      case "ready":
        Y.applyUpdate(this.document, result.snapshot);
        this.#refusal = null;
        return;
      case "not-found":
        this.#refusal = {
          code: SYNC_CLOSE_CODES.boardNotFound,
          reason: "board not found",
          retry: false,
        };
        return;
      case "unavailable":
        console.error(`Board ${this.name}: storage unavailable.`, result.error);
        this.#refusal = {
          code: SYNC_CLOSE_CODES.storageUnavailable,
          reason: "storage unavailable",
          retry: true,
        };
        return;
    }
  }

  override async onStart(): Promise<void> {
    await super.onStart();

    // After a wake-up, sockets from before hibernation are still attached.
    // If the document could not be loaded they must not stay connected to an
    // empty one.
    if (this.#refusal) {
      for (const connection of this.getConnections()) {
        connection.close(this.#refusal.code, this.#refusal.reason);
      }
    }
  }

  override async onConnect(
    connection: Connection,
    ctx: ConnectionContext,
  ): Promise<void> {
    // A room that failed to load stays in memory while people keep trying to
    // connect, so it would never be constructed afresh. Ask storage again
    // once enough time has passed.
    if (
      this.#refusal?.retry &&
      Date.now() - this.#lastLoadAttempt >= RETRY_LOAD_AFTER_MS
    ) {
      await this.onLoad();
    }

    if (this.#refusal) {
      connection.close(this.#refusal.code, this.#refusal.reason);
      return;
    }
    await super.onConnect(connection, ctx);
  }

  /** While the room is refusing connections, nothing may change its document. */
  override isReadOnly(): boolean {
    return this.#refusal !== null;
  }

  override async onSave(): Promise<void> {
    // Never save after a failed load: the document in memory is not the board.
    if (this.#refusal) return;

    await this.#store.save(this.name, Y.encodeStateAsUpdate(this.document));
  }
}
