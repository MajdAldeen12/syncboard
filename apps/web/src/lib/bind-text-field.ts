import {
  diffText,
  shiftIndex,
  type TextSession,
} from "@syncboard/core/text-binding";

type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Ties a text field to a piece of shared text for as long as it is edited.
 *
 * What is typed goes into the session keystroke by keystroke. What other
 * people type in the same text shows up in the field, and the caret stays on
 * the character it was on. Returns a function that unties the two; ending
 * the session is up to the caller.
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

  function onInput(): void {
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
      field.value = kept;
      shown = kept;
      field.setSelectionRange(caret, caret);
    }
  }

  const stopListening = session.subscribe((splices) => {
    const text = session.getText();
    if (text === field.value) {
      shown = text;
      return;
    }

    let start = field.selectionStart ?? text.length;
    let end = field.selectionEnd ?? start;
    const direction = field.selectionDirection ?? undefined;
    for (const splice of splices) {
      start = shiftIndex(start, splice);
      end = shiftIndex(end, splice);
    }

    field.value = text;
    shown = text;
    // Assigning the value moved the caret to the end; put it back. An
    // unfocused field has no caret worth keeping.
    if (document.activeElement === field) {
      field.setSelectionRange(start, end, direction);
    }
  });

  field.addEventListener("input", onInput);
  return () => {
    field.removeEventListener("input", onInput);
    stopListening();
  };
}
