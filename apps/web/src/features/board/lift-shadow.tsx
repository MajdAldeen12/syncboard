"use client";

import { motion } from "motion/react";

interface LiftShadowProps {
  /** True while the card or column is held. */
  lifted: boolean;
  /** Corner rounding matching the item, and the shadow to show. */
  className: string;
}

/**
 * A shadow that fades in when a card or column is picked up and out as it
 * is set down.
 *
 * It is an element of its own inside the item: while an item is held,
 * dnd-kit owns its `transform` and `transition`, so nothing set on the item
 * itself can animate then. Only opacity is animated, which reduced motion
 * keeps.
 */
export function LiftShadow({ lifted, className }: LiftShadowProps) {
  return (
    <motion.span
      aria-hidden
      data-lift-shadow
      className={`pointer-events-none absolute inset-0 ${className}`}
      initial={false}
      animate={{ opacity: lifted ? 1 : 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    />
  );
}
