import type { ReactNode } from "react";

/**
 * One step of the feature tour. Steps are equally tall, so each gets an
 * equal share of the tour's timeline, and their text sits in the middle so
 * that its scene plays while it is being read.
 */
export function TourStep({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex min-h-[70svh] flex-col justify-center py-10 md:min-h-[80svh]"
    >
      <h2
        id={id}
        className="font-display text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-4xl"
      >
        {title}
      </h2>
      <div className="mt-4 max-w-md space-y-4 text-lg/relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}
