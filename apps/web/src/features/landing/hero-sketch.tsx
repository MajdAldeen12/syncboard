"use client";

import { useRef, type ReactNode } from "react";
import { MEDIA, gsap, useGSAP } from "./gsap";
import {
  PEOPLE,
  PITCH,
  SketchCard,
  SketchPointer,
  SketchTag,
  SketchWindow,
  WINDOW,
  slot,
} from "./sketch";

/*
 * Two people's screens showing one board. Quiet Otter moves a card on the
 * front screen, and Brisk Heron's screen behind shows Otter's pointer, a
 * "Quiet Otter is moving this" tag, and the card sliding over on the drop.
 * Then Heron does the same the other way round.
 *
 * The HTML is the picture before anyone moves, complete on its own. The
 * timeline starts from it, so nothing is hidden or moved when the page
 * loads, and with reduced motion (or without JavaScript) the picture simply
 * stays as it is.
 */

/**
 * Where each person's pointer rests before the story starts and after their
 * move. On a wide screen the front window covers the bottom left of the one
 * behind it, so pointers stay clear of that corner.
 */
const OTTER_REST = { x: 92, y: 150 };
const OTTER_END = { x: 200, y: 150 };
const HERON_REST = { x: 322, y: 150 };
const HERON_END = { x: 318, y: 165 };

/** Where on a card a pointer takes hold of it. */
const GRIP = { x: 64, y: 15 };

/** The other screen hears about a change this much later. */
const LAG = 0.12;

function Screen({
  side,
  label,
  self,
  other,
}: {
  side: "a" | "b";
  label: string;
  self: "otter" | "heron";
  other: "otter" | "heron";
}) {
  const rest = { otter: OTTER_REST, heron: HERON_REST };
  const otherPerson = PEOPLE[other];
  return (
    <svg
      viewBox={`0 0 ${WINDOW.width} ${WINDOW.height}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full overflow-visible font-sans"
    >
      <SketchWindow title="Launch plan">
        <SketchCard
          id={`${side}-c1`}
          title="Pick a typeface"
          column={0}
          index={0}
        >
          {side === "b" ? (
            <SketchTag id="b-c1-tag" person={PEOPLE.otter} doing="moving" />
          ) : null}
        </SketchCard>
        <SketchCard
          id={`${side}-c2`}
          title="Write the intro"
          column={0}
          index={1}
        />
        <SketchCard id={`${side}-c3`} title="Set up CI" column={1} index={0}>
          {side === "a" ? (
            <SketchTag id="a-c3-tag" person={PEOPLE.heron} doing="moving" />
          ) : null}
        </SketchCard>
        <SketchCard
          id={`${side}-c4`}
          title="Sketch the board"
          column={2}
          index={0}
        />
        <SketchPointer
          id={`${side}-${other}`}
          {...rest[other]}
          person={otherPerson}
        />
        <SketchPointer id={`${side}-${self}`} {...rest[self]} />
      </SketchWindow>
    </svg>
  );
}

export function HeroSketch() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: MEDIA.motion, wide: MEDIA.wide }, (context) => {
        const { motion, wide } = context.conditions ?? {};
        if (!motion) return;
        const $ = (id: string) => `[data-sketch="${id}"]`;
        // How far a pointer must go from its resting place to `point`.
        const from = (
          rest: { x: number; y: number },
          point: { x: number; y: number },
        ) => ({ x: point.x - rest.x, y: point.y - rest.y });
        // The same, to `card`'s grip with the card moved by `shift`.
        const onCard = (
          rest: { x: number; y: number },
          card: { x: number; y: number },
          shift = { x: 0, y: 0 },
        ) =>
          from(rest, {
            x: card.x + GRIP.x + shift.x,
            y: card.y + GRIP.y + shift.y,
          });
        const otterEnd = from(OTTER_REST, OTTER_END);
        const heronEnd = from(HERON_REST, HERON_END);

        // Otter takes "Pick a typeface" from To do to the top of Doing.
        const otterGrip = onCard(OTTER_REST, slot(0, 0));
        const otterDrop = onCard(OTTER_REST, slot(0, 0), {
          x: PITCH.column,
          y: 0,
        });
        // Heron takes "Set up CI", pushed to second place in Doing, to the
        // top of Done.
        const heronGrip = onCard(HERON_REST, slot(1, 1));
        const heronDrop = onCard(HERON_REST, slot(1, 1), {
          x: PITCH.column,
          y: -PITCH.slot,
        });

        const settle = { duration: 0.25, ease: "power2.out" };
        const lift = { duration: 0.15, ease: "power1.out" };

        // Side by side, both screens are in view as the page opens, and the
        // story starts shortly after. Stacked on a narrow screen, the second
        // screen is below the fold: the story waits until both are in view,
        // or nobody would see the second half of it.
        const start = wide
          ? { delay: 0.6 }
          : {
              delay: 0.2,
              scrollTrigger: {
                trigger: root.current,
                start: "bottom bottom",
                once: true,
              },
            };

        gsap
          .timeline({ ...start, defaults: { ease: "power2.inOut" } })
          // Quiet Otter reaches for a card. Heron's screen shows the pointer.
          .addLabel("reach")
          .to($("a-otter"), { ...otterGrip, duration: 0.7 }, "reach")
          .to($("b-otter"), { ...otterGrip, duration: 0.7 }, `reach+=${LAG}`)
          // Picks it up.
          .addLabel("lift", "reach+=0.8")
          .to(
            $("a-c1"),
            { scale: 1.03, transformOrigin: "50% 50%", ...lift },
            "lift",
          )
          .to($("a-c1-lift"), { opacity: 1, ...lift }, "lift")
          .to($("b-c1-tag"), { opacity: 1, ...lift }, `lift+=${LAG}`)
          // Drags it to Doing: To do closes up, Doing makes room.
          .addLabel("drag", "lift+=0.2")
          .to($("a-c1"), { x: PITCH.column, duration: 0.9 }, "drag")
          .to($("a-otter"), { x: otterDrop.x, duration: 0.9 }, "drag")
          .to($("b-otter"), { x: otterDrop.x, duration: 0.9 }, `drag+=${LAG}`)
          .to($("a-c2"), { y: -PITCH.slot, ...settle }, "drag+=0.35")
          .to($("a-c3"), { y: PITCH.slot, ...settle }, "drag+=0.45")
          // Drops it. Heron's screen slides everything into place.
          .addLabel("drop", "drag+=0.95")
          .to($("a-c1"), { scale: 1, ...lift }, "drop")
          .to($("a-c1-lift"), { opacity: 0, ...lift }, "drop")
          .to($("b-c1-tag"), { opacity: 0, ...lift }, `drop+=${LAG}`)
          .to($("b-c1"), { x: PITCH.column, ...settle }, `drop+=${LAG}`)
          .to($("b-c2"), { y: -PITCH.slot, ...settle }, `drop+=${LAG}`)
          .to($("b-c3"), { y: PITCH.slot, ...settle }, `drop+=${LAG}`)
          .to($("a-otter"), { ...otterEnd, duration: 0.6 }, "drop+=0.35")
          .to(
            $("b-otter"),
            { ...otterEnd, duration: 0.6 },
            `drop+=${0.35 + LAG}`,
          )
          // Brisk Heron, on the other screen, reaches for "Set up CI".
          .addLabel("reach2", "drop+=0.8")
          .to($("b-heron"), { ...heronGrip, duration: 0.7 }, "reach2")
          .to($("a-heron"), { ...heronGrip, duration: 0.7 }, `reach2+=${LAG}`)
          .addLabel("lift2", "reach2+=0.8")
          .to(
            $("b-c3"),
            { scale: 1.03, transformOrigin: "50% 50%", ...lift },
            "lift2",
          )
          .to($("b-c3-lift"), { opacity: 1, ...lift }, "lift2")
          .to($("a-c3-tag"), { opacity: 1, ...lift }, `lift2+=${LAG}`)
          // Drags it up and over to the top of Done.
          .addLabel("drag2", "lift2+=0.2")
          .to($("b-c3"), { x: PITCH.column, y: 0, duration: 0.9 }, "drag2")
          .to($("b-heron"), { ...heronDrop, duration: 0.9 }, "drag2")
          .to($("a-heron"), { ...heronDrop, duration: 0.9 }, `drag2+=${LAG}`)
          .to($("b-c4"), { y: PITCH.slot, ...settle }, "drag2+=0.5")
          .addLabel("drop2", "drag2+=0.95")
          .to($("b-c3"), { scale: 1, ...lift }, "drop2")
          .to($("b-c3-lift"), { opacity: 0, ...lift }, "drop2")
          .to($("a-c3-tag"), { opacity: 0, ...lift }, `drop2+=${LAG}`)
          .to($("a-c3"), { x: PITCH.column, y: 0, ...settle }, `drop2+=${LAG}`)
          .to($("a-c4"), { y: PITCH.slot, ...settle }, `drop2+=${LAG}`)
          .to($("b-heron"), { ...heronEnd, duration: 0.6 }, "drop2+=0.35")
          .to(
            $("a-heron"),
            { ...heronEnd, duration: 0.6 },
            `drop2+=${0.35 + LAG}`,
          );
      });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      data-landing-sketch="hero"
      className="relative flex flex-col gap-6 lg:block lg:aspect-[7/6]"
    >
      <figure className="relative z-10 flex flex-col gap-2 lg:absolute lg:bottom-0 lg:left-0 lg:w-[80%]">
        <Frame>
          <Screen
            side="a"
            self="otter"
            other="heron"
            label="Quiet Otter's screen: a board called Launch plan with To do, Doing and Done columns. Quiet Otter moves a card from To do to Doing."
          />
        </Frame>
        <Caption person={PEOPLE.otter} className="order-first lg:order-last" />
      </figure>
      <figure className="flex flex-col gap-2 lg:absolute lg:top-0 lg:right-0 lg:w-[80%]">
        <Caption person={PEOPLE.heron} />
        <Frame>
          <Screen
            side="b"
            self="heron"
            other="otter"
            label="Brisk Heron's screen: the same board, with Quiet Otter's pointer on it. The card Quiet Otter moved moves here too."
          />
        </Frame>
      </figure>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[11px] shadow-[0_18px_40px_-16px_rgb(0_0_0/0.28)] dark:shadow-[0_18px_40px_-12px_rgb(0_0_0/0.9)]">
      {children}
    </div>
  );
}

function Caption({
  person,
  className = "",
}: {
  person: { name: string; color: string };
  className?: string;
}) {
  return (
    <figcaption
      className={`flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 ${className}`}
    >
      <span
        aria-hidden
        className="size-2.5 rounded-full"
        style={{ backgroundColor: person.color }}
      />
      {person.name}&rsquo;s screen
    </figcaption>
  );
}
