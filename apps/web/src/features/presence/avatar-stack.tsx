"use client";

import { initials, type PresenceStore } from "@syncboard/core/presence";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePresence } from "./presence-context";

/** More people than this are summed up as "+3". */
const MAX_SHOWN = 5;

/** How an avatar arrives and leaves, and how the others make room. */
const APPEAR = {
  layout: true,
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6 },
  transition: { duration: 0.18, ease: "easeOut" },
} as const;

/** The same with reduced motion: a fade, and nothing moves. */
const FADE = {
  layout: false,
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: "easeOut" },
} as const;

const AVATAR_CLASS =
  "flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-background select-none";

/** Who is on the board right now: this person first, then the others. */
export function AvatarStack({ presence }: { presence: PresenceStore }) {
  const people = usePresence(presence, (view) => view.people);
  const appear = useReducedMotion() ? FADE : APPEAR;
  // Nobody is listed until this tab has joined.
  if (people.length === 0) return null;

  const shown = people.slice(0, MAX_SHOWN);
  const rest = people.slice(MAX_SHOWN);

  return (
    // Positioned, for `popLayout`: someone leaving is taken out of the row
    // at once, and the others slide together while their avatar fades.
    <ul aria-label="People on this board" className="relative flex -space-x-1">
      <AnimatePresence mode="popLayout" initial={false}>
        {shown.map((person) => {
          const label = person.isSelf ? `${person.name} (you)` : person.name;
          return (
            <motion.li
              // The key goes before the spread: after it, the JSX compiler
              // passes the children as an unkeyed list.
              key={person.id}
              {...appear}
              data-presence-person
              data-self={person.isSelf}
              data-user-name={person.name}
              data-user-color={person.color}
              title={label}
              // The colour is checked to be a plain hex value where it is read.
              style={{ backgroundColor: person.color }}
              className={`${AVATAR_CLASS} text-white`}
            >
              <span aria-hidden>{initials(person.name)}</span>
              <span className="sr-only">{label}</span>
            </motion.li>
          );
        })}

        {rest.length > 0 && (
          <motion.li
            key="more"
            {...appear}
            title={rest.map((person) => person.name).join(", ")}
            className={`${AVATAR_CLASS} bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100`}
          >
            <span aria-hidden>+{rest.length}</span>
            <span className="sr-only">
              and {rest.length} more:{" "}
              {rest.map((person) => person.name).join(", ")}
            </span>
          </motion.li>
        )}
      </AnimatePresence>
    </ul>
  );
}
