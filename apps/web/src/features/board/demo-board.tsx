"use client";

import { createLocalBoardStore, createSeedBoard } from "@syncboard/core/board";
import { useState } from "react";
import { Board } from "./board";

/** The demo board, held in memory for this tab. */
export function DemoBoard() {
  const [store] = useState(() => createLocalBoardStore(createSeedBoard()));

  return <Board store={store} />;
}
