"use client";

import {
  locateCursor,
  pinToBox,
  type Box,
  type CursorPosition,
  type Point,
  type PresenceStore,
  type Side,
} from "@syncboard/core/presence";
import {
  AnimatePresence,
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
  useState,
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

/** How far inside the visible board a pointer out of sight is kept. */
const EDGE_INSET = { x: 4, y: 12 };

/**
 * Where the pointer's body sits against the point it is placed at. An
 * ordinary pointer hangs from its tip; a marker at an edge lies along it,
 * on the inside.
 */
const MARKER_PLACEMENT: Record<Side, string> = {
  left: "-translate-y-1/2 origin-left",
  right: "-translate-x-full -translate-y-1/2 origin-right",
  top: "-translate-x-1/2 origin-top",
  bottom: "-translate-x-1/2 -translate-y-full origin-bottom",
};

/** A chevron pointing towards `side`. */
function Chevron({ side }: { side: Side }) {
  const turn = { right: 0, bottom: 90, left: 180, top: 270 }[side];
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      className="shrink-0"
      style={{ transform: `rotate(${turn}deg)` }}
    >
      <path
        d="M2.5 1 5.5 4 2.5 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface RemoteCursorProps {
  name: string;
  color: string;
  cursor: CursorPosition;
  /** Where a cursor belongs inside the overlay, or null if nowhere. */
  locate: (cursor: CursorPosition) => Point | null;
  /** The part of the board in sight, inside the overlay, or null if none. */
  visibleArea: () => Box | null;
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
  visibleArea,
  register,
  layout,
}: RemoteCursorProps) {
  const still = useReducedMotion();
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const opacity = useMotionValue(0);
  const latest = useRef(cursor);
  const placed = useRef(false);
  // The edge it is kept at while what it points at is out of sight here.
  const [side, setSide] = useState<Side | null>(null);

  const place = useCallback<Place>(
    (immediate) => {
      const found = locate(latest.current);
      const area = visibleArea();
      if (found === null || area === null) {
        // What it points at is not on this screen right now.
        opacity.set(0);
        placed.current = false;
        return;
      }

      // Scrolled out of sight here, it is shown at the nearest edge of the
      // board, so that nobody is lost from view.
      const inside = {
        left: area.left + EDGE_INSET.x,
        top: area.top + EDGE_INSET.y,
        width: Math.max(0, area.width - 2 * EDGE_INSET.x),
        height: Math.max(0, area.height - 2 * EDGE_INSET.y),
      };
      const pinned = pinToBox(found, area);
      const point =
        pinned.side === null ? found : pinToBox(found, inside).point;
      setSide(pinned.side);

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
    [locate, visibleArea, opacity, still, x, y],
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
      data-presence-offscreen={side ?? undefined}
      style={{ x, y, opacity }}
      // Seen, although the layer it is on is not (see CursorOverlay).
      className="visible absolute top-0 left-0"
    >
      {/*
        Where the pointer is lives on the outer element, in motion values.
        How it appears and leaves lives on this inner one, so that the two
        never animate the same element.
      */}
      <motion.div
        data-presence-cursor-body
        className={`relative ${side ? MARKER_PLACEMENT[side] : "origin-top-left"}`}
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {side ? (
          <span
            style={{ backgroundColor: color }}
            className={`flex max-w-40 items-center gap-1 rounded-full px-2 text-[11px]/5 font-medium whitespace-nowrap text-white shadow-md ring-1 ring-white/70 ${
              side === "right" ? "flex-row-reverse" : ""
            }`}
          >
            <Chevron side={side} />
            <span className="truncate">{name}</span>
          </span>
        ) : (
          <>
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
          </>
        )}
      </motion.div>
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

  const visibleArea = useCallback((): Box | null => {
    const board = scrollerRef.current;
    const layer = overlay.current;
    if (!board || !layer) return null;
    const area = board.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    return {
      left: area.left - origin.left,
      top: area.top - origin.top,
      // Without the scroll bars.
      width: board.clientWidth,
      height: board.clientHeight,
    };
  }, [scrollerRef]);

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
    //
    // The layer covers the whole board, to clip pointers to it, but is itself
    // invisible; only the pointers on it are seen. A visible layer, even an
    // empty one, counts as covering the board for accessibility checkers,
    // which then cannot work out the contrast of anything under it.
    <div
      ref={overlay}
      aria-hidden
      data-presence-layer
      className="pointer-events-none invisible absolute inset-0 z-30 overflow-hidden"
    >
      {/* A pointer that leaves fades out where it was last seen. */}
      <AnimatePresence>
        {others.map(
          (other) =>
            other.cursor && (
              <RemoteCursor
                key={other.clientId}
                name={other.user.name}
                color={other.user.color}
                cursor={other.cursor}
                locate={locate}
                visibleArea={visibleArea}
                register={register}
                layout={layout}
              />
            ),
        )}
      </AnimatePresence>
    </div>
  );
}
