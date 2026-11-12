import * as Y from "yjs";

/**
 * Keeps a Yjs document in step with the same document in other tabs of this
 * browser, over a BroadcastChannel. There is no server: tabs talk to each
 * other directly, and the board lives only as long as a tab holds it.
 *
 * A tab that joins says what it already has ("hello"). Each tab that hears
 * it answers with what the newcomer lacks and with what it has itself
 * ("welcome"), and the newcomer sends back anything the other lacks. After
 * that, every change is sent on as it happens.
 */

/** A tab is named by its Yjs client id, which is unique per document. */
type Peer = number;

type Message =
  | { type: "hello"; from: Peer; vector: Uint8Array }
  | {
      type: "welcome";
      from: Peer;
      to: Peer;
      vector: Uint8Array;
      update: Uint8Array;
    }
  | { type: "update"; from: Peer; to?: Peer; update: Uint8Array };

const isBytes = (value: unknown): value is Uint8Array =>
  value instanceof Uint8Array;

/** Only tabs of this app can post here, but they may run an older build. */
function parse(data: unknown): Message | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (typeof message.from !== "number") return null;

  switch (message.type) {
    case "hello":
      return isBytes(message.vector) ? (message as Message) : null;
    case "welcome":
      return typeof message.to === "number" &&
        isBytes(message.vector) &&
        isBytes(message.update)
        ? (message as Message)
        : null;
    case "update":
      return (message.to === undefined || typeof message.to === "number") &&
        isBytes(message.update)
        ? (message as Message)
        : null;
    default:
      return null;
  }
}

/**
 * Connects `doc` to the channel called `name`. Every tab that should share
 * the document must use the same name, and tabs that start from different
 * content must not. Returns a function that disconnects.
 */
export function connectBroadcastChannel(doc: Y.Doc, name: string): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};

  const channel = new BroadcastChannel(name);
  const me: Peer = doc.clientID;
  // Marks changes that arrived through this channel, so that they are not
  // sent straight back out.
  const origin = { channel: name };

  const send = (message: Message) => channel.postMessage(message);

  /** Runs a step that handles data from another tab; bad data is dropped. */
  function safely(step: () => void): void {
    try {
      step();
    } catch (error) {
      console.error("SyncBoard: ignored a message from another tab.", error);
    }
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = parse(event.data);
    if (!message) return;
    if ("to" in message && message.to !== undefined && message.to !== me) {
      return;
    }

    safely(() => {
      switch (message.type) {
        case "hello":
          send({
            type: "welcome",
            from: me,
            to: message.from,
            vector: Y.encodeStateVector(doc),
            update: Y.encodeStateAsUpdate(doc, message.vector),
          });
          break;
        case "welcome":
          Y.applyUpdate(doc, message.update, origin);
          send({
            type: "update",
            from: me,
            to: message.from,
            update: Y.encodeStateAsUpdate(doc, message.vector),
          });
          break;
        case "update":
          Y.applyUpdate(doc, message.update, origin);
          break;
      }
    });
  };

  const onUpdate = (update: Uint8Array, updateOrigin: unknown) => {
    if (updateOrigin !== origin) send({ type: "update", from: me, update });
  };
  doc.on("update", onUpdate);

  send({ type: "hello", from: me, vector: Y.encodeStateVector(doc) });

  return () => {
    doc.off("update", onUpdate);
    channel.close();
  };
}
