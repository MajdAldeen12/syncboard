"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** How long the offer to undo stays, while nobody is pointing at it or in it. */
const SHOWN_MS = 8000;

interface UndoToastProps {
  /** What happened, for instance "Card deleted". */
  message: string;
  /** The name of what it happened to, shown after the message. */
  subject: string;
  onUndo: () => void;
  /** Called when the time is up, or on Escape. */
  onDismiss: () => void;
}

/**
 * A short-lived offer to take something back, at the bottom of the board.
 * Render it inside `AnimatePresence`, with a key that is new for every
 * offer, so that each one gets its full time.
 *
 * It waits while the pointer is over it or focus is inside it, so that
 * nobody loses it while reaching for the button. Ctrl+Z (Cmd+Z) is handled
 * by the board, which knows when a text field has focus.
 */
export function UndoToast({
  message,
  subject,
  onUndo,
  onDismiss,
}: UndoToastProps) {
  const still = useReducedMotion();
  const [paused, setPaused] = useState({ hover: false, focus: false });
  const held = paused.hover || paused.focus;
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => dismiss.current(), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [held]);

  return (
    <motion.div
      data-undo-toast
      role="status"
      className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl bg-zinc-900 py-2 pr-2 pl-4 text-sm text-white shadow-lg ring-1 ring-black/10 dark:bg-zinc-100 dark:text-zinc-900"
      initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      onPointerEnter={() => setPaused((now) => ({ ...now, hover: true }))}
      onPointerLeave={() => setPaused((now) => ({ ...now, hover: false }))}
      onFocus={() => setPaused((now) => ({ ...now, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setPaused((now) => ({ ...now, focus: false }));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
      }}
    >
      <p className="min-w-0 truncate">
        {message}: <span className="font-medium">{subject}</span>
      </p>
      <button
        type="button"
        onClick={onUndo}
        aria-keyshortcuts="Control+Z Meta+Z"
        className="shrink-0 rounded-lg px-3 py-1.5 font-semibold text-sky-300 outline-offset-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 dark:text-blue-700 dark:hover:bg-black/5 dark:focus-visible:outline-blue-600"
      >
        Undo
      </button>
    </motion.div>
  );
}
