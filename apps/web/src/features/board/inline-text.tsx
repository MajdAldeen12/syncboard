"use client";

import type { TextSession } from "@syncboard/core/text-binding";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { bindTextField } from "@/lib/bind-text-field";

const FIELD_CLASS =
  "block w-full rounded bg-white px-1 py-0.5 text-inherit outline-2 outline-blue-600 dark:bg-zinc-950";

interface TextEditorProps {
  /** Starts the editing session. Null if the text no longer exists. */
  open: () => TextSession | null;
  /** The text when editing starts. */
  value: string;
  /** Accessible name of the field. */
  label: string;
  maxLength: number;
  /** Wraps long text and grows with it. Enter still saves. */
  multiline?: boolean;
  /**
   * Called once when editing ends. `endedBy` tells the caller whether to
   * hand keyboard focus back.
   */
  onDone: (endedBy: "keyboard" | "blur") => void;
}

/**
 * A text field that edits shared text. What is typed is saved, and seen by
 * other people, as it is typed. Enter or leaving the field ends the edit;
 * Escape takes it back.
 */
export function TextEditor({
  open,
  value,
  label,
  maxLength,
  multiline = false,
  onDone,
}: TextEditorProps) {
  // The field keeps the name and the text it opened with. The text is driven
  // by the session from then on, and a name that followed the text would
  // change under a screen reader on every keystroke.
  const [opened] = useState({ value, label });
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const session = useRef<TextSession | null>(null);
  // Removing the field can fire a late blur. Report the outcome only once.
  const done = useRef(false);

  function finish(how: "keep" | "discard", endedBy: "keyboard" | "blur") {
    if (done.current) return;
    done.current = true;
    if (how === "keep") session.current?.commit();
    else session.current?.cancel();
    onDone(endedBy);
  }

  const openSession = useEffectEvent(open);
  const giveUp = useEffectEvent(() => finish("keep", "blur"));

  useEffect(() => {
    const current = openSession();
    if (!field.current || !current) {
      // The card or column was deleted just before the field opened.
      giveUp();
      return;
    }

    session.current = current;
    const unbind = bindTextField(field.current, current);
    return () => {
      unbind();
      // Does nothing if Enter, Escape or blur already ended the session.
      current.commit();
      session.current = null;
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Keep keystrokes away from the drag-and-drop keyboard handling.
    event.stopPropagation();
    // Enter and Escape that confirm or dismiss an input method's suggestion
    // are not meant for the field.
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish("keep", "keyboard");
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish("discard", "keyboard");
    }
  }

  const fieldProps = {
    "aria-label": opened.label,
    defaultValue: opened.value,
    maxLength,
    autoFocus: true,
    onKeyDown,
    onBlur: () => finish("keep", "blur"),
  };

  return multiline ? (
    <textarea
      {...fieldProps}
      ref={(element) => {
        field.current = element;
      }}
      rows={1}
      onFocus={(event) => event.target.select()}
      className={`${FIELD_CLASS} field-sizing-content resize-none`}
    />
  ) : (
    <input
      {...fieldProps}
      ref={(element) => {
        field.current = element;
      }}
      type="text"
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
  /** Starts an editing session on the text. Null if it no longer exists. */
  open: () => TextSession | null;
  value: string;
  /** Accessible name for the edit button and the field, e.g. "Rename column Todo". */
  label: string;
  maxLength: number;
}

/** Text that turns into a field when clicked. */
export function InlineText({ open, value, label, maxLength }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [buttonRef, requestFocus] =
    useFocusAfterEdit<HTMLButtonElement>(editing);

  if (editing) {
    return (
      <TextEditor
        open={open}
        value={value}
        label={label}
        maxLength={maxLength}
        onDone={(endedBy) => {
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
      {value || <span className="text-zinc-400">Untitled</span>}
    </button>
  );
}
