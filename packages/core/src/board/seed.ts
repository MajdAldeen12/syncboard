import { initialOrders } from "../ordering/index";
import type { BoardState, CardRecord, ColumnRecord } from "./types";

const SEED: readonly { title: string; cards: readonly string[] }[] = [
  {
    title: "Backlog",
    cards: [
      "Drag this card to another column",
      "Press Space on a card, then use the arrow keys to move it",
      "Double-click a card to edit its text",
    ],
  },
  {
    title: "In progress",
    cards: [
      "Click a column title to rename it",
      "Add a card with the button below",
    ],
  },
  { title: "Review", cards: ["Drag a column by its handle to reorder it"] },
  { title: "Done", cards: ["Open the demo board"] },
];

/**
 * The content of a fresh demo board.
 *
 * Ids and order keys are fixed, so the board comes out identical wherever it
 * is built: on the server, in the browser, or when the demo is reset.
 */
export function createSeedBoard(): BoardState {
  const columns: Record<string, ColumnRecord> = {};
  const cards: Record<string, CardRecord> = {};
  const columnOrders = initialOrders(SEED.length);

  SEED.forEach((column, columnIndex) => {
    const columnId = `seed-column-${columnIndex + 1}`;
    columns[columnId] = {
      title: column.title,
      order: columnOrders[columnIndex]!,
    };

    const cardOrders = initialOrders(column.cards.length);
    column.cards.forEach((title, cardIndex) => {
      cards[`${columnId}-card-${cardIndex + 1}`] = {
        columnId,
        order: cardOrders[cardIndex]!,
        title,
        description: "",
      };
    });
  });

  return { title: "Demo board", columns, cards };
}
