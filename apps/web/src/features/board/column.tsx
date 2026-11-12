"use client";

import { CollisionPriority } from "@dnd-kit/abstract";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  MAX_TITLE_LENGTH,
  type BoardStore,
  type CardView,
  type ColumnView,
} from "@syncboard/core/board";
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
}

export function Column({ column, cards, index, store }: ColumnProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: column.id,
    index,
    type: "column",
    // Accepting cards makes an empty column a valid place to drop one. Low
    // priority lets the cards inside win when the pointer is over both.
    accept: ["card", "column"],
    collisionPriority: CollisionPriority.Low,
  });

  function deleteColumn() {
    const count = cards.length;
    const warning =
      count === 1
        ? `Delete "${column.title}" and the card in it?`
        : `Delete "${column.title}" and the ${count} cards in it?`;
    if (count === 0 || window.confirm(warning)) store.deleteColumn(column.id);
  }

  return (
    <section
      ref={ref}
      data-column-id={column.id}
      aria-label={column.title}
      className={`flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-zinc-100 dark:bg-zinc-900 ${
        isDragging ? "opacity-80 shadow-lg" : ""
      }`}
    >
      <header className="flex items-center gap-1 p-2">
        <button
          ref={handleRef}
          type="button"
          data-drag-handle
          aria-label={`Reorder column ${column.title}`}
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-zinc-400 outline-offset-1 hover:bg-zinc-200 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-blue-600 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <GripIcon />
        </button>

        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          <InlineText
            value={column.title}
            label={`Rename column ${column.title}`}
            maxLength={MAX_TITLE_LENGTH}
            onCommit={(title) => store.renameColumn(column.id, title)}
          />
        </h2>

        <span className="px-1 text-xs tabular-nums text-zinc-500">
          <span className="sr-only">Cards: </span>
          {cards.length}
        </span>

        <button
          type="button"
          aria-label={`Delete column ${column.title}`}
          onClick={deleteColumn}
          className="flex size-7 shrink-0 items-center justify-center rounded text-zinc-400 outline-offset-1 hover:bg-zinc-200 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-800"
        >
          <TrashIcon />
        </button>
      </header>

      {/*
        Cards are direct children of this container, with no wrapper element
        each: dnd-kit previews a reorder by re-inserting the card elements
        themselves among their siblings.
      */}
      <div className="flex min-h-2 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1">
        {cards.map((card, cardIndex) => (
          <Card
            key={card.id}
            card={card}
            index={cardIndex}
            columnId={column.id}
            store={store}
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
