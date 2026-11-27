"use client";

import { move } from "@dnd-kit/helpers";
import { defaultPreset } from "@dnd-kit/dom";
import {
  DragDropProvider,
  KeyboardSensor,
  useDragOperation,
} from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  MAX_TITLE_LENGTH,
  type BoardStore,
  type BoardView,
  type CardView,
} from "@syncboard/core/board";
import { rebaseIndex } from "@syncboard/core/ordering";
import type { ItemRef, PresenceStore } from "@syncboard/core/presence";
import { AnimatePresence, MotionConfig } from "motion/react";
import {
  useCallback,
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
import { AppHeader } from "./app-header";
import { CardDialog } from "./card-dialog";
import { Column, type DeleteRequest } from "./column";
import { ConfirmDialog } from "./confirm-dialog";
import { DragAnnouncer, DragHelp, BOARD_PLUGINS } from "./drag-announcer";
import { focusTargetAfterCard, focusTargetAfterColumn } from "./focus";
import { COLUMN_WIDTH } from "./layout";
import { LayoutAnimator } from "./layout-animator";
import { UndoToast } from "./undo-toast";

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

/** A card on the board and the name of the column it is shown in. */
function findCard(
  board: BoardView,
  cardId: string,
): { card: CardView; columnName: string } | null {
  for (const column of board.columns) {
    const card = column.cards.find((candidate) => candidate.id === cardId);
    if (card) return { card, columnName: column.title || "Untitled column" };
  }
  return null;
}

/**
 * dnd-kit's default sensors, with the keyboard picking an item up on Space
 * only. Enter on a card opens it instead; while an item is held, Enter
 * drops it like Space.
 *
 * A constant, not a function of the defaults: `DragDropProvider` runs such
 * a function on every render and compares what it returns by identity, so a
 * fresh list would be handed to every card on the board each time anything
 * changed.
 */
const BOARD_SENSORS = defaultPreset.sensors.map((sensor) =>
  sensor === KeyboardSensor
    ? KeyboardSensor.configure({
        keyboardCodes: {
          start: ["Space"],
          cancel: ["Escape"],
          end: ["Space", "Enter", "Tab"],
          up: ["ArrowUp"],
          down: ["ArrowDown"],
          left: ["ArrowLeft"],
          right: ["ArrowRight"],
        },
      })
    : sensor,
);

/** A card this person deleted, which they can still put back. */
interface DeletedCard {
  readonly key: number;
  readonly cardId: string;
  readonly title: string;
  readonly restore: () => void;
}

/** Whether a key press is meant for a text field rather than the board. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
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
  /** Shown at the end of the header bar, for instance the sync status. */
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

  // A card opened on its own, and a column waiting for "really delete?".
  // Each is shown in a dialog over the board. When it closes, focus goes
  // back to where the person was: `returnFocus` is that element.
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeleteRequest | null>(null);
  const returnFocus = useRef<string | HTMLElement | null>(null);
  const openCard = useCallback((cardId: string) => {
    returnFocus.current = `[data-card-id="${CSS.escape(cardId)}"]`;
    setOpenCardId(cardId);
  }, []);
  const confirmDelete = useCallback((request: DeleteRequest) => {
    returnFocus.current = `[data-column-id="${CSS.escape(request.columnId)}"] [data-delete-column]`;
    setDeleting(request);
  }, []);
  // A card deleted by this person, offered back for a few seconds. Deleting
  // another replaces the offer.
  const [deleted, setDeleted] = useState<DeletedCard | null>(null);
  const deletions = useRef(0);
  const deleteCard = useCallback(
    (cardId: string) => {
      const title = findCard(store.getSnapshot(), cardId)?.card.title;
      const restore = store.deleteCard(cardId);
      if (!restore) return;
      deletions.current += 1;
      setDeleted({
        key: deletions.current,
        cardId,
        title: title || "Untitled card",
        restore,
      });
    },
    [store],
  );
  const undoDelete = useCallback(() => {
    if (!deleted) return;
    deleted.restore();
    setDeleted(null);
    focusAfterRender.current = `[data-card-id="${CSS.escape(deleted.cardId)}"]`;
  }, [deleted]);

  // Ctrl+Z (Cmd+Z) takes the deletion back while it is offered, unless a
  // text field has focus: there it undoes typing, as it always does.
  useEffect(() => {
    if (!deleted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "z" &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        undoDelete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleted, undoDelete]);

  // The open card as it is now. Gone if someone else deleted it, which
  // closes the dialog.
  const opened = openCardId ? findCard(live, openCardId) : null;

  const cardsById = useMemo(() => {
    const map = new Map<string, CardView>();
    for (const column of board.columns) {
      for (const card of column.cards) map.set(card.id, card);
    }
    return map;
  }, [board]);

  return (
    <DragDropProvider
      plugins={BOARD_PLUGINS}
      sensors={BOARD_SENSORS}
      onBeforeDragStart={() => {
        // dnd-kit measures what it picks up. Nothing may be mid-slide then.
        animator.current?.finish();
        // A focused text field elsewhere on the board (the add-a-column form
        // left open, say) makes the browser scroll back to it as the drag
        // starts, and the item lands far from where it was dropped. Leaving
        // the field keeps what was typed in it.
        const focused = document.activeElement;
        if (
          focused instanceof HTMLInputElement ||
          focused instanceof HTMLTextAreaElement
        ) {
          focused.blur();
        }
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
      <DragAnnouncer store={store} />
      <DragHelp />

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
          <AppHeader title={board.title || "Untitled board"} end={headerEnd} />

          {/* Positioned, so that the pointers can be laid over the board. */}
          <main className="relative flex min-h-0 flex-1 flex-col">
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
                      onOpenCard={openCard}
                      onDeleteCard={deleteCard}
                      onConfirmDelete={confirmDelete}
                    />
                  );
                })}
              </LayoutAnimator>

              <div data-add-column className={`${COLUMN_WIDTH} shrink-0`}>
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

            {/* Above the board's bottom edge, clear of its scroll bar. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4">
              <AnimatePresence>
                {deleted && (
                  <UndoToast
                    key={deleted.key}
                    message="Card deleted"
                    subject={deleted.title}
                    onUndo={undoDelete}
                    onDismiss={() => setDeleted(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          </main>

          <AnimatePresence
            onExitComplete={() => {
              const wanted = returnFocus.current;
              returnFocus.current = null;
              // A column that was just deleted cannot take focus back; the
              // board's first column handle, or "Add a column", does.
              const target =
                (typeof wanted === "string"
                  ? document.querySelector<HTMLElement>(wanted)
                  : wanted?.isConnected
                    ? wanted
                    : null) ||
                scroller.current?.querySelector<HTMLElement>(
                  "[data-drag-handle], button",
                );
              target?.focus();
            }}
          >
            {opened && (
              <CardDialog
                key={`card:${opened.card.id}`}
                store={store}
                card={opened.card}
                columnName={opened.columnName}
                onDelete={() => {
                  // Focus goes to the card's neighbour once the dialog has
                  // closed: the card it came from is gone.
                  const element = document.querySelector<HTMLElement>(
                    `[data-card-id="${CSS.escape(opened.card.id)}"]`,
                  );
                  returnFocus.current = element
                    ? focusTargetAfterCard(element)
                    : null;
                  deleteCard(opened.card.id);
                  setOpenCardId(null);
                }}
                onDismiss={() => setOpenCardId(null)}
              />
            )}
            {deleting && (
              <ConfirmDialog
                key={`delete:${deleting.columnId}`}
                title={`Delete "${deleting.name}"?`}
                message={
                  deleting.cardCount === 1
                    ? "The column and the card in it will be deleted for everyone on this board."
                    : `The column and the ${deleting.cardCount} cards in it will be deleted for everyone on this board.`
                }
                confirmLabel="Delete column"
                onConfirm={() => {
                  // The column's delete button goes with it. Focus goes to
                  // the column that takes its place.
                  returnFocus.current = focusTargetAfterColumn(
                    deleting.columnId,
                  );
                  store.deleteColumn(deleting.columnId);
                  setDeleting(null);
                }}
                onDismiss={() => setDeleting(null)}
              />
            )}
          </AnimatePresence>
        </PresenceProvider>
      </MotionConfig>
    </DragDropProvider>
  );
}
