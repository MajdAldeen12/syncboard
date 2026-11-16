import { SYNC_CLOSE_CODES } from "@syncboard/core/sync-status";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { durableObjectSnapshotStore } from "./durable-object-store";
import {
  acceptPresence,
  decodeAwarenessMessage,
  departure,
  encodeAwarenessMessage,
  readMemory,
  roster,
  type PresenceMemory,
} from "./presence-relay";
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
 * What the room keeps with a connection. It lives in the WebSocket's
 * attachment, so it is still there after the room has hibernated.
 * y-partyserver keeps a key of its own in the same object.
 */
interface ConnectionMemory {
  readonly presence?: PresenceMemory | null;
}

function presenceOf(connection: Connection): PresenceMemory | null {
  return readMemory((connection.state as ConnectionMemory | null)?.presence);
}

function bytesOf(message: Exclude<WSMessage, string>): Uint8Array {
  return message instanceof ArrayBuffer
    ? new Uint8Array(message)
    : new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
}

/**
 * One board. Relays Yjs updates between the people on it and keeps the
 * document in storage.
 *
 * The room hibernates: about ten seconds after the last message it is
 * dropped from memory while its WebSockets stay open, and it is constructed
 * again, and `onLoad` run again, when the next message arrives. See
 * docs/decisions/0001-durable-object-hibernation.md.
 *
 * Presence (who is here, their cursors) is relayed by this class, not by
 * y-partyserver, because it has to survive that. See presence-relay.ts and
 * docs/decisions/0002-presence-and-hibernation.md.
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

    // Tell the newcomer who is already here. What each person last said is
    // kept with their connection, so this works after a wake-up too.
    const present = roster(this.#others(connection).map(presenceOf));
    if (present.length > 0) {
      this.#send(connection, encodeAwarenessMessage(present));
    }
  }

  override onMessage(
    connection: Connection,
    message: WSMessage,
  ): void | Promise<void> {
    const entries =
      typeof message === "string"
        ? null
        : decodeAwarenessMessage(bytesOf(message));
    // Not presence: the document, which y-partyserver handles.
    if (entries === null) return super.onMessage(connection, message);

    // Whether the connection may change the document is not asked here.
    // Someone who may only look at a board is still on it.
    const { memory, relay } = acceptPresence(presenceOf(connection), entries);
    if (relay.length === 0) return;

    connection.setState((previous: unknown) => ({
      ...(previous as ConnectionMemory | null),
      presence: memory,
    }));
    const passedOn = encodeAwarenessMessage(relay);
    for (const other of this.#others(connection)) this.#send(other, passedOn);
  }

  override onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean,
  ): void | Promise<void> {
    // However the connection ended, a closed tab included, the others are
    // told at once. Nothing else would tell them: no client repeats its
    // presence on a timer, so that an idle board can stay asleep.
    const gone = departure(presenceOf(connection));
    if (gone) {
      const goodbye = encodeAwarenessMessage([gone]);
      for (const other of this.#others(connection)) this.#send(other, goodbye);
    }
    return super.onClose(connection, code, reason, wasClean);
  }

  #others(connection: Connection): Connection[] {
    return [...this.getConnections()].filter(
      (other) => other.id !== connection.id,
    );
  }

  #send(connection: Connection, message: Uint8Array): void {
    try {
      connection.send(message);
    } catch {
      // The socket is closing. Its own close will tidy up.
    }
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
