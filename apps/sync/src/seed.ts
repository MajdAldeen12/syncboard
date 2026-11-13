import { createSeedBoard } from "@syncboard/core/board";
import { encodeBoardState } from "@syncboard/core/board-doc";

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

  return encodeBoardState(createSeedBoard());
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
