import Link from "next/link";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-foreground/10 px-4">
        <Link
          href="/"
          className="rounded text-sm font-semibold tracking-tight outline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          SyncBoard
        </Link>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
