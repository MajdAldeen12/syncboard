import type { ReactNode } from "react";

/*
 * Drawing pieces for the landing page's pictures of a board. They are SVG,
 * drawn in one fixed coordinate system, so a picture scales with its box and
 * a timeline can move things by fixed amounts at any screen size.
 *
 * Everything GSAP moves is an inner group marked `data-sketch`, inside an
 * outer group that places it. GSAP's x and y are therefore offsets from where
 * the picture draws the item without JavaScript.
 */

/** The window: a board's header bar and three columns. */
export const WINDOW = { width: 400, height: 200 } as const;

/** How far apart neighbouring columns and neighbouring cards are. */
export const PITCH = { column: 130, slot: 34 } as const;

const COLUMNS = ["To do", "Doing", "Done"] as const;
const COLUMN = { x: 10, y: 42, width: 120, height: 148 } as const;
const FIRST_SLOT_Y = 68;
const CARD = { width: 108, height: 28, inset: 6 } as const;

export type ColumnIndex = 0 | 1 | 2;
export type SlotIndex = 0 | 1 | 2;

/** The top-left corner of the card at `slot` in `column`. */
export function slot(column: ColumnIndex, index: SlotIndex) {
  return {
    x: COLUMN.x + column * PITCH.column + CARD.inset,
    y: FIRST_SLOT_Y + index * PITCH.slot,
  };
}

export interface Person {
  readonly name: string;
  readonly initials: string;
  readonly color: string;
}

// Guest names and colours as the app makes them up (see
// packages/core/src/presence/guest.ts). Copied, not imported, so that the
// landing page's bundle carries none of the board's code.
export const PEOPLE = {
  otter: { name: "Quiet Otter", initials: "QO", color: "#2563eb" },
  heron: { name: "Brisk Heron", initials: "BH", color: "#db2777" },
  lynx: { name: "Calm Lynx", initials: "CL", color: "#15803d" },
  puffin: { name: "Swift Puffin", initials: "SP", color: "#c2410c" },
} as const satisfies Record<string, Person>;

/** A rough width for a short label, for the pill drawn behind it. */
function labelWidth(text: string, fontSize: number): number {
  return Math.round(text.length * fontSize * 0.56 + fontSize * 1.1);
}

const at = (point: { x: number; y: number }) =>
  `translate(${point.x} ${point.y})`;

export function SketchWindow({
  title,
  header,
  children,
}: {
  title: string;
  /** Avatars and the connection status, drawn on the header bar. */
  header?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <g>
      <rect
        x={0.5}
        y={0.5}
        width={WINDOW.width - 1}
        height={WINDOW.height - 1}
        rx={10}
        className="fill-white stroke-zinc-200 dark:fill-zinc-950 dark:stroke-zinc-800"
      />
      <line
        x1={1}
        x2={WINDOW.width - 1}
        y1={32.5}
        y2={32.5}
        className="stroke-zinc-200 dark:stroke-zinc-800"
      />
      <text
        x={14}
        y={20.5}
        fontSize={10.5}
        fontWeight={600}
        className="fill-zinc-900 dark:fill-zinc-100"
      >
        {title}
      </text>
      {header}
      {COLUMNS.map((name, index) => (
        <g
          key={name}
          transform={`translate(${COLUMN.x + index * PITCH.column} ${COLUMN.y})`}
        >
          <rect
            width={COLUMN.width}
            height={COLUMN.height}
            rx={7}
            className="fill-zinc-100 dark:fill-zinc-900"
          />
          <text
            x={8}
            y={16}
            fontSize={9}
            fontWeight={600}
            className="fill-zinc-700 dark:fill-zinc-300"
          >
            {name}
          </text>
        </g>
      ))}
      {children}
    </g>
  );
}

/**
 * A card at its place on the board. `children` are drawn on it, above its
 * text: a "… is moving this" tag, a focus ring.
 */
export function SketchCard({
  id,
  title,
  column,
  index,
  children,
}: {
  id: string;
  title: string;
  column: ColumnIndex;
  index: SlotIndex;
  children?: ReactNode;
}) {
  return (
    <g transform={at(slot(column, index))}>
      <g data-sketch={id}>
        {/* The shadow of a card that has been picked up. */}
        <rect
          data-sketch={`${id}-lift`}
          x={-1}
          y={3}
          width={CARD.width + 2}
          height={CARD.height + 1}
          rx={7}
          opacity={0}
          className="fill-black/15 dark:fill-black/60"
        />
        <rect
          width={CARD.width}
          height={CARD.height}
          rx={6}
          className="fill-white stroke-black/10 dark:fill-zinc-800 dark:stroke-white/10"
        />
        <text
          x={8}
          y={17.5}
          fontSize={9.5}
          className="fill-zinc-800 dark:fill-zinc-100"
        >
          {title}
        </text>
        {children}
      </g>
    </g>
  );
}

/** The "Brisk Heron is moving this" tag on the top edge of a card. */
export function SketchTag({
  id,
  person,
  doing,
  visible = false,
}: {
  id: string;
  person: Person;
  doing: "editing" | "moving";
  visible?: boolean;
}) {
  const text = `${person.name} ${doing === "editing" ? "is editing" : "is moving this"}`;
  // As large as fits inside the card's column, the longest tag ("Quiet
  // Otter is moving this") included.
  const width = labelWidth(text, 7);
  return (
    <g data-sketch={id} opacity={visible ? 1 : 0}>
      <rect
        x={2}
        y={-6.5}
        width={width}
        height={12}
        rx={2.5}
        fill={person.color}
      />
      <text
        x={2 + width / 2}
        y={2}
        fontSize={7}
        fontWeight={500}
        textAnchor="middle"
        fill="white"
      >
        {text}
      </text>
    </g>
  );
}

/** The ring a focused card shows. */
export function SketchFocusRing({
  id,
  visible = false,
}: {
  id: string;
  visible?: boolean;
}) {
  return (
    <rect
      data-sketch={id}
      x={-2.5}
      y={-2.5}
      width={CARD.width + 5}
      height={CARD.height + 5}
      rx={8}
      fill="none"
      strokeWidth={1.6}
      opacity={visible ? 1 : 0}
      className="stroke-blue-600 dark:stroke-blue-400"
    />
  );
}

const ARROW = "M0 0v12.6l3.5-3.3 2.4 5.6 2.2-.95-2.4-5.5h4.9Z";

/**
 * A pointer resting at `x`, `y` (the tip of the arrow). Someone else's
 * pointer is drawn in their colour with their name; the viewer's own is the
 * plain black arrow of their system.
 */
export function SketchPointer({
  id,
  x,
  y,
  person,
}: {
  id: string;
  x: number;
  y: number;
  person?: Person;
}) {
  const width = person ? labelWidth(person.name, 8.5) : 0;
  return (
    <g transform={at({ x, y })}>
      <g data-sketch={id}>
        <path
          d={ARROW}
          fill={person?.color ?? "#000"}
          stroke="white"
          strokeWidth={1}
          strokeLinejoin="round"
        />
        {person ? (
          <>
            <rect
              x={8}
              y={13}
              width={width}
              height={13.5}
              rx={3}
              fill={person.color}
            />
            <text
              x={8 + width / 2}
              y={22.6}
              fontSize={8.5}
              fontWeight={500}
              textAnchor="middle"
              fill="white"
            >
              {person.name}
            </text>
          </>
        ) : null}
      </g>
    </g>
  );
}

/** One person's avatar on the header bar, centred on `x`. */
export function SketchAvatar({
  id,
  x,
  person,
}: {
  id: string;
  x: number;
  person: Person;
}) {
  return (
    <g transform={at({ x, y: 16.5 })}>
      <g data-sketch={id}>
        <circle
          r={8.5}
          fill={person.color}
          strokeWidth={1.5}
          className="stroke-white dark:stroke-zinc-950"
        />
        <text
          y={2.6}
          fontSize={7.5}
          fontWeight={600}
          textAnchor="middle"
          fill="white"
        >
          {person.initials}
        </text>
      </g>
    </g>
  );
}

/** The connection status at the right of the header bar. */
export function SketchStatus({
  id,
  state,
  visible = true,
}: {
  id: string;
  state: "synced" | "offline";
  visible?: boolean;
}) {
  return (
    <g data-sketch={id} opacity={visible ? 1 : 0}>
      <circle
        cx={349}
        cy={16.5}
        r={3}
        className={state === "synced" ? "fill-emerald-500" : "fill-zinc-400"}
      />
      <text
        x={356}
        y={19.5}
        fontSize={8.5}
        className="fill-zinc-600 dark:fill-zinc-400"
      >
        {state === "synced" ? "Synced" : "Offline"}
      </text>
    </g>
  );
}
