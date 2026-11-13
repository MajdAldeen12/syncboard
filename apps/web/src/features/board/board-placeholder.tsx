import type { SyncStatus } from "@syncboard/core/sync-status";

/** Shown while the board is being fetched for the first time. */
export function BoardLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      data-board-state="loading"
      className="flex min-h-0 flex-1 flex-col"
    >
      <p className="sr-only">Loading the board…</p>
      <div className="mx-4 mt-4 h-7 w-40 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      <div aria-hidden className="flex items-start gap-3 p-4">
        {[3, 2, 1].map((cards, index) => (
          <div
            key={index}
            className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-zinc-100 p-2 dark:bg-zinc-900"
          >
            <div className="h-7 w-24 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
            {Array.from({ length: cards }, (_, card) => (
              <div
                key={card}
                className="h-9 rounded-lg bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type Reason = Extract<SyncStatus, { kind: "unavailable" }>["reason"];

const MESSAGE: Record<Reason, { title: string; detail: string }> = {
  offline: {
    title: "Can't reach the board",
    detail:
      "There is no connection to the server and no copy of this board on this device yet. Trying again…",
  },
  "storage-unavailable": {
    title: "The board is unavailable right now",
    detail:
      "The server could not load this board, so it is not being shown. Nothing has been lost. Trying again…",
  },
  "board-not-found": {
    title: "This board does not exist",
    detail: "Check the address, or ask whoever shared it with you.",
  },
};

/** Shown when there is no board to show and no way to get it right now. */
export function BoardUnavailable({ reason }: { reason: Reason }) {
  const { title, detail } = MESSAGE[reason];

  return (
    <div
      role="alert"
      data-board-state="unavailable"
      data-reason={reason}
      className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        {detail}
      </p>
    </div>
  );
}
