import {
  diffText,
  rebaseSplice,
  shiftIndex,
  type TextSession,
  type TextSplice,
} from "@syncboard/core/text-binding";

type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Ties a text field to a piece of shared text for as long as it is edited.
 *
 * What is typed goes into the session keystroke by keystroke. What other
 * people type in the same text shows up in the field, and the caret stays on
 * the character it was on. Returns a function that unties the two; ending
 * the session is up to the caller.
 *
 * While an input method is composing (Japanese, Chinese or Korean, say) the
 * field is left alone in both directions: the half-composed word is not sent,
 * and other people's edits wait, because changing the field's value would
 * throw the composition away. When it is committed, the word is carried over
 * the edits that waited and both go in.
 */
export function bindTextField(
  field: TextField,
  session: TextSession,
): () => void {
  // The text as the field last showed it. Diffing against it tells what a
  // keystroke changed.
  let shown = session.getText();
  // Assigning the value drops the selection, so only do it when needed.
  if (field.value !== shown) field.value = shown;

  let composing = false;
  // Other people's edits that arrived during a composition, in order.
  let waiting: TextSplice[] = [];

  /** Shows the session's text, with the caret at `start`–`end`. */
  function show(
    start: number,
    end = start,
    direction?: "forward" | "backward" | "none",
  ) {
    const text = session.getText();
    shown = text;
    if (field.value === text) return;
    field.value = text;
    // Assigning the value moved the caret to the end; put it back. An
    // unfocused field has no caret worth keeping.
    if (document.activeElement === field) {
      field.setSelectionRange(
        Math.min(start, text.length),
        Math.min(end, text.length),
        direction,
      );
    }
  }

  function onInput(event: Event): void {
    if (composing || (event as InputEvent).isComposing) return;
    const typed = field.value;
    const edit = diffText(shown, typed, field.selectionStart ?? undefined);
    shown = typed;
    if (!edit) return;

    session.splice(edit.index, edit.remove, edit.insert);

    // The session may have cut the edit short, to keep the text within its
    // maximum length. Show what was actually kept.
    const kept = session.getText();
    if (kept !== typed) {
      const caret = Math.min(field.selectionStart ?? kept.length, kept.length);
      show(caret);
    }
  }

  function onCompositionStart(): void {
    composing = true;
    waiting = [];
  }

  function onCompositionEnd(): void {
    composing = false;
    const arrived = waiting;
    waiting = [];

    // What the composition changed, against the text before it began, and
    // carried over whatever arrived meanwhile.
    const edit = diffText(
      shown,
      field.value,
      field.selectionStart ?? undefined,
    );
    if (edit) {
      const moved = rebaseSplice(edit, arrived);
      session.splice(moved.index, moved.remove, moved.insert);
      show(moved.index + moved.insert.length);
      return;
    }

    // Nothing was composed after all. Catch up with what arrived.
    let start = field.selectionStart ?? shown.length;
    let end = field.selectionEnd ?? start;
    for (const splice of arrived) {
      start = shiftIndex(start, splice);
      end = shiftIndex(end, splice);
    }
    show(start, end);
  }

  const stopListening = session.subscribe((splices) => {
    if (composing) {
      waiting.push(...splices);
      return;
    }

    let start = field.selectionStart ?? shown.length;
    let end = field.selectionEnd ?? start;
    for (const splice of splices) {
      start = shiftIndex(start, splice);
      end = shiftIndex(end, splice);
    }
    show(start, end, field.selectionDirection ?? undefined);
  });

  field.addEventListener("input", onInput);
  field.addEventListener("compositionstart", onCompositionStart);
  field.addEventListener("compositionend", onCompositionEnd);
  return () => {
    field.removeEventListener("input", onInput);
    field.removeEventListener("compositionstart", onCompositionStart);
    field.removeEventListener("compositionend", onCompositionEnd);
    stopListening();
  };
}
