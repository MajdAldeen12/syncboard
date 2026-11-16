"use client";

import {
  describeCursor,
  type Box,
  type CursorTarget,
  type ItemRef,
  type Point,
  type PresenceStore,
} from "@syncboard/core/presence";
import { useEffect, type RefObject } from "react";

function boxOf(element: Element): Box {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

/**
 * The card or column under a point, or null for the bare board. This is
 * what the pointer is tied to on other people's screens, so it has to be
 * something they have too.
 */
function targetAt(
  board: HTMLElement,
  point: Point,
  holding: ItemRef | null,
): CursorTarget | null {
  // While a column is held, every column under the pointer is on the move.
  if (holding?.kind === "column") return null;

  for (const element of document.elementsFromPoint(point.x, point.y)) {
    if (!board.contains(element)) continue;
    // The item in hand is under the pointer wherever it goes, and dnd-kit
    // leaves a stand-in where it came from. Look at what is beneath.
    if (element.closest("[data-dnd-dragging], [data-dnd-placeholder]")) {
      continue;
    }

    // While a card is held, the cards around it make room on this screen
    // only. The column is what both screens agree on.
    const card = holding ? null : element.closest("[data-card-id]");
    const cardId = card?.getAttribute("data-card-id");
    if (card && cardId) return { over: "card", id: cardId, box: boxOf(card) };

    const column = element.closest("[data-column-id]");
    const columnId = column?.getAttribute("data-column-id");
    if (column && columnId) {
      return { over: "column", id: columnId, box: boxOf(column) };
    }
  }
  return null;
}

/**
 * Tells the others where this tab's pointer is while it is over the board.
 *
 * `scroller` is the element the columns scroll in. `holding` says what is
 * being dragged, if anything. How often a position is actually sent is the
 * store's business; this reports every move.
 */
export function usePublishCursor(
  presence: PresenceStore,
  scroller: RefObject<HTMLElement | null>,
  holding: RefObject<ItemRef | null>,
): void {
  useEffect(() => {
    const board = scroller.current;
    if (!board) return;

    /** Where the pointer was last seen, in the window. */
    let last: Point | null = null;

    const report = () => {
      if (last === null) {
        presence.setCursor(null);
        return;
      }

      const area = board.getBoundingClientRect();
      const inside =
        last.x >= area.left &&
        last.x <= area.right &&
        last.y >= area.top &&
        last.y <= area.bottom;
      if (!inside) {
        presence.setCursor(null);
        return;
      }

      presence.setCursor(
        describeCursor(last, targetAt(board, last, holding.current), {
          // The corner of the board's content, which scrolls out of view.
          x: area.left - board.scrollLeft,
          y: area.top - board.scrollTop,
        }),
      );
    };

    const onMove = (event: PointerEvent) => {
      // A finger is not a pointer that stays anywhere.
      if (event.pointerType === "touch") return;
      last = { x: event.clientX, y: event.clientY };
      report();
    };
    const onGone = () => {
      last = null;
      report();
    };
    const onHidden = () => {
      if (document.hidden) onGone();
    };

    // On the window and in the capture phase, so that moves still arrive
    // while dnd-kit is handling a drag.
    const moves = { capture: true, passive: true } as const;
    window.addEventListener("pointermove", onMove, moves);
    document.documentElement.addEventListener("pointerleave", onGone);
    document.addEventListener("visibilitychange", onHidden);
    // The pointer has not moved, but what is under it has. Scroll events of
    // the columns do not bubble, hence the capture phase.
    board.addEventListener("scroll", report, moves);

    return () => {
      window.removeEventListener("pointermove", onMove, moves);
      document.documentElement.removeEventListener("pointerleave", onGone);
      document.removeEventListener("visibilitychange", onHidden);
      board.removeEventListener("scroll", report, moves);
      presence.setCursor(null);
    };
  }, [presence, scroller, holding]);
}
