"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

interface ModalDialogProps {
  /** Accessible name of the dialog. Give this or `labelledBy`. */
  label?: string;
  /** Id of the element that names the dialog. */
  labelledBy?: string;
  /** Called on Escape, on a click outside the panel, and by the caller's own buttons. */
  onDismiss: () => void;
  /** Tailwind width of the panel. */
  width?: string;
  children: ReactNode;
}

/**
 * A modal dialog on the browser's own `<dialog>`, opened with `showModal()`:
 * the page behind it is inert, so focus cannot leave it, and Escape closes
 * it.
 *
 * Render it inside `AnimatePresence` and remove it to close it. The backdrop
 * and the panel are elements inside the dialog, so that Motion can fade and
 * move them on the way in and out; the native `::backdrop` cannot be
 * animated. While it plays out, the dialog stays open and modal.
 *
 * The caller decides where focus goes once it has closed.
 */
export function ModalDialog({
  label,
  labelledBy,
  onDismiss,
  width = "max-w-lg",
  children,
}: ModalDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // With reduced motion the panel only fades. Without movement in its
  // starting state, it is not drawn out of place for a frame either.
  const still = useReducedMotion();

  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      aria-labelledby={labelledBy}
      data-modal
      onCancel={(event) => {
        // Escape. The dialog closes by being removed, after its exit animation.
        event.preventDefault();
        onDismiss();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-inherit backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-zinc-950/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onDismiss}
      />
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
        <motion.div
          data-modal-panel
          className={`pointer-events-auto relative w-full ${width} rounded-xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10`}
          initial={still ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </dialog>
  );
}
