"use client";

import {
  locateCursor,
  type Box,
  type CursorPosition,
  type Point,
  type PresenceStore,
} from "@syncboard/core/presence";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { usePresence } from "./presence-context";

// Positions arrive about 15 times a second. The spring carries the pointer
// from one to the next in roughly 150 ms without overshooting, so it glides
// instead of hopping.
const SPRING = { stiffness: 700, damping: 55, mass: 1 };

/** Puts a pointer where it belongs. `immediate` skips the glide. */
type Place = (immediate: boolean) => void;

/**
 * Where a card or column is in the window. A card that has been scrolled
 * out of its column is reported at the column's edge, so the pointer does
 * not wander over the next column's header.
 */
function findBox(
  board: HTMLElement,
  over: "card" | "column",
  id: string,
): Box | null {
  const selector =
    over === "card"
      ? `[data-card-id="${CSS.escape(id)}"]:not([data-dnd-placeholder]):not([aria-hidden="true"])`
      : `[data-column-id="${CSS.escape(id)}"]`;
  const element = board.querySelector(selector);
  if (!element) return null;

  const box = element.getBoundingClientRect();
  const column = over === "card" ? element.closest("[data-column-id]") : null;
  if (!column) {
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    };
  }

  const within = column.getBoundingClientRect();
  const top = Math.min(Math.max(box.top, within.top), within.bottom);
  const bottom = Math.min(Math.max(box.bottom, within.top), within.bottom);
  return { left: box.left, top, width: box.width, height: bottom - top };
}

interface RemoteCursorProps {
  name: string;
  color: string;
  cursor: CursorPosition;
  /** Where a cursor belongs inside the overlay, or null if nowhere. */
  locate: (cursor: CursorPosition) => Point | null;
  /** Lets the overlay move this pointer when the board scrolls. */
  register: (place: Place) => () => void;
  /** Changes whenever the board is drawn differently. */
  layout: unknown;
}

const RemoteCursor = memo(function RemoteCursor({
  name,
  color,
  cursor,
  locate,
  register,
  layout,
}: RemoteCursorProps) {
  const still = useReducedMotion();
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const opacity = useMotionValue(0);
  const latest = useRef(cursor);
  const placed = useRef(false);

  const place = useCallback<Place>(
    (immediate) => {
      const point = locate(latest.current);
      if (point === null) {
        // What it points at is not on this screen right now.
        opacity.set(0);
        placed.current = false;
        return;
      }

      if (immediate || still || !placed.current) {
        x.jump(point.x);
        y.jump(point.y);
      } else {
        x.set(point.x);
        y.set(point.y);
      }
      placed.current = true;
      opacity.set(1);
    },
    [locate, opacity, still, x, y],
  );

  useLayoutEffect(() => {
    latest.current = cursor;
    place(false);
  }, [cursor, layout, place]);

  useEffect(() => register(place), [register, place]);

  return (
    <motion.div
      data-presence-cursor
      data-user-name={name}
      style={{ x, y, opacity }}
      className="absolute top-0 left-0"
    >
      {/* The tip of the arrow is the top-left corner of this element. */}
      <svg
        width="12"
        height="16"
        viewBox="0 0 12 16"
        className="block overflow-visible drop-shadow-sm"
      >
        <path
          d="M0 0v12.6l3.5-3.3 2.4 5.6 2.2-.95-2.4-5.5h4.9Z"
          fill={color}
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{ backgroundColor: color }}
        className="absolute top-4 left-3 max-w-40 truncate rounded px-1.5 text-[11px]/4 font-medium whitespace-nowrap text-white shadow-sm"
      >
        {name}
      </span>
    </motion.div>
  );
});

interface CursorOverlayProps {
  presence: PresenceStore;
  /** The element the columns scroll in. */
  scrollerRef: RefObject<HTMLElement | null>;
  /** Anything that changes when the board is drawn differently. */
  layout: unknown;
}

/**
 * Other people's pointers, drawn over the board. Must be inside a positioned
 * element that covers the board; it fills that element and clips to it.
 *
 * A pointer is tied to the card or column it is over (see `CursorPosition`
 * in packages/core), so it is found again here wherever that card is on this
 * screen, and it follows the card when this window scrolls.
 */
export function CursorOverlay({
  presence,
  scrollerRef,
  layout,
}: CursorOverlayProps) {
  const others = usePresence(presence, (view) => view.others);
  const overlay = useRef<HTMLDivElement>(null);
  const places = useRef(new Set<Place>());

  const locate = useCallback(
    (cursor: CursorPosition): Point | null => {
      const board = scrollerRef.current;
      const layer = overlay.current;
      if (!board || !layer) return null;

      const area = board.getBoundingClientRect();
      const point = locateCursor(
        cursor,
        (over, id) => findBox(board, over, id),
        { x: area.left - board.scrollLeft, y: area.top - board.scrollTop },
      );
      if (point === null) return null;

      const origin = layer.getBoundingClientRect();
      return { x: point.x - origin.left, y: point.y - origin.top };
    },
    [scrollerRef],
  );

  const register = useCallback((place: Place) => {
    places.current.add(place);
    return () => {
      places.current.delete(place);
    };
  }, []);

  // Scrolling or resizing this window moves what the pointers are over. No
  // message arrives for that, and the pointers must not lag behind the
  // board, so they are put in place at once.
  useEffect(() => {
    const board = scrollerRef.current;
    if (!board) return;

    const replaceAll = () => {
      for (const place of places.current) place(true);
    };
    const scrolls = { capture: true, passive: true } as const;
    board.addEventListener("scroll", replaceAll, scrolls);
    const resized = new ResizeObserver(replaceAll);
    resized.observe(board);

    return () => {
      board.removeEventListener("scroll", replaceAll, scrolls);
      resized.disconnect();
    };
  }, [scrollerRef]);

  return (
    // Hidden from assistive technology: the avatars and the tags on cards
    // say who is here and what they are doing.
    <div
      ref={overlay}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      {others.map(
        (other) =>
          other.cursor && (
            <RemoteCursor
              key={other.clientId}
              name={other.user.name}
              color={other.user.color}
              cursor={other.cursor}
              locate={locate}
              register={register}
              layout={layout}
            />
          ),
      )}
    </div>
  );
}
