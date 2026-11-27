"use client";

import type { PresenceStore } from "@syncboard/core/presence";
import { useEffect, useState } from "react";
import { usePresence } from "./presence-context";

/**
 * Says who this person is on the board, by the made-up name others see.
 * Alone on the board, it also says how to see the board sync: open it a
 * second time, in another browser, and offers to copy its address.
 */
export function SelfHint({ presence }: { presence: PresenceStore }) {
  const people = usePresence(presence, (view) => view.people);
  const self = people.find((person) => person.isSelf);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!self) return null;
  const alone = people.length === 1;

  return (
    <div
      data-self-hint
      className="hidden items-center gap-2 text-xs text-zinc-600 md:flex dark:text-zinc-400"
    >
      <p>
        You are <span className="font-medium text-foreground">{self.name}</span>
        {alone && (
          <span className="hidden lg:inline">
            . Open this board in another browser to watch it sync
          </span>
        )}
      </p>
      {alone && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(window.location.href)
              .then(() => setCopied(true));
          }}
          className="rounded-md px-2 py-1 font-medium text-zinc-700 ring-1 ring-zinc-300 outline-offset-1 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
        </button>
      )}
    </div>
  );
}
