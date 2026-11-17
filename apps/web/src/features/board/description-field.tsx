"use client";

import { MAX_DESCRIPTION_LENGTH, type BoardStore } from "@syncboard/core/board";
import type { TextSession } from "@syncboard/core/text-binding";
import { useEffect, useRef, useState } from "react";
import { useAnnounceEditing } from "@/features/presence/presence-context";
import { bindTextField } from "@/lib/bind-text-field";

interface DescriptionFieldProps {
  id: string;
  store: BoardStore;
  cardId: string;
  /** The description as it is on the board now. */
  value: string;
}

/**
 * A card's description, always shown as a text field.
 *
 * While it has focus it is tied to an editing session: what is typed is
 * saved and seen by others as it is typed, and what others type appears in
 * it. Without focus it simply follows the description. The edit is kept when
 * focus leaves, including when the dialog around it closes; there is no
 * Escape-to-undo here, because Escape closes the dialog.
 */
export function DescriptionField({
  id,
  store,
  cardId,
  value,
}: DescriptionFieldProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const editing = useRef<{ session: TextSession; unbind: () => void } | null>(
    null,
  );
  const [focused, setFocused] = useState(false);
  useAnnounceEditing(focused ? { kind: "card", id: cardId } : undefined);

  function stop(): void {
    const current = editing.current;
    if (!current) return;
    editing.current = null;
    current.unbind();
    current.session.commit();
  }

  // Without focus, show the description as others change it.
  useEffect(() => {
    const element = field.current;
    if (element && !editing.current && element.value !== value) {
      element.value = value;
    }
  }, [value]);

  // Leaving the board with the field still focused keeps what was typed.
  useEffect(() => stop, []);

  return (
    <textarea
      ref={field}
      id={id}
      defaultValue={value}
      maxLength={MAX_DESCRIPTION_LENGTH}
      placeholder="Add more detail…"
      onFocus={(event) => {
        // Opened here, not in an effect, so that not even the first
        // keystroke can arrive before the field is tied to the text.
        const session = store.editCardDescription(cardId);
        if (!session) return;
        editing.current = {
          session,
          unbind: bindTextField(event.currentTarget, session),
        };
        setFocused(true);
      }}
      onBlur={() => {
        stop();
        setFocused(false);
      }}
      className="block min-h-28 w-full resize-none rounded-lg bg-zinc-50 px-3 py-2 text-sm field-sizing-content outline-offset-1 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-zinc-950"
    />
  );
}
