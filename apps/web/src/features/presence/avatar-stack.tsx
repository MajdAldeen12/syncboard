"use client";

import { initials, type PresenceStore } from "@syncboard/core/presence";
import { usePresence } from "./presence-context";

/** More people than this are summed up as "+3". */
const MAX_SHOWN = 5;

const AVATAR_CLASS =
  "flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-background select-none";

/** Who is on the board right now: this person first, then the others. */
export function AvatarStack({ presence }: { presence: PresenceStore }) {
  const people = usePresence(presence, (view) => view.people);
  // Nobody is listed until this tab has joined.
  if (people.length === 0) return null;

  const shown = people.slice(0, MAX_SHOWN);
  const rest = people.slice(MAX_SHOWN);

  return (
    <ul aria-label="People on this board" className="flex -space-x-1">
      {shown.map((person) => {
        const label = person.isSelf ? `${person.name} (you)` : person.name;
        return (
          <li
            key={person.id}
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
          </li>
        );
      })}

      {rest.length > 0 && (
        <li
          title={rest.map((person) => person.name).join(", ")}
          className={`${AVATAR_CLASS} bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100`}
        >
          <span aria-hidden>+{rest.length}</span>
          <span className="sr-only">
            and {rest.length} more:{" "}
            {rest.map((person) => person.name).join(", ")}
          </span>
        </li>
      )}
    </ul>
  );
}
