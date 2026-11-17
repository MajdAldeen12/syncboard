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
import { rebaseIndex } from "@syncboard/core/ordering";
import type { ItemRef, PresenceStore } from "@syncboard/core/presence";
import { MotionConfig } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CursorOverlay } from "@/features/presence/cursor-overlay";
import {
  PresenceProvider,
  usePresence,
} from "@/features/presence/presence-context";
import { usePublishCursor } from "@/features/presence/use-publish-cursor";
import { AddItem } from "./add-item";
import { Column } from "./column";
import { LayoutAnimator } from "./layout-animator";

/** Which cards sit in which column, by id. */
type CardLayout = Record<string, string[]>;

/** What is on screen while something is being dragged. */
interface DragView {
  /** The board as it was when the drag started. */
  readonly board: BoardView;
  /** Where the cards are now, with the dragged card where it is held. */
  readonly layout: CardLayout;
}

function layoutOf(board: BoardView): CardLayout {
  const layout: CardLayout = {};
  for (const column of board.columns) {
    layout[column.id] = column.cards.map((card) => card.id);
  }
  return layout;
}

/** `ids` with `id` taken out and put back at `index`. */
function placedAt(ids: readonly string[], id: string, index: number): string[] {
  const placed = ids.filter((other) => other !== id);
  placed.splice(index, 0, id);
  return placed;
}

/** Calls `onIdle` once no drag is in progress, including its drop animation. */
function WhenDragIdle({ onIdle }: { onIdle: () => void }) {
  const idle = useDragOperation().source == null;

  useEffect(() => {
    if (idle) onIdle();
  }, [idle, onIdle]);

  return null;
}

interface BoardProps {
  store: BoardStore;
  /** Who else is on the board, and what this tab tells them. */
  presence: PresenceStore;
  /** Shown at the end of the title row, for instance the sync status. */
  headerEnd?: ReactNode;
}

export function Board({ store, presence, headerEnd }: BoardProps) {
  const live = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  // While something is dragged, the screen shows the board as it was when
  // the drag started, plus a local draft of where the dragged card is held.
  // Changes other people make meanwhile are in the store but are not drawn:
  // dnd-kit is moving the same elements, and redrawing the lists under it
  // can leave a card hidden. The store is written once, on drop.
  const [drag, setDrag] = useState<DragView | null>(null);

  // After a drop or a cancel, dnd-kit still animates the item into place.
  // The drag view stays until that is over, then the live board is shown
  // again. `focus` is the element to focus at that point.
  const [settling, setSettling] = useState<{ focus: string | null } | null>(
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

  const board = drag?.board ?? live;

  // Presence. Other people's pointers are drawn over the board, this tab's
  // own pointer is reported to them, and cards and columns are told who
  // else has them open or in hand.
  const scroller = useRef<HTMLDivElement>(null);
  const holding = useRef<ItemRef | null>(null);
  usePublishCursor(presence, scroller, holding);
  const activity = usePresence(presence, (view) => view.activity);

  const animator = useRef<LayoutAnimator>(null);

  const cardsById = useMemo(() => {
    const map = new Map<string, CardView>();
    for (const column of board.columns) {
      for (const card of column.cards) map.set(card.id, card);
    }
    return map;
  }, [board]);

  return (
    <DragDropProvider
      onBeforeDragStart={() => {
        // dnd-kit measures what it picks up. Nothing may be mid-slide then.
        animator.current?.finish();
      }}
      onDragStart={(event) => {
        const source = event.operation.source;
        if (source) {
          const item: ItemRef = {
            kind: source.type === "column" ? "column" : "card",
            id: String(source.id),
          };
          holding.current = item;
          presence.startDragging(item);
        }

        const snapshot = store.getSnapshot();
        setSettling(null);
        setDrag({ board: snapshot, layout: layoutOf(snapshot) });
      }}
      onDragOver={(event) => {
        // Columns are reordered by dnd-kit itself until the drop.
        if (event.operation.source?.type === "column") return;
        setDrag(
          (current) =>
            current && { ...current, layout: move(current.layout, event) },
        );
      }}
      onDragEnd={(event) => {
        holding.current = null;
        presence.stopDragging();

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

        // Either way the drag view stays until dnd-kit is idle. Showing the
        // live board here would re-parent cards while dnd-kit is still
        // cleaning up, and a card can end up hidden.
        setSettling({ focus });
        if (event.canceled || !sortable || !drag) return;

        // The drop index counts positions on the board as it was drawn. The
        // board may have changed since, so the position is carried over by
        // its neighbours: the item goes next to the same items it was
        // dropped next to. With no changes that is the same index.
        const now = store.getSnapshot();
        if (isColumn) {
          const drawn = drag.board.columns.map((column) => column.id);
          const current = now.columns.map((column) => column.id);
          store.moveColumn(
            id,
            rebaseIndex(placedAt(drawn, id, sortable.index), current, id),
          );
        } else if (sortable.group != null) {
          const group = String(sortable.group);
          const drawn =
            drag.board.columns
              .find((column) => column.id === group)
              ?.cards.map((card) => card.id) ?? [];
          const current =
            now.columns
              .find((column) => column.id === group)
              ?.cards.map((card) => card.id) ?? [];
          store.moveCard(
            id,
            group,
            rebaseIndex(placedAt(drawn, id, sortable.index), current, id),
          );
        }
      }}
    >
      {settling && (
        <WhenDragIdle
          onIdle={() => {
            focusAfterRender.current = settling.focus;
            setDrag(null);
            setSettling(null);
          }}
        />
      )}

      {/*
        With reduced motion asked for, Motion components inside drop their
        movement (transforms and layout) and keep fades. Code that calls
        `animate()` itself has to check on its own.
      */}
      <MotionConfig reducedMotion="user">
        <PresenceProvider value={presence}>
          {/* Positioned, so that the pointers can be laid over the board. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 px-4 pt-4">
              <h1 className="text-lg font-semibold tracking-tight">
                {board.title}
              </h1>
              {headerEnd}
            </div>

            <div
              ref={scroller}
              data-board-scroll
              className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4"
            >
              <LayoutAnimator
                ref={animator}
                scrollerRef={scroller}
                // Off while dnd-kit moves things. The render that ends a drag
                // is animated: changes others made during it slide into place.
                enabled={!drag && !settling}
              >
                {board.columns.map((column, index) => {
                  const draftIds = drag?.layout[column.id];
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
                      activity={activity}
                    />
                  );
                })}
              </LayoutAnimator>

              <div className="w-72 shrink-0">
                <AddItem
                  label="Add a column"
                  placeholder="Column title"
                  maxLength={MAX_TITLE_LENGTH}
                  onAdd={(title) => store.addColumn(title) !== null}
                />
              </div>
            </div>

            <CursorOverlay
              presence={presence}
              scrollerRef={scroller}
              layout={drag?.layout ?? board}
            />
          </div>
        </PresenceProvider>
      </MotionConfig>
    </DragDropProvider>
  );
}
