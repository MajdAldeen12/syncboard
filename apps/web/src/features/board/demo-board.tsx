"use client";

import type { SyncStatus } from "@syncboard/core/sync-status";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createBoardSession } from "@/lib/board-session";
import { SYNC_HOST, boardIdFromSearch } from "@/lib/sync-config";
import { Board } from "./board";
import { BoardLoading, BoardUnavailable } from "./board-placeholder";
import { SyncIndicator } from "./sync-indicator";

const LOADING: SyncStatus = { kind: "loading" };
const getLoading = () => LOADING;
const subscribeToNothing = () => () => {};

/** The demo board, shared with everyone else who has it open. */
export function DemoBoard() {
  // The server draws the loading state: the board's content only exists in
  // the browser's saved copy and on the sync server. The session is created
  // on the first browser render and starts out loading too, so the two match.
  const [session] = useState(() =>
    typeof window === "undefined"
      ? null
      : createBoardSession(boardIdFromSearch(window.location.search)),
  );

  useEffect(() => session?.connect(SYNC_HOST), [session]);

  const status = useSyncExternalStore(
    session?.subscribeStatus ?? subscribeToNothing,
    session?.getStatus ?? getLoading,
    getLoading,
  );

  if (!session || status.kind === "loading") return <BoardLoading />;
  if (status.kind === "unavailable") {
    return <BoardUnavailable reason={status.reason} />;
  }

  return (
    <Board
      store={session.store}
      headerEnd={<SyncIndicator status={status} />}
    />
  );
}
