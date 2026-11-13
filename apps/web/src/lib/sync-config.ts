/**
 * Host of the sync server, without protocol. The default is where
 * `pnpm dev` runs it; a deployment sets NEXT_PUBLIC_SYNC_HOST.
 */
export const SYNC_HOST = process.env.NEXT_PUBLIC_SYNC_HOST ?? "127.0.0.1:8787";

export const DEMO_BOARD_ID = "demo";

// Automated tests give each test its own board (`/demo?board=test-...`) so
// that they do not share state. The sync server only creates such boards
// when it is started with ALLOW_TEST_BOARDS=1; this switch is its
// counterpart in the browser. Both are off in a normal build.
const ALLOW_TEST_BOARDS = process.env.NEXT_PUBLIC_ALLOW_TEST_BOARDS === "1";

const TEST_BOARD_ID = /^test-[A-Za-z0-9-]{1,60}$/;

/** The board a `/demo` URL refers to: the demo board unless a test asks otherwise. */
export function boardIdFromSearch(search: string): string {
  if (!ALLOW_TEST_BOARDS) return DEMO_BOARD_ID;

  const requested = new URLSearchParams(search).get("board");
  return requested && TEST_BOARD_ID.test(requested) ? requested : DEMO_BOARD_ID;
}
