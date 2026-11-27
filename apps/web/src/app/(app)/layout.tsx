import type { ReactNode } from "react";

/**
 * A full-height page. Each page draws its own header bar (`AppHeader`), so
 * that a board's name, people and status sit in the same bar as the
 * wordmark instead of in a second one under it.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-dvh flex-col">{children}</div>;
}
