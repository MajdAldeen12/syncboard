"use client";

import { CollisionPriority } from "@dnd-kit/abstract";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  MAX_TITLE_LENGTH,
  type BoardStore,
  type CardView,
  type ColumnView,
} from "@syncboard/core/board";
import { itemKey, type Activity } from "@syncboard/core/presence";
import { ActivityTag, activityOutline } from "@/features/presence/activity-tag";
import { AddItem } from "./add-item";
import { Card } from "./card";
import { GripIcon, TrashIcon } from "./icons";
import { InlineText } from "./inline-text";

interface ColumnProps {
  column: ColumnView;
  /** The cards to show. During a drag this can differ from `column.cards`. */
  cards: readonly CardView[];
  index: number;
  store: BoardStore;
  /** Who else is editing or moving each card and column, by `itemKey`. */
  activity: ReadonlyMap<string, readonly Activity[]>;
}

export function Column({ column, cards, index, store, activity }: ColumnProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: column.id,
    index,
    type: "column",
    // Accepting cards makes an empty column a valid place to drop one. Low
    // priority lets the cards inside win when the pointer is over both.
    accept: ["card", "column"],
    collisionPriority: CollisionPriority.Low,
  });

  // A title can be empty for a moment while someone else is retyping it.
  const name = column.title || "Untitled column";

  const others = activity.get(itemKey({ kind: "column", id: column.id }));
  const outline = activityOutline(others);

  function deleteColumn() {
    const count = cards.length;
    const warning =
      count === 1
        ? `Delete "${name}" and the card in it?`
        : `Delete "${name}" and the ${count} cards in it?`;
    if (count === 0 || window.confirm(warning)) store.deleteColumn(column.id);
  }

  return (
    <section
      ref={ref}
      data-column-id={column.id}
      aria-label={name}
      style={outline.style}
      className={`relative flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-zinc-100 dark:bg-zinc-900 ${
        isDragging ? "opacity-80 shadow-lg" : ""
      } ${outline.className}`}
    >
      <ActivityTag activity={others} item="column" />

      <header className="flex items-center gap-1 p-2 pb-0.5">
        <button
          ref={handleRef}
          type="button"
          data-drag-handle
          aria-label={`Reorder column ${name}`}
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-zinc-400 outline-offset-1 hover:bg-zinc-200 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-blue-600 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <GripIcon />
        </button>

        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          <InlineText
            open={() => store.editColumnTitle(column.id)}
            value={column.title}
            label={`Rename column ${name}`}
            maxLength={MAX_TITLE_LENGTH}
            item={{ kind: "column", id: column.id }}
          />
        </h2>

        <span className="px-1 text-xs tabular-nums text-zinc-500">
          <span className="sr-only">Cards: </span>
          {cards.length}
        </span>

        <button
          type="button"
          aria-label={`Delete column ${name}`}
          onClick={deleteColumn}
          className="flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 outline-offset-1 hover:bg-zinc-200 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-800"
        >
          <TrashIcon />
        </button>
      </header>

      {/*
        Cards are direct children of this container, with no wrapper element
        each: dnd-kit previews a reorder by re-inserting the card elements
        themselves among their siblings. The space at the top is where the
        "… is editing" tag of a card sticks out without being cut off.
      */}
      <div className="flex min-h-2 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-1.5 pb-1">
        {cards.map((card, cardIndex) => (
          <Card
            key={card.id}
            card={card}
            index={cardIndex}
            columnId={column.id}
            store={store}
            activity={activity.get(itemKey({ kind: "card", id: card.id }))}
          />
        ))}
      </div>

      <div className="p-2 pt-1">
        <AddItem
          label="Add a card"
          placeholder="Card title"
          maxLength={MAX_TITLE_LENGTH}
          onAdd={(title) => store.addCard(column.id, title) !== null}
        />
      </div>
    </section>
  );
}
