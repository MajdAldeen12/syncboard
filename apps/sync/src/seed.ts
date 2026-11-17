import {
  createSeedBoard,
  type BoardState,
  type CardRecord,
  type ColumnRecord,
} from "@syncboard/core/board";
import { encodeBoardState } from "@syncboard/core/board-doc";
import { initialOrders } from "@syncboard/core/ordering";

/** The one board that exists without being created by anyone. */
export const DEMO_BOARD_ID = "demo";

export interface TestBoardOptions {
  /**
   * Lets automated tests use throwaway boards named `test-*`, each starting
   * from the demo content, so tests do not share state. Off unless the
   * server is started with `ALLOW_TEST_BOARDS=1`. Never on in production.
   */
  readonly allowTestBoards: boolean;
}

/**
 * Starting content for boards that come into being on first visit: the demo
 * board, and test boards when those are switched on. Null for everything
 * else, which means "this board does not exist".
 *
 * The bytes are the same every time. Yjs merges two copies of the same
 * update cleanly, which is what lets a device holding an old copy of a board
 * meet a room that was seeded again.
 */
export function seedFor(
  boardId: string,
  options: TestBoardOptions,
): Uint8Array | null {
  const isTestBoard = options.allowTestBoards && boardId.startsWith("test-");
  if (boardId !== DEMO_BOARD_ID && !isTestBoard) return null;

  if (isTestBoard && boardId.startsWith("test-large-")) {
    return encodeBoardState(largeBoard());
  }
  return encodeBoardState(createSeedBoard());
}

/**
 * Four columns of 50 cards, for measuring how the board copes with many
 * cards. Test boards named `test-large-*` start with it.
 */
function largeBoard(): BoardState {
  const columns: Record<string, ColumnRecord> = {};
  const cards: Record<string, CardRecord> = {};
  const titles = ["Backlog", "In progress", "Review", "Done"];
  const columnOrders = initialOrders(titles.length);
  const cardOrders = initialOrders(50);

  titles.forEach((title, columnIndex) => {
    const columnId = `large-column-${columnIndex + 1}`;
    columns[columnId] = { title, order: columnOrders[columnIndex]! };
    cardOrders.forEach((order, cardIndex) => {
      cards[`${columnId}-card-${cardIndex + 1}`] = {
        columnId,
        order,
        title: `${title} task ${cardIndex + 1}`,
        description: "",
      };
    });
  });

  return { title: "Large board", columns, cards };
}

/**
 * Whether loading this board should fail on purpose. Only for tests of what
 * happens when storage is down: boards named `test-fail-*`, and only when
 * test boards are switched on.
 */
export function shouldFailLoad(
  boardId: string,
  options: TestBoardOptions,
): boolean {
  return options.allowTestBoards && boardId.startsWith("test-fail-");
}
