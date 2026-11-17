"use client";

import { animate } from "motion/react";
import { Component, type ReactNode, type RefObject } from "react";

type Controls = ReturnType<typeof animate>;

/** Cards and columns on screen. The placeholder dnd-kit leaves in a list is not one. */
const ITEMS = "[data-column-id], [data-card-id]:not([data-dnd-placeholder])";

/** Movement shorter than this, in pixels, is not animated. */
const MIN_DISTANCE = 1;

const TRANSITION = { duration: 0.25, ease: [0.2, 0, 0, 1] } as const;

function keyOf(element: Element): string | null {
  const card = element.getAttribute("data-card-id");
  if (card) return `card:${card}`;
  const column = element.getAttribute("data-column-id");
  return column ? `column:${column}` : null;
}

function measure(root: HTMLElement): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  for (const element of root.querySelectorAll(ITEMS)) {
    const key = keyOf(element);
    if (key) rects.set(key, element.getBoundingClientRect());
  }
  return rects;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface LayoutAnimatorProps {
  /** The element that holds the columns. */
  scrollerRef: RefObject<HTMLElement | null>;
  /**
   * False while dnd-kit is moving cards or columns. Nothing is measured or
   * animated then, so that Motion and dnd-kit never move one element at once.
   */
  enabled: boolean;
  children: ReactNode;
}

/**
 * Slides cards and columns to their new places when the board changes
 * order, whoever changed it.
 *
 * Every card and column is measured just before React changes the page
 * (`getSnapshotBeforeUpdate`) and again just after. Each one that moved is
 * put back where it was with a transform and animated to where it now is.
 * Items are matched by id, not by element, so a card that changed column
 * (and was re-created by React in its new list) still slides across.
 *
 * Done once at board level rather than with Motion's `layout` prop on every
 * card: a card would otherwise have to know whether a drag is in progress,
 * which would redraw every card at pick-up and drop.
 *
 * With reduced motion requested, nothing is animated.
 */
export class LayoutAnimator extends Component<LayoutAnimatorProps> {
  private readonly running = new Map<HTMLElement, Controls>();

  override getSnapshotBeforeUpdate(): Map<string, DOMRect> | null {
    const root = this.props.scrollerRef.current;
    if (!this.props.enabled || !root || prefersReducedMotion()) return null;
    // Measured with any animation still running, so that is where the
    // element is seen to start from.
    return measure(root);
  }

  override componentDidUpdate(
    _previous: LayoutAnimatorProps,
    _state: unknown,
    before: Map<string, DOMRect> | null,
  ): void {
    const root = this.props.scrollerRef.current;
    if (!before || !root) return;

    // Where everything is now, without the transforms of animations that
    // were still running.
    for (const [element, controls] of this.running) {
      controls.stop();
      element.style.transform = "";
    }
    this.running.clear();

    const elements = new Map<string, HTMLElement>();
    for (const element of root.querySelectorAll<HTMLElement>(ITEMS)) {
      const key = keyOf(element);
      if (key) elements.set(key, element);
    }
    const after = new Map<string, DOMRect>();
    for (const [key, element] of elements) {
      after.set(key, element.getBoundingClientRect());
    }

    // How far each item has to travel. A card is drawn inside its column,
    // so when the column itself slides, the card only needs what is left.
    const offsets = new Map<string, { x: number; y: number }>();
    const offsetOf = (key: string) => {
      const from = before.get(key);
      const to = after.get(key);
      return from && to
        ? { x: from.left - to.left, y: from.top - to.top }
        : null;
    };
    for (const key of elements.keys()) {
      if (key.startsWith("column:")) {
        const offset = offsetOf(key);
        if (offset) offsets.set(key, offset);
      }
    }
    for (const [key, element] of elements) {
      if (!key.startsWith("card:")) continue;
      const offset = offsetOf(key);
      if (!offset) continue;
      const column = element.closest("[data-column-id]");
      const carried = column ? offsets.get(keyOf(column) ?? "") : undefined;
      offsets.set(key, {
        x: offset.x - (carried?.x ?? 0),
        y: offset.y - (carried?.y ?? 0),
      });
    }

    for (const [key, { x, y }] of offsets) {
      if (Math.abs(x) < MIN_DISTANCE && Math.abs(y) < MIN_DISTANCE) continue;
      const element = elements.get(key)!;
      const controls = animate(
        element,
        { transform: [`translate(${x}px, ${y}px)`, "translate(0px, 0px)"] },
        TRANSITION,
      );
      this.running.set(element, controls);
      void controls.then(() => {
        if (this.running.get(element) !== controls) return;
        this.running.delete(element);
        element.style.transform = "";
      });
    }
  }

  override componentWillUnmount(): void {
    for (const controls of this.running.values()) controls.stop();
    this.running.clear();
  }

  /**
   * Puts everything in its place at once. Called just before a drag starts,
   * because dnd-kit measures the item it picks up, transform included.
   */
  finish(): void {
    for (const [element, controls] of this.running) {
      controls.complete();
      element.style.transform = "";
    }
    this.running.clear();
  }

  override render(): ReactNode {
    return this.props.children;
  }
}
