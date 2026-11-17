"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

const subscribeToNothing = () => () => {};

/**
 * Pages of the app rise into place when they are reached from another page,
 * for instance from the home page's "Open the demo board". A page that is
 * loaded directly is shown as it comes: it was sent as finished HTML, which
 * must never start out hidden.
 *
 * Only the arrival is animated. The App Router replaces the old page at
 * once, and the home page is GSAP's side of the project, so its exit is not
 * animated with Motion.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  // While React hydrates the HTML it was sent, it reads the server value:
  // false. A template mounted later, by navigating, reads true. Only the
  // value on mount matters, because Motion reads `initial` once.
  const arrived = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  // With reduced motion the page only fades in.
  const still = useReducedMotion();
  const from = still ? { opacity: 0 } : { opacity: 0, y: 8 };

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        data-page-enter
        className="flex min-h-0 flex-1 flex-col"
        initial={arrived ? from : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
