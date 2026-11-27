"use client";

import {
  describePeopleChange,
  type Person,
  type PresenceStore,
} from "@syncboard/core/presence";
import { useState } from "react";
import { usePresence } from "./presence-context";

interface Said {
  /** The list the last announcement was worked out from. */
  readonly people: readonly Person[];
  readonly text: string;
  /** Changes with every announcement, so a repeated sentence is read again. */
  readonly count: number;
}

/**
 * Tells a screen reader, politely, when someone joins or leaves the board.
 * The avatars list who is here; this says who has just come or gone. The
 * people already on the board when this tab arrives are not announced.
 */
export function PeopleAnnouncer({ presence }: { presence: PresenceStore }) {
  const people = usePresence(presence, (view) => view.people);
  const [said, setSaid] = useState<Said>({ people, text: "", count: 0 });

  // Worked out while rendering, from the list last seen: a change of list is
  // a change of what to say, with no effect and no extra render to wait for.
  if (said.people !== people) {
    const text = describePeopleChange(said.people, people);
    setSaid(
      text === null
        ? { ...said, people }
        : { people, text, count: said.count + 1 },
    );
  }

  return (
    <p data-people-announcer role="status" className="sr-only">
      <span key={said.count}>{said.text}</span>
    </p>
  );
}
