"use client";

import {
  createLocalBoardStore,
  createSeedBoard,
  type BoardStore,
} from "@syncboard/core/board";
import {
  createYjsBoardStore,
  encodeBoardState,
  fingerprint,
} from "@syncboard/core/board-doc";
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { connectBroadcastChannel } from "@/lib/broadcast-provider";
import { Board } from "./board";

interface DemoBoardState {
  readonly store: BoardStore;
  /** The shared document and the channel it syncs over. Browser only. */
  readonly shared: { readonly doc: Y.Doc; readonly channel: string } | null;
}

function createDemoBoard(): DemoBoardState {
  const seed = createSeedBoard();

  // On the server the board is only drawn once, so a plain in-memory store
  // is enough. It also keeps the prerender free of random values: creating a
  // Yjs document draws a random client id, which Next.js does not allow in
  // a prerendered page.
  if (typeof window === "undefined") {
    return { store: createLocalBoardStore(seed), shared: null };
  }

  // In the browser the board lives in a Yjs document. Every tab starts it
  // from the same seed update, which is what lets tabs merge instead of each
  // adding its own copy of the starting cards. Both stores show the same
  // board at first, so hydration matches what the server sent.
  const doc = new Y.Doc();
  const update = encodeBoardState(seed);
  Y.applyUpdate(doc, update);

  return {
    store: createYjsBoardStore(doc),
    // Tabs that started from different seed content (an old tab after a new
    // release) must not sync, so the content is part of the channel name.
    shared: { doc, channel: `syncboard:demo:${fingerprint(update)}` },
  };
}

/** The demo board, shared between the tabs of this browser. */
export function DemoBoard() {
  const [{ store, shared }] = useState(createDemoBoard);

  useEffect(() => {
    if (!shared) return;
    return connectBroadcastChannel(shared.doc, shared.channel);
  }, [shared]);

  return <Board store={store} />;
}
