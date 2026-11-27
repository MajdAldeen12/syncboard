"use client";

import { Accessibility, defaultPreset } from "@dnd-kit/dom";
import {
  useDragDropManager,
  useDragDropMonitor,
  type DragDropManager,
} from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import type { BoardStore } from "@syncboard/core/board";
import { useEffect, useRef, useState } from "react";

/*
 * What a screen reader hears while a card or column is moved.
 *
 * dnd-kit's own Accessibility plugin reads out internal ids ("Draggable item
 * seed-column-1-card-1 was moved over droppable target ...") and marks every
 * card with the deprecated aria-grabbed. It is switched off, and this file
 * does its job with the board's own words: the card's title, the column's
 * title, and the position as a person counts it.
 */

/**
 * dnd-kit's default plugins without its Accessibility plugin. Worked out
 * once: `DragDropProvider` compares the list it is given by identity on
 * every render, and hands a new one to every draggable on the board.
 */
export const BOARD_PLUGINS = defaultPreset.plugins.filter(
  (plugin) => plugin !== Accessibility,
);

/** Ids of the instructions that cards and column handles point to. */
export const CARD_HELP_ID = "card-drag-help";
export const COLUMN_HELP_ID = "column-drag-help";

const MOVE_HELP =
  "Press Space to pick it up, the arrow keys to move it, and Space again to drop it. Escape puts it back.";

/** The instructions, out of sight; `aria-describedby` reads hidden text. */
export function DragHelp() {
  return (
    <>
      <p id={CARD_HELP_ID} hidden>
        Press Enter to open it. {MOVE_HELP} Tab reaches its Open, Edit and
        Delete buttons.
      </p>
      <p id={COLUMN_HELP_ID} hidden>
        {MOVE_HELP}
      </p>
    </>
  );
}

type Manager = DragDropManager;
type Source = NonNullable<Manager["dragOperation"]["source"]>;

/** Where a held item is: its column (for a card), and its place in the list. */
interface Place {
  readonly group: string | null;
  readonly index: number;
  readonly count: number;
}

function samePlace(a: Place | null, b: Place | null): boolean {
  return (
    a !== null &&
    b !== null &&
    a.group === b.group &&
    a.index === b.index &&
    a.count === b.count
  );
}

function groupOf(value: unknown): string | null {
  return value == null ? null : String(value);
}

/** How many items of the source's kind are in `group` right now. */
function countIn(manager: Manager, source: Source, group: string | null) {
  let count = 0;
  for (const draggable of manager.registry.draggables) {
    if (
      isSortable(draggable) &&
      draggable.type === source.type &&
      groupOf(draggable.group) === group
    ) {
      count += 1;
    }
  }
  return count;
}

/** Where the held item is drawn now. */
function placeNow(manager: Manager, source: Source): Place | null {
  if (!isSortable(source)) return null;
  const group = groupOf(source.group);
  return { group, index: source.index, count: countIn(manager, source, group) };
}

function words(store: BoardStore) {
  const board = () => store.getSnapshot();
  const columnTitle = (id: string | null) =>
    board().columns.find((column) => column.id === id)?.title ||
    "Untitled column";
  const cardTitle = (id: string) => {
    for (const column of board().columns) {
      const card = column.cards.find((each) => each.id === id);
      if (card) return card.title || "Untitled card";
    }
    return "Untitled card";
  };

  const where = (isColumn: boolean, place: Place) => {
    const position = `position ${place.index + 1} of ${place.count}`;
    return isColumn
      ? `Position ${place.index + 1} of ${place.count}.`
      : `Column ${columnTitle(place.group)}, ${position}.`;
  };

  return {
    pickedUp(source: Source, place: Place) {
      const isColumn = source.type === "column";
      const name = isColumn
        ? `column: ${columnTitle(String(source.id))}`
        : `card: ${cardTitle(String(source.id))}`;
      return `Picked up ${name}. ${where(isColumn, place)}`;
    },
    moved(source: Source, place: Place) {
      return where(source.type === "column", place);
    },
    dropped(source: Source, place: Place) {
      const isColumn = source.type === "column";
      const name = isColumn
        ? `column: ${columnTitle(String(source.id))}`
        : `card: ${cardTitle(String(source.id))}`;
      return `Dropped ${name}. ${where(isColumn, place)}`;
    },
    cancelled(source: Source, place: Place) {
      if (source.type === "column") {
        return `Move cancelled. Column ${columnTitle(String(source.id))} is back at position ${place.index + 1} of ${place.count}.`;
      }
      return `Move cancelled. ${cardTitle(String(source.id))} is back in column ${columnTitle(place.group)}, position ${place.index + 1} of ${place.count}.`;
    },
  };
}

/**
 * How long a held item must rest before its new place is read out. Keyboard
 * moves rest at once; a mouse sweeping across the board is not narrated
 * card by card.
 */
const SETTLE_MS = 150;

/**
 * A polite live region that says what happens to a held card or column.
 * Must be inside the `DragDropProvider`.
 */
export function DragAnnouncer({ store }: { store: BoardStore }) {
  const manager = useDragDropManager();
  const [message, setMessage] = useState("");
  const said = useRef<Place | null>(null);
  // Where the held item came from. Not dnd-kit's `initialGroup`: a card
  // carried into another column is drawn afresh there, and the new
  // sortable starts from where it was re-created.
  const start = useRef<Place | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useDragDropMonitor({
    onDragStart(event, current) {
      const source = event.operation.source;
      if (!source) return;
      const place = placeNow(current, source);
      said.current = place;
      start.current = place;
      if (place) setMessage(words(store).pickedUp(source, place));
    },
    onDragOver() {
      // The new place is known only once dnd-kit and React have both
      // re-ordered the list, so it is read after the move has settled.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const source = manager?.dragOperation.source;
        if (!manager || !source || !manager.dragOperation.status.dragging)
          return;
        const place = placeNow(manager, source);
        if (!place || samePlace(place, said.current)) return;
        said.current = place;
        setMessage(words(store).moved(source, place));
      }, SETTLE_MS);
    },
    onDragEnd(event, current) {
      clearTimeout(timer.current);
      said.current = null;
      const source = event.operation.source;
      if (!source) return;
      const place = event.canceled ? start.current : placeNow(current, source);
      start.current = null;
      if (!place) return;
      setMessage(
        event.canceled
          ? words(store).cancelled(source, place)
          : words(store).dropped(source, place),
      );
    },
  });

  return (
    <p data-drag-announcer role="status" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
