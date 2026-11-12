import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">SyncBoard</h1>
      <p className="text-foreground/70">
        Real-time collaborative kanban. Under construction.
      </p>
      <Link
        href="/demo"
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background outline-offset-2 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        Open the demo board
      </Link>
    </main>
  );
}
