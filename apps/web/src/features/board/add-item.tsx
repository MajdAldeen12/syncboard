"use client";

import { useState, type FormEvent } from "react";
import { PlusIcon } from "./icons";

interface AddItemProps {
  /** Text of the button that opens the form, e.g. "Add a card". */
  label: string;
  placeholder: string;
  maxLength: number;
  /** Returns whether the item was added. The form stays open either way. */
  onAdd: (title: string) => boolean;
}

/**
 * A button that opens a one-field form. The form stays open after each
 * addition so several items can be typed in a row; Escape closes it.
 */
export function AddItem({
  label,
  placeholder,
  maxLength,
  onAdd,
}: AddItemProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  function close() {
    setOpen(false);
    setTitle("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (onAdd(title)) setTitle("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-600 outline-offset-1 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <PlusIcon />
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={title}
        maxLength={maxLength}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          // Keep keystrokes away from the drag-and-drop keyboard handling.
          event.stopPropagation();
          if (event.key === "Escape") close();
        }}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-black/10 outline-offset-1 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-zinc-800 dark:ring-white/10"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white outline-offset-2 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 outline-offset-1 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
