"use client";

import {
  MAX_TITLE_LENGTH,
  type BoardStore,
  type CardView,
} from "@syncboard/core/board";
import { useId } from "react";
import { DescriptionField } from "./description-field";
import { CloseIcon } from "./icons";
import { InlineText } from "./inline-text";
import { ModalDialog } from "./modal-dialog";

interface CardDialogProps {
  store: BoardStore;
  card: CardView;
  /** The name of the column the card is in. */
  columnName: string;
  onDismiss: () => void;
}

/** A card opened on its own: its title and its description, both editable. */
export function CardDialog({
  store,
  card,
  columnName,
  onDismiss,
}: CardDialogProps) {
  const descriptionId = useId();
  const name = card.title || "Untitled card";

  return (
    <ModalDialog label={name} onDismiss={onDismiss}>
      <div data-card-dialog={card.id} className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-base font-semibold">
            <InlineText
              open={() => store.editCardTitle(card.id)}
              value={card.title}
              label={`Edit title: ${name}`}
              maxLength={MAX_TITLE_LENGTH}
              item={{ kind: "card", id: card.id }}
            />
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onDismiss}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 outline-offset-1 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="px-1 text-xs text-zinc-500">
          In <span className="font-medium">{columnName}</span>
        </p>

        <label
          htmlFor={descriptionId}
          className="mt-4 px-1 text-sm font-medium"
        >
          Description
        </label>
        <DescriptionField
          id={descriptionId}
          store={store}
          cardId={card.id}
          value={card.description}
        />
      </div>
    </ModalDialog>
  );
}
