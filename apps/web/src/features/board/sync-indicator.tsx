import type { SyncStatus } from "@syncboard/core/sync-status";

type ShownStatus = Extract<
  SyncStatus,
  { kind: "synced" | "syncing" | "offline" }
>;

const DOT: Record<ShownStatus["kind"], string> = {
  synced: "bg-emerald-500",
  syncing: "bg-amber-500 motion-safe:animate-pulse",
  offline: "bg-zinc-400",
};

function label(status: ShownStatus): string {
  switch (status.kind) {
    case "synced":
      return "Synced";
    case "syncing":
      return "Syncing…";
    case "offline":
      return status.unsent
        ? "Offline. Your changes are kept on this device."
        : "Offline";
  }
}

/** Says whether the board on screen is in step with the server. */
export function SyncIndicator({ status }: { status: ShownStatus }) {
  return (
    <p
      role="status"
      data-sync-status={status.kind}
      className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
    >
      <span aria-hidden className={`size-2 rounded-full ${DOT[status.kind]}`} />
      {label(status)}
    </p>
  );
}
