import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

/**
 * How the room handles presence (who is on the board, their cursors).
 *
 * Presence travels as Yjs awareness messages. y-partyserver keeps the
 * awareness states in the room's memory, and a hibernating room loses its
 * memory about ten seconds after the last message. Measured in M4 (see
 * docs/decisions/0002-presence-and-hibernation.md): after a wake-up a
 * newcomer was told about nobody, and a tab that closed stayed on everyone
 * else's screen for good.
 *
 * So the room keeps each connection's latest presence with the connection
 * itself, in the WebSocket's attachment, which survives hibernation. The
 * functions here are the rules; `BoardRoom` applies them.
 */

/** The message type the Yjs providers use for awareness. */
const MESSAGE_AWARENESS = 1;

/** Longest state, as JSON text, that is accepted from a client. */
export const MAX_PRESENCE_BYTES = 1024;

/** Longest awareness message that is read at all. */
const MAX_MESSAGE_BYTES = 4 * MAX_PRESENCE_BYTES;

/** One client's state in an awareness message. */
export interface AwarenessEntry {
  /** The Yjs client id the state belongs to. */
  readonly clientId: number;
  /** Counts up with every change that client makes to its state. */
  readonly clock: number;
  /** The state as JSON text, or null once the client has left. */
  readonly state: string | null;
}

/** What the room remembers about the client on one connection. */
export interface PresenceMemory {
  readonly clientId: number;
  readonly clock: number;
  readonly state: string | null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Reads back what was stored with a connection. Null if nothing usable was. */
export function readMemory(value: unknown): PresenceMemory | null {
  if (typeof value !== "object" || value === null) return null;

  const { clientId, clock, state } = value as Record<string, unknown>;
  if (!isCount(clientId) || !isCount(clock)) return null;
  if (state !== null && typeof state !== "string") return null;
  return { clientId, clock, state };
}

/** JSON text of an object, or of null. Clients parse it without checking. */
function isStateText(text: string): boolean {
  if (text.length > MAX_PRESENCE_BYTES) return false;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && !Array.isArray(value);
  } catch {
    return false;
  }
}

/**
 * The entries of an awareness message. Null if `message` is some other kind
 * of message, which is then none of this module's business. Entries that
 * are malformed or oversized are left out, down to an empty list.
 */
export function decodeAwarenessMessage(
  message: Uint8Array,
): AwarenessEntry[] | null {
  if (message[0] !== MESSAGE_AWARENESS) return null;
  if (message.byteLength > MAX_MESSAGE_BYTES) return [];

  const entries: AwarenessEntry[] = [];
  try {
    const outer = decoding.createDecoder(message);
    decoding.readVarUint(outer);
    const update = decoding.createDecoder(decoding.readVarUint8Array(outer));

    const count = decoding.readVarUint(update);
    for (let index = 0; index < count; index += 1) {
      const clientId = decoding.readVarUint(update);
      const clock = decoding.readVarUint(update);
      const text = decoding.readVarString(update);
      if (!isStateText(text)) continue;
      entries.push({ clientId, clock, state: text === "null" ? null : text });
    }
  } catch {
    // Cut short or not what it claims to be. Keep what was read so far.
  }
  return entries;
}

/** An awareness message carrying `entries`, as the providers expect it. */
export function encodeAwarenessMessage(
  entries: readonly AwarenessEntry[],
): Uint8Array {
  const update = encoding.createEncoder();
  encoding.writeVarUint(update, entries.length);
  for (const entry of entries) {
    encoding.writeVarUint(update, entry.clientId);
    encoding.writeVarUint(update, entry.clock);
    encoding.writeVarString(update, entry.state ?? "null");
  }

  const message = encoding.createEncoder();
  encoding.writeVarUint(message, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(message, encoding.toUint8Array(update));
  return encoding.toUint8Array(message);
}

/**
 * Decides what to do with the entries a connection sent.
 *
 * A connection speaks for one client: the one it announces first. Entries
 * about anyone else are dropped, so a client cannot move or remove another
 * person's cursor, and states that clients send back after receiving them
 * go no further. An entry is taken if it is newer than what is remembered,
 * or if it is a goodbye at the current clock, which is how the protocol
 * sends one.
 *
 * Returns what to remember for the connection (the same object if nothing
 * changed) and the entries to pass on to everyone else.
 */
export function acceptPresence(
  memory: PresenceMemory | null,
  entries: readonly AwarenessEntry[],
): { memory: PresenceMemory | null; relay: AwarenessEntry[] } {
  let current = memory;
  const relay: AwarenessEntry[] = [];

  for (const entry of entries) {
    if (current === null) {
      // Nothing to remove for a client that never announced itself.
      if (entry.state === null) continue;
    } else {
      if (entry.clientId !== current.clientId) continue;
      const newer = entry.clock > current.clock;
      const goodbye =
        entry.clock === current.clock &&
        entry.state === null &&
        current.state !== null;
      if (!newer && !goodbye) continue;
    }

    current = {
      clientId: entry.clientId,
      clock: entry.clock,
      state: entry.state,
    };
    relay.push(entry);
  }

  return { memory: current, relay };
}

/**
 * What to tell everyone else when a connection closes. Null if its client
 * never announced itself or has already said goodbye.
 *
 * The goodbye carries the clock of the last state. Browsers remove a state
 * only for a goodbye at exactly the clock they hold, so if the same tab has
 * already reconnected on a new connection, with a higher clock, it stays.
 */
export function departure(
  memory: PresenceMemory | null,
): AwarenessEntry | null {
  if (memory === null || memory.state === null) return null;
  return { clientId: memory.clientId, clock: memory.clock, state: null };
}

/** Everyone who is here, for someone who has just connected. */
export function roster(
  memories: Iterable<PresenceMemory | null>,
): AwarenessEntry[] {
  const present: AwarenessEntry[] = [];
  for (const memory of memories) {
    if (memory === null || memory.state === null) continue;
    present.push({
      clientId: memory.clientId,
      clock: memory.clock,
      state: memory.state,
    });
  }
  return present;
}
