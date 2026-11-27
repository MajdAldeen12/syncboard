import Link from "next/link";
import type { ReactNode } from "react";

interface AppHeaderProps {
  /** The board's name, shown after the wordmark as the page's heading. */
  title?: ReactNode;
  /** Shown at the right: who is here, and whether the board is in sync. */
  end?: ReactNode;
}

/**
 * The one bar across the top of the app: the wordmark back to the home page,
 * the board's name, and the board's people and status.
 */
export function AppHeader({ title, end }: AppHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-foreground/10 px-4">
      <Link
        href="/"
        // Not fetched ahead: few people go from the board back to the home
        // page, and its code is mostly GSAP, which the board never uses.
        prefetch={false}
        className="shrink-0 rounded text-sm font-semibold tracking-tight outline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        SyncBoard
      </Link>
      {title !== undefined && (
        <>
          <span
            aria-hidden
            className="text-sm text-zinc-400 dark:text-zinc-600"
          >
            /
          </span>
          <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">
            {title}
          </h1>
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-3">{end}</div>
    </header>
  );
}
