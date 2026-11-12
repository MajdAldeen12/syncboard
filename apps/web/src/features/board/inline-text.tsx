"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

const FIELD_CLASS =
  "block w-full rounded bg-white px-1 py-0.5 text-inherit outline-2 outline-blue-600 dark:bg-zinc-950";

interface TextEditorProps {
  value: string;
  /** Accessible name of the field. */
  label: string;
  maxLength: number;
  /** Wraps long text and grows with it. Enter still saves. */
  multiline?: boolean;
  /**
   * Called once when editing ends. `text` is null if the edit was discarded.
   * `endedBy` tells the caller whether to hand keyboard focus back.
   */
  onDone: (text: string | null, endedBy: "keyboard" | "blur") => void;
}

/**
 * A text field that edits one value. Enter or leaving the field saves;
 * Escape discards.
 */
export function TextEditor({
  value,
  label,
  maxLength,
  multiline = false,
  onDone,
}: TextEditorProps) {
  const [draft, setDraft] = useState(value);
  // Removing the field can fire a late blur. Report the outcome only once.
  const done = useRef(false);

  function finish(text: string | null, endedBy: "keyboard" | "blur") {
    if (done.current) return;
    done.current = true;
    onDone(text, endedBy);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Keep keystrokes away from the drag-and-drop keyboard handling.
    event.stopPropagation();

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish(draft, "keyboard");
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(null, "keyboard");
    }
  }

  const fieldProps = {
    "aria-label": label,
    value: draft,
    maxLength,
    autoFocus: true,
    onKeyDown,
    onBlur: () => finish(draft, "blur"),
  };

  return multiline ? (
    <textarea
      {...fieldProps}
      rows={1}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      className={`${FIELD_CLASS} field-sizing-content resize-none`}
    />
  ) : (
    <input
      {...fieldProps}
      type="text"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      className={FIELD_CLASS}
    />
  );
}

/**
 * Focuses `target` when `editing` turns off after the caller asked for it.
 * Used so that finishing an edit from the keyboard leaves focus somewhere
 * useful instead of dropping it on the page.
 */
export function useFocusAfterEdit<T extends HTMLElement>(
  editing: boolean,
): [targetRef: RefObject<T | null>, requestFocus: () => void] {
  const targetRef = useRef<T>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!editing && requested.current) {
      requested.current = false;
      targetRef.current?.focus();
    }
  }, [editing]);

  const requestFocus = useCallback(() => {
    requested.current = true;
  }, []);

  return [targetRef, requestFocus];
}

interface InlineTextProps {
  value: string;
  /** Accessible name for the edit button and the field, e.g. "Rename column Todo". */
  label: string;
  maxLength: number;
  onCommit: (value: string) => void;
}

/** Text that turns into a field when clicked. */
export function InlineText({
  value,
  label,
  maxLength,
  onCommit,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [buttonRef, requestFocus] =
    useFocusAfterEdit<HTMLButtonElement>(editing);

  if (editing) {
    return (
      <TextEditor
        value={value}
        label={label}
        maxLength={maxLength}
        onDone={(text, endedBy) => {
          if (text !== null) onCommit(text);
          if (endedBy === "keyboard") requestFocus();
          setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      onClick={() => setEditing(true)}
      className="block w-full cursor-text rounded px-1 py-0.5 text-left wrap-break-word outline-offset-1 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-white/10"
    >
      {value}
    </button>
  );
}
