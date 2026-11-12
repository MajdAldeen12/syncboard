"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import {
  MAX_TITLE_LENGTH,
  type BoardStore,
  type CardView,
} from "@syncboard/core/board";
import { memo, useState } from "react";
import { CloseIcon, PencilIcon } from "./icons";
import { TextEditor, useFocusAfterEdit } from "./inline-text";

interface CardProps {
  card: CardView;
  index: number;
  /** The column the card is shown in. During a drag this can differ from `card.columnId`. */
  columnId: string;
  store: BoardStore;
}

const ACTION_CLASS =
  "flex size-6 items-center justify-center rounded text-zinc-500 outline-offset-1 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-700";

export const Card = memo(function Card({
  card,
  index,
  columnId,
  store,
}: CardProps) {
  const [editing, setEditing] = useState(false);
  const [editButtonRef, requestFocus] =
    useFocusAfterEdit<HTMLButtonElement>(editing);

  const { ref, isDragging } = useSortable({
    id: card.id,
    index,
    group: columnId,
    type: "card",
    accept: "card",
    // No `disabled` while editing: dnd-kit already ignores pointer and key
    // presses that start inside a text field, and disabling the card would
    // mark the field itself as disabled for assistive technology.
  });

  return (
    // The title is plain text, not a button: dnd-kit does not start a drag
    // from a button, and the whole card should be grabbable. A group role
    // keeps the Edit and Delete buttons valid children for assistive tech.
    <div
      ref={ref}
      role="group"
      // dnd-kit adds tabindex itself, but only after the first interaction
      // with the page. Cards must be reachable by keyboard from the start.
      tabIndex={0}
      aria-label={card.title}
      data-card-id={card.id}
      onDoubleClick={() => setEditing(true)}
      className={`group/card relative shrink-0 rounded-lg bg-white px-2 py-1.5 text-sm shadow-sm ring-1 ring-black/5 outline-offset-1 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-zinc-800 dark:ring-white/10 ${
        editing ? "" : "cursor-grab select-none active:cursor-grabbing"
      } ${isDragging ? "shadow-lg ring-blue-500/40" : ""}`}
    >
      {editing ? (
        <TextEditor
          value={card.title}
          label={`Edit card: ${card.title}`}
          maxLength={MAX_TITLE_LENGTH}
          multiline
          onDone={(title, endedBy) => {
            if (title !== null) store.updateCard(card.id, { title });
            if (endedBy === "keyboard") requestFocus();
            setEditing(false);
          }}
        />
      ) : (
        <>
          <p className="px-1 py-0.5 wrap-break-word">{card.title}</p>

          <div className="absolute top-1 right-1 flex gap-0.5 rounded-md bg-white opacity-0 shadow-sm ring-1 ring-black/5 group-hover/card:opacity-100 focus-within:opacity-100 dark:bg-zinc-800 dark:ring-white/10">
            <button
              ref={editButtonRef}
              type="button"
              aria-label={`Edit card: ${card.title}`}
              onClick={() => setEditing(true)}
              className={`${ACTION_CLASS} hover:text-zinc-900 dark:hover:text-zinc-100`}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              aria-label={`Delete card: ${card.title}`}
              onClick={() => store.deleteCard(card.id)}
              className={`${ACTION_CLASS} hover:text-red-600`}
            >
              <CloseIcon />
            </button>
          </div>
        </>
      )}
    </div>
  );
});
