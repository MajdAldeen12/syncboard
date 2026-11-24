"use client";

import { useRef, type ReactNode } from "react";
import { MEDIA, ScrollTrigger, gsap, useGSAP } from "./gsap";
import {
  PEOPLE,
  PITCH,
  SketchAvatar,
  SketchCard,
  SketchFocusRing,
  SketchPointer,
  SketchStatus,
  SketchTag,
  SketchWindow,
  WINDOW,
  slot,
} from "./sketch";

/*
 * The feature tour: a picture of one board that stays in view (CSS
 * `position: sticky`) while the steps beside it, or below it on a phone,
 * scroll past. One timeline, scrubbed by ScrollTrigger across the steps,
 * plays a scene per step: people arrive, the connection drops and comes
 * back, a card is moved by keyboard and by touch, a new guest joins.
 *
 * The picture stays in view by CSS alone, not by ScrollTrigger's `pin`.
 * Pinning wraps the element in a spacer as the page starts, which moves what
 * follows; here the section's height comes from its own text, so nothing
 * moves when the animation is set up, and nothing at all without it.
 *
 * The HTML is the scene at its end: everyone here, every card in its final
 * place. That is what shows without JavaScript or with reduced motion. The
 * timeline sets its starting state only when it is created, while the tour
 * is still below the fold.
 */

const KEYS = [
  { id: "t-key-1", label: "Space", width: 40 },
  { id: "t-key-2", label: "→", width: 22 },
  { id: "t-key-3", label: "→", width: 22 },
  { id: "t-key-4", label: "Space", width: 40 },
] as const;
const KEY_GAP = 6;
const KEYS_Y = WINDOW.height + 14;
const KEYS_WIDTH =
  KEYS.reduce((sum, key) => sum + key.width, 0) + KEY_GAP * (KEYS.length - 1);
/** Each key with its left edge, the row centred under the window. */
const PLACED_KEYS = KEYS.map((key, index) => ({
  ...key,
  x:
    (WINDOW.width - KEYS_WIDTH) / 2 +
    KEYS.slice(0, index).reduce((sum, each) => sum + each.width + KEY_GAP, 0),
}));

/** Where a finger takes hold of "Book the venue", at its final place. */
const FINGER = { x: slot(1, 0).x + 62, y: slot(1, 0).y + 14 };

function TourPicture() {
  return (
    <svg
      viewBox={`0 0 ${WINDOW.width} ${KEYS_Y + 26}`}
      aria-hidden
      className="block h-auto w-full overflow-visible font-sans"
    >
      <SketchWindow
        title="Launch plan"
        header={
          <>
            <SketchAvatar id="t-av-otter" x={252} person={PEOPLE.otter} />
            <SketchAvatar id="t-av-heron" x={268} person={PEOPLE.heron} />
            <SketchAvatar id="t-av-lynx" x={284} person={PEOPLE.lynx} />
            <SketchAvatar id="t-av-puffin" x={300} person={PEOPLE.puffin} />
            <SketchStatus id="t-synced" state="synced" />
            <SketchStatus id="t-offline" state="offline" visible={false} />
          </>
        }
      >
        <SketchCard id="t-k1" title="Print the badges" column={0} index={0} />
        <SketchCard id="t-k3" title="Book the venue" column={1} index={0} />
        <SketchCard id="t-k2" title="Write the intro" column={1} index={1}>
          <SketchTag
            id="t-k2-tag"
            person={PEOPLE.lynx}
            doing="editing"
            visible
          />
        </SketchCard>
        <SketchCard id="t-k4" title="Pick a typeface" column={2} index={0} />
        <SketchCard id="t-k5" title="Order stickers" column={2} index={1}>
          <SketchFocusRing id="t-k5-focus" visible />
        </SketchCard>
        <SketchPointer id="t-heron" x={300} y={165} person={PEOPLE.heron} />
        <SketchPointer id="t-lynx" x={230} y={124} person={PEOPLE.lynx} />
        <SketchPointer id="t-puffin" x={60} y={150} person={PEOPLE.puffin} />
        <g transform={`translate(${FINGER.x} ${FINGER.y})`}>
          <circle
            data-sketch="t-finger"
            r={9}
            opacity={0}
            strokeWidth={1.2}
            className="fill-zinc-900/20 stroke-zinc-900/45 dark:fill-white/25 dark:stroke-white/60"
          />
        </g>
      </SketchWindow>
      <g data-sketch="t-keys">
        {PLACED_KEYS.map((key) => (
          <g key={key.id} transform={`translate(${key.x} ${KEYS_Y})`}>
            <rect
              y={2}
              width={key.width}
              height={20}
              rx={4}
              className="fill-zinc-300 dark:fill-zinc-700"
            />
            <g data-sketch={key.id}>
              <rect
                width={key.width}
                height={20}
                rx={4}
                className="fill-white stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-600"
              />
              <text
                x={key.width / 2}
                y={13.5}
                fontSize={8.5}
                fontWeight={500}
                textAnchor="middle"
                className="fill-zinc-700 dark:fill-zinc-200"
              >
                {key.label}
              </text>
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * The tour. `children` are the steps, one element each, in order; the
 * picture plays one scene per step as the step passes the reading line.
 */
export function FeatureTour({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const steps = root.current?.querySelector("[data-tour-steps]");
      if (!steps) return;

      const mm = gsap.matchMedia();
      mm.add(MEDIA, (context) => {
        const { motion, wide } = context.conditions ?? {};
        if (!motion) return;

        const $ = (...ids: string[]) =>
          ids.map((id) => `[data-sketch="${id}"]`).join(",");
        const center = { transformOrigin: "50% 50%" };

        // The starting state: only Quiet Otter here, the last cards not yet
        // made, the others where they were before being moved.
        gsap.set($("t-av-heron", "t-av-lynx", "t-av-puffin"), {
          scale: 0.3,
          opacity: 0,
          ...center,
        });
        gsap.set($("t-heron"), { x: 110, y: -10, opacity: 0 });
        gsap.set($("t-lynx"), { y: -PITCH.slot + 40, opacity: 0 });
        gsap.set($("t-puffin"), { x: -70, opacity: 0 });
        gsap.set($("t-k2"), { y: -PITCH.slot });
        gsap.set($("t-k2-tag", "t-k5-focus", "t-keys"), { opacity: 0 });
        gsap.set($("t-k3"), {
          y: PITCH.slot,
          scale: 0.92,
          opacity: 0,
          ...center,
        });
        gsap.set($("t-k5"), {
          x: -2 * PITCH.column,
          scale: 0.92,
          opacity: 0,
          ...center,
        });
        gsap.set($("t-finger"), { y: PITCH.slot, scale: 1.4, ...center });

        const pop = {
          scale: 1,
          opacity: 1,
          duration: 0.2,
          ease: "back.out(2)",
        };
        const fade = (opacity: number) => ({ opacity, duration: 0.12 });

        // The line on the screen a step must reach before its scene plays:
        // beside the picture on a wide screen, below it on a narrow one.
        const line = wide ? "60%" : "72%";
        const timeline = gsap.timeline({
          defaults: { duration: 0.15, ease: "power2.out" },
          scrollTrigger: {
            trigger: steps,
            start: `top ${line}`,
            end: `bottom ${line}`,
            scrub: 0.6,
          },
        });

        // A key goes down and comes back up.
        const press = (id: string, at: number) =>
          timeline
            .to($(id), { y: 2, duration: 0.03, ease: "power1.in" }, at)
            .to($(id), { y: 0, duration: 0.05 }, at + 0.04);

        // Each step has one unit of the timeline, and its scene plays in the
        // first half of it: by the time the step's text is in the middle of
        // the screen, the picture shows what it says.

        // 1. People arrive, and Calm Lynx starts editing a card.
        timeline
          .to($("t-av-heron"), pop, 0.05)
          .to($("t-heron"), { x: 10, y: -30, opacity: 1, duration: 0.3 }, 0.05)
          .to($("t-av-lynx"), pop, 0.2)
          .to($("t-lynx"), { y: -PITCH.slot, opacity: 1, duration: 0.3 }, 0.2)
          .to($("t-k2-tag"), fade(1), 0.45);

        // 2. The connection drops. The others vanish, a card made here
        // stays here; on reconnecting, theirs and ours are both on the board.
        timeline
          .to($("t-synced"), fade(0), 1.05)
          .to($("t-offline"), fade(1), 1.05)
          .to($("t-heron", "t-lynx", "t-k2-tag"), fade(0), 1.05)
          .to($("t-av-heron", "t-av-lynx"), fade(0.3), 1.05)
          .to($("t-k5"), pop, 1.18)
          .to($("t-offline"), fade(0), 1.4)
          .to($("t-synced"), fade(1), 1.4)
          .to($("t-av-heron", "t-av-lynx", "t-lynx", "t-k2-tag"), fade(1), 1.4)
          .to($("t-heron"), { x: 0, y: 0, opacity: 1, duration: 0.2 }, 1.4)
          .to($("t-k3"), pop, 1.45);

        // 3. "Order stickers" goes by keyboard: Space, right, right, Space.
        // Then a finger drags "Book the venue" to the top of Doing.
        timeline
          .to($("t-keys"), fade(1), 2)
          .to($("t-k5-focus"), fade(1), 2.05)
          .to($("t-k5"), { scale: 1.03, duration: 0.06 }, 2.1)
          .to($("t-k5-lift"), fade(1), 2.1)
          .to($("t-k5"), { x: -PITCH.column, duration: 0.08 }, 2.2)
          .to($("t-k3"), { y: 2 * PITCH.slot, duration: 0.08 }, 2.2)
          .to($("t-k5"), { x: 0, duration: 0.08 }, 2.3)
          .to($("t-k3"), { y: PITCH.slot, duration: 0.08 }, 2.3)
          .to($("t-k5"), { scale: 1, duration: 0.06 }, 2.4)
          .to($("t-k5-lift"), fade(0), 2.4)
          .to($("t-finger"), { opacity: 1, scale: 1, duration: 0.06 }, 2.47)
          .to($("t-k3"), { scale: 1.03, duration: 0.05 }, 2.52)
          .to($("t-k3-lift"), fade(1), 2.52)
          .to($("t-k3", "t-finger"), { y: 0, duration: 0.12 }, 2.56)
          .to($("t-k2", "t-lynx"), { y: 0, duration: 0.1 }, 2.58)
          .to($("t-k3"), { scale: 1, duration: 0.05 }, 2.7)
          .to($("t-k3-lift"), fade(0), 2.7)
          .to($("t-finger"), { opacity: 0, scale: 1.3, duration: 0.08 }, 2.7);
        press("t-key-1", 2.1);
        press("t-key-2", 2.2);
        press("t-key-3", 2.3);
        press("t-key-4", 2.4);

        // 4. Someone new opens the demo board and joins as a guest.
        timeline
          .to($("t-av-puffin"), pop, 3.05)
          .to($("t-puffin"), { x: 0, opacity: 1, duration: 0.35 }, 3.05)
          // Holds the finished picture while the last step is read.
          .to({}, { duration: 0.6 }, 3.4);

        // The steps' heights change when the display font arrives.
        void document.fonts?.ready.then(() => ScrollTrigger.refresh());
      });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      data-landing-sketch="tour"
      className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-x-12 md:pt-24 lg:gap-x-20"
    >
      <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pt-3 pb-4 sm:-mx-6 sm:px-6 md:top-[max(2rem,calc(50svh-13rem))] md:order-last md:mx-0 md:self-start md:px-0 md:py-0">
        <TourPicture />
      </div>
      <div data-tour-steps>{children}</div>
    </div>
  );
}
