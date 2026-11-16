"use client";

import type { SyncStatus } from "@syncboard/core/sync-status";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AvatarStack } from "@/features/presence/avatar-stack";
import { createBoardSession } from "@/lib/board-session";
import { loadGuest } from "@/lib/guest-identity";
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

  // Until there is sign-in, everyone is a guest with a made-up name.
  useEffect(() => session?.connect(SYNC_HOST, loadGuest()), [session]);

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
      presence={session.presence}
      headerEnd={
        <div className="flex items-center gap-3">
          <AvatarStack presence={session.presence} />
          <SyncIndicator status={status} />
        </div>
      }
    />
  );
}
