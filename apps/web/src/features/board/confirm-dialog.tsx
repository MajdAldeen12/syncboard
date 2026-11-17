"use client";

import { useId } from "react";
import { ModalDialog } from "./modal-dialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Text of the button that goes ahead, for instance "Delete column". */
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * Asks before something that cannot be undone. Cancel has focus at first,
 * so that pressing Enter by habit does no harm.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  const titleId = useId();

  return (
    <ModalDialog labelledBy={titleId} onDismiss={onDismiss} width="max-w-sm">
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-700 outline-offset-2 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white outline-offset-2 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}
