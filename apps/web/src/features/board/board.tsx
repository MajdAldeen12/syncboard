"use client";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider, useDragOperation } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  MAX_TITLE_LENGTH,
  type BoardStore,
  type BoardView,
  type CardView,
} from "@syncboard/core/board";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AddItem } from "./add-item";
import { Column } from "./column";

/** Which cards sit in which column, by id. */
type CardLayout = Record<string, string[]>;

function layoutOf(board: BoardView): CardLayout {
  const layout: CardLayout = {};
  for (const column of board.columns) {
    layout[column.id] = column.cards.map((card) => card.id);
  }
  return layout;
}

/** Calls `onIdle` once no drag is in progress, including its drop animation. */
function WhenDragIdle({ onIdle }: { onIdle: () => void }) {
  const idle = useDragOperation().source == null;

  useEffect(() => {
    if (idle) onIdle();
  }, [idle, onIdle]);

  return null;
}

export function Board({ store }: { store: BoardStore }) {
  const board = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  // While a card is being dragged, the arrangement on screen is a local
  // draft. The store is written once, when the card is dropped.
  const [dragLayout, setDragLayout] = useState<CardLayout | null>(null);

  // A cancelled drag has to put cards back where they were. Doing that while
  // dnd-kit is still animating the drop makes both rearrange the same
  // elements, and a card can end up hidden. So the draft is kept until
  // dnd-kit is idle, then discarded. `focus` is the element to focus after.
  const [cancelled, setCancelled] = useState<{ focus: string | null } | null>(
    null,
  );

  // Selector of an element to focus once the next render has been committed.
  const focusAfterRender = useRef<string | null>(null);
  useEffect(() => {
    const selector = focusAfterRender.current;
    if (selector === null) return;
    focusAfterRender.current = null;
    document.querySelector<HTMLElement>(selector)?.focus();
  });

  const cardsById = useMemo(() => {
    const map = new Map<string, CardView>();
    for (const column of board.columns) {
      for (const card of column.cards) map.set(card.id, card);
    }
    return map;
  }, [board]);

  return (
    <DragDropProvider
      onDragStart={() => {
        setCancelled(null);
        setDragLayout(layoutOf(store.getSnapshot()));
      }}
      onDragOver={(event) => {
        // Columns are reordered by dnd-kit itself until the drop.
        if (event.operation.source?.type === "column") return;
        setDragLayout((layout) => (layout ? move(layout, event) : layout));
      }}
      onDragEnd={(event) => {
        const { source, activatorEvent } = event.operation;
        const sortable = source && isSortable(source) ? source : null;
        const id = sortable ? String(sortable.id) : "";
        const isColumn = sortable?.type === "column";

        // A card that changes column is re-created in the new list, which
        // drops keyboard focus. Put it back so the next key press still
        // lands on the item that was just moved.
        let focus: string | null = null;
        if (sortable && activatorEvent instanceof KeyboardEvent) {
          const escaped = CSS.escape(id);
          focus = isColumn
            ? `[data-column-id="${escaped}"] [data-drag-handle]`
            : `[data-card-id="${escaped}"]`;
        }

        if (event.canceled) {
          setCancelled({ focus });
          return;
        }

        focusAfterRender.current = focus;
        setDragLayout(null);
        if (!sortable) return;

        if (isColumn) {
          store.moveColumn(id, sortable.index);
        } else if (sortable.group != null) {
          store.moveCard(id, String(sortable.group), sortable.index);
        }
      }}
    >
      {cancelled && (
        <WhenDragIdle
          onIdle={() => {
            focusAfterRender.current = cancelled.focus;
            setDragLayout(null);
            setCancelled(null);
          }}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <h1 className="shrink-0 px-4 pt-4 text-lg font-semibold tracking-tight">
          {board.title}
        </h1>

        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
          {board.columns.map((column, index) => {
            const draftIds = dragLayout?.[column.id];
            const cards = draftIds
              ? draftIds.flatMap((id) => cardsById.get(id) ?? [])
              : column.cards;

            return (
              <Column
                key={column.id}
                column={column}
                cards={cards}
                index={index}
                store={store}
              />
            );
          })}

          <div className="w-72 shrink-0">
            <AddItem
              label="Add a column"
              placeholder="Column title"
              maxLength={MAX_TITLE_LENGTH}
              onAdd={(title) => store.addColumn(title) !== null}
            />
          </div>
        </div>
      </div>
    </DragDropProvider>
  );
}
