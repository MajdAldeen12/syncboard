import * as encoding from "lib0/encoding";
import { describe, expect, it } from "vitest";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import * as Y from "yjs";
import {
  MAX_PRESENCE_BYTES,
  acceptPresence,
  decodeAwarenessMessage,
  departure,
  encodeAwarenessMessage,
  readMemory,
  roster,
  type AwarenessEntry,
  type PresenceMemory,
} from "./presence-relay";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

/** A real awareness instance, as a browser on the board would hold. */
function client(clientId: number): Awareness {
  const doc = new Y.Doc();
  doc.clientID = clientId;
  const awareness = new Awareness(doc);
  // The protocol's timer would keep the test process alive.
  clearInterval(awareness._checkInterval);
  return awareness;
}

/** What a browser sends: the update, wrapped as the provider wraps it. */
function framed(update: Uint8Array, type = MESSAGE_AWARENESS): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** The update inside a message this module wrote, for a real client to apply. */
function payload(message: Uint8Array): Uint8Array {
  // One byte of message type, one byte of length for these small messages.
  return message.subarray(2);
}

const entry = (
  clientId: number,
  clock: number,
  state: object | null,
): AwarenessEntry => ({
  clientId,
  clock,
  state: state === null ? null : JSON.stringify(state),
});

const ANA = { user: { name: "Ana" } };

describe("decodeAwarenessMessage", () => {
  it("reads a message written by the awareness protocol", () => {
    const ana = client(7);
    ana.setLocalState(ANA);

    const entries = decodeAwarenessMessage(
      framed(encodeAwarenessUpdate(ana, [7])),
    );

    expect(entries).toEqual([
      { clientId: 7, clock: 1, state: JSON.stringify(ANA) },
    ]);
  });

  it("reads a departure as a state of null", () => {
    const ana = client(7);
    ana.setLocalState(null);

    expect(
      decodeAwarenessMessage(framed(encodeAwarenessUpdate(ana, [7]))),
    ).toEqual([{ clientId: 7, clock: 1, state: null }]);
  });

  it("says that a document message is not presence", () => {
    expect(
      decodeAwarenessMessage(framed(new Uint8Array([0, 0]), MESSAGE_SYNC)),
    ).toBeNull();
  });

  it("finds nothing usable in a message that is cut short", () => {
    const whole = framed(encodeAwarenessUpdate(client(7), [7]));

    expect(decodeAwarenessMessage(whole.subarray(0, 4))).toEqual([]);
    expect(decodeAwarenessMessage(new Uint8Array([MESSAGE_AWARENESS]))).toEqual(
      [],
    );
  });

  it.each([
    ["text", '"hello"'],
    ["a number", "5"],
    ["a list", "[1,2]"],
    ["not JSON at all", "{user:"],
  ])("skips a state that is %s", (_label, text) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 2);
    encoding.writeVarUint(encoder, 7);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarString(encoder, text);
    encoding.writeVarUint(encoder, 8);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarString(encoder, JSON.stringify(ANA));

    expect(
      decodeAwarenessMessage(framed(encoding.toUint8Array(encoder))),
    ).toEqual([{ clientId: 8, clock: 1, state: JSON.stringify(ANA) }]);
  });

  it("skips a state that is larger than a presence has any reason to be", () => {
    const big = client(7);
    big.setLocalState({ user: { name: "x".repeat(MAX_PRESENCE_BYTES) } });

    expect(
      decodeAwarenessMessage(framed(encodeAwarenessUpdate(big, [7]))),
    ).toEqual([]);
  });
});

describe("encodeAwarenessMessage", () => {
  it("writes a message the awareness protocol reads", () => {
    const reader = client(1);

    applyAwarenessUpdate(
      reader,
      payload(encodeAwarenessMessage([entry(7, 3, ANA)])),
      "test",
    );

    expect(reader.getStates().get(7)).toEqual(ANA);
    expect(reader.meta.get(7)?.clock).toBe(3);
  });

  it("is read back as the same entries", () => {
    const entries = [entry(7, 3, ANA), entry(8, 12, null)];

    expect(decodeAwarenessMessage(encodeAwarenessMessage(entries))).toEqual(
      entries,
    );
  });
});

describe("acceptPresence", () => {
  const known: PresenceMemory = {
    clientId: 7,
    clock: 4,
    state: JSON.stringify(ANA),
  };

  it("remembers a connection's first announcement and passes it on", () => {
    const first = entry(7, 1, ANA);

    expect(acceptPresence(null, [first])).toEqual({
      memory: { clientId: 7, clock: 1, state: JSON.stringify(ANA) },
      relay: [first],
    });
  });

  it("takes a newer state and passes it on", () => {
    const moved = entry(7, 5, { ...ANA, cursor: { x: 1, y: 2 } });

    const result = acceptPresence(known, [moved]);

    expect(result.memory).toEqual({ ...known, clock: 5, state: moved.state });
    expect(result.relay).toEqual([moved]);
  });

  it("drops a state it has already seen", () => {
    // What an echo looks like: the same clock again.
    const result = acceptPresence(known, [entry(7, 4, ANA), entry(7, 2, ANA)]);

    expect(result.memory).toBe(known);
    expect(result.relay).toEqual([]);
  });

  it("does not let a connection speak for another client", () => {
    const result = acceptPresence(known, [
      entry(9, 50, ANA),
      entry(9, 51, null),
    ]);

    expect(result.memory).toBe(known);
    expect(result.relay).toEqual([]);
  });

  it("passes on only the connection's own part of a mixed message", () => {
    const own = entry(7, 5, ANA);

    const result = acceptPresence(known, [entry(9, 50, ANA), own]);

    expect(result.relay).toEqual([own]);
  });

  it("takes a departure at the same clock, as the protocol sends it", () => {
    const left = entry(7, 4, null);

    const result = acceptPresence(known, [left]);

    expect(result.memory).toEqual({ clientId: 7, clock: 4, state: null });
    expect(result.relay).toEqual([left]);
  });

  it("passes a departure on once", () => {
    const gone: PresenceMemory = { clientId: 7, clock: 4, state: null };

    const result = acceptPresence(gone, [entry(7, 4, null)]);

    expect(result.memory).toBe(gone);
    expect(result.relay).toEqual([]);
  });

  it("lets someone who left come back", () => {
    const gone: PresenceMemory = { clientId: 7, clock: 4, state: null };
    const back = entry(7, 5, ANA);

    const result = acceptPresence(gone, [back]);

    expect(result.memory).toEqual({ ...known, clock: 5 });
    expect(result.relay).toEqual([back]);
  });

  it("has nothing to do with a departure from a connection it never heard from", () => {
    expect(acceptPresence(null, [entry(7, 3, null)])).toEqual({
      memory: null,
      relay: [],
    });
  });
});

describe("departure", () => {
  const known: PresenceMemory = {
    clientId: 7,
    clock: 4,
    state: JSON.stringify(ANA),
  };

  it("tells the others that the connection's client has gone", () => {
    expect(departure(known)).toEqual({ clientId: 7, clock: 4, state: null });
  });

  it("has nothing to say for a connection that never announced itself", () => {
    expect(departure(null)).toBeNull();
  });

  it("has nothing to say for a client that already said goodbye", () => {
    expect(departure({ ...known, state: null })).toBeNull();
  });

  it("removes the person from a browser that holds that state", () => {
    const other = client(1);
    applyAwarenessUpdate(
      other,
      payload(encodeAwarenessMessage([entry(7, 4, ANA)])),
      "test",
    );
    expect(other.getStates().has(7)).toBe(true);

    applyAwarenessUpdate(
      other,
      payload(encodeAwarenessMessage([departure(known)!])),
      "test",
    );

    expect(other.getStates().has(7)).toBe(false);
  });

  it("leaves alone a person who has since reconnected on another connection", () => {
    // The same tab reconnects before its old connection is seen to close.
    // Its new state has a higher clock, so the old connection's goodbye must
    // not remove it.
    const other = client(1);
    applyAwarenessUpdate(
      other,
      payload(encodeAwarenessMessage([entry(7, 5, ANA)])),
      "test",
    );

    applyAwarenessUpdate(
      other,
      payload(encodeAwarenessMessage([departure(known)!])),
      "test",
    );

    expect(other.getStates().get(7)).toEqual(ANA);
  });
});

describe("roster", () => {
  it("lists everyone who is here for someone who has just arrived", () => {
    const bo = { user: { name: "Bo" } };

    const present = roster([
      { clientId: 7, clock: 4, state: JSON.stringify(ANA) },
      null,
      { clientId: 8, clock: 9, state: null },
      { clientId: 9, clock: 2, state: JSON.stringify(bo) },
    ]);

    // Not the connection that never spoke, nor the client that left.
    expect(present.map((each) => each.clientId)).toEqual([7, 9]);

    const newcomer = client(1);
    applyAwarenessUpdate(
      newcomer,
      payload(encodeAwarenessMessage(present)),
      "test",
    );
    expect([...newcomer.getStates().keys()].sort()).toEqual([1, 7, 9]);
    expect(newcomer.getStates().get(9)).toEqual(bo);
  });

  it("is empty when nobody has announced themselves", () => {
    expect(roster([null, null])).toEqual([]);
  });
});

describe("readMemory", () => {
  const stored = { clientId: 7, clock: 4, state: JSON.stringify(ANA) };

  it("reads back what was stored with a connection", () => {
    expect(readMemory(stored)).toEqual(stored);
    expect(readMemory({ ...stored, state: null })).toEqual({
      ...stored,
      state: null,
    });
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a client id that is not a whole number", { ...stored, clientId: 1.5 }],
    ["a negative clock", { ...stored, clock: -1 }],
    ["a state that is not text", { ...stored, state: { user: 1 } }],
  ])("reads %s as no memory", (_label, value) => {
    expect(readMemory(value)).toBeNull();
  });
});
