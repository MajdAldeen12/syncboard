import type { Metadata } from "next";
import Link from "next/link";
import { FeatureTour } from "@/features/landing/feature-tour";
import { displayFont } from "@/features/landing/fonts";
import { HeroSketch } from "@/features/landing/hero-sketch";
import { TourStep } from "@/features/landing/tour-step";

const REPOSITORY = "https://github.com/MajdAldeen12/syncboard";

export const metadata: Metadata = {
  description:
    "A free, open-source kanban board for working together live: see who is on the board, move cards together, and keep working offline.",
};

const FOCUS =
  "outline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-600";

const PRIMARY = `inline-flex h-12 items-center rounded-lg bg-foreground px-6 font-semibold text-background transition-opacity hover:opacity-85 ${FOCUS}`;

const TEXT_LINK = `rounded-sm font-medium text-foreground underline decoration-zinc-400 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-600 ${FOCUS}`;

const BUILT_WITH = [
  {
    term: "Yjs",
    detail:
      "The board is a Yjs document, a CRDT. Edits made at the same moment merge instead of overwriting each other, and two people typing in one title both keep their words.",
  },
  {
    term: "Cloudflare Durable Objects",
    detail:
      "Each board is one Durable Object that passes changes between people and stores the document. It sleeps while the board is quiet, with everyone still connected.",
  },
  {
    term: "IndexedDB",
    detail:
      "Every browser keeps its own copy of the board, so it reopens without a connection and catches up when the connection is back.",
  },
  {
    term: "dnd-kit",
    detail:
      "Cards and columns move by mouse, touch and keyboard. While someone holds a card, the others see who has it.",
  },
  {
    term: "Motion and GSAP",
    detail:
      "Motion slides cards into their new places in the app. This page is animated with GSAP, and a lint rule keeps the two from ever touching the same element.",
  },
  {
    term: "Playwright",
    detail:
      "Browser tests open the board in two and three browsers at once, against a real sync server, and check what each person sees.",
  },
] as const;

export default function HomePage() {
  return (
    <div className={`${displayFont.variable} flex flex-1 flex-col`}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <span className="font-display text-xl font-extrabold tracking-[-0.03em]">
          SyncBoard
        </span>
        <a href={REPOSITORY} className={`text-sm ${TEXT_LINK}`}>
          GitHub
        </a>
      </header>

      <main className="flex flex-1 flex-col">
        <section
          aria-labelledby="hero-title"
          className="mx-auto grid w-full max-w-6xl items-center gap-x-16 gap-y-14 px-4 pt-8 pb-24 sm:px-6 lg:min-h-[calc(100svh-4.75rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-8 lg:pt-4"
        >
          <div>
            <h1
              id="hero-title"
              className="font-display text-[2.75rem] leading-[0.98] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.5rem]"
            >
              Move a card, and it moves for everyone.
            </h1>
            <p className="mt-6 max-w-[32rem] text-lg/relaxed text-zinc-600 dark:text-zinc-400">
              SyncBoard is a free, open-source kanban board for working together
              live. See who is on the board and what they are doing, and keep
              working when your connection drops.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/demo" className={PRIMARY}>
                Open the demo board
              </Link>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No account needed.
              </p>
            </div>
          </div>
          <HeroSketch />
        </section>

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <FeatureTour>
            <TourStep id="tour-presence" title="See who is here">
              <p>
                Everyone on the board has an avatar at the top and a pointer
                with their name on it. When someone edits or moves a card, the
                card says who, before you start on the same one.
              </p>
            </TourStep>
            <TourStep id="tour-offline" title="Keep working offline">
              <ol className="space-y-3">
                {[
                  "The connection drops. The board stays open, and your changes are kept on this device.",
                  "Everyone carries on: you on your copy, the others on theirs.",
                  "You reconnect, and both sets of changes merge into one board.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-sm font-semibold text-foreground tabular-nums dark:bg-zinc-800"
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </TourStep>
            <TourStep
              id="tour-input"
              title="Drag with a mouse, a finger or the keyboard"
            >
              <p>
                Press Space on a card, move it with the arrow keys, and press
                Space again to drop it. On a phone or tablet, drag it with your
                finger. Columns move the same way.
              </p>
            </TourStep>
            <TourStep id="tour-guest" title="Try it without an account">
              <p>
                The demo board is open to anyone. You join as a guest with a
                made-up name and colour, like Swift Puffin, and everyone already
                there sees you arrive.
              </p>
              <p>
                <Link href="/demo" className={TEXT_LINK}>
                  Open the demo board
                </Link>
              </p>
            </TourStep>
          </FeatureTour>
        </div>

        <section
          aria-labelledby="built-title"
          className="mt-16 border-t border-zinc-200 dark:border-zinc-800"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <h2
              id="built-title"
              className="font-display text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl"
            >
              How it is built
            </h2>
            <p className="mt-4 max-w-2xl text-lg/relaxed text-zinc-600 dark:text-zinc-400">
              All of it is in the public repository, tests included.
            </p>
            <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {BUILT_WITH.map(({ term, detail }) => (
                <div key={term}>
                  <dt className="font-semibold">{term}</dt>
                  <dd className="mt-2 leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <section
          aria-labelledby="try-title"
          className="border-t border-zinc-200 dark:border-zinc-800"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-24">
            <div>
              <h2
                id="try-title"
                className="font-display text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-4xl"
              >
                See it for yourself
              </h2>
              <p className="mt-4 max-w-xl text-lg/relaxed text-zinc-600 dark:text-zinc-400">
                Open the demo board in two browser windows and move a card in
                one. It moves in the other, with your pointer and your name on
                it.
              </p>
            </div>
            <Link href="/demo" className={`shrink-0 ${PRIMARY}`}>
              Open the demo board
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-zinc-400">
          <p>
            SyncBoard is open source under the MIT licence. Sign-in, sharing and
            boards of your own are still being built.
          </p>
          <a href={REPOSITORY} className={TEXT_LINK}>
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
