import { expect, test, type Page } from "@playwright/test";
import {
  addCard,
  boardUrl,
  card,
  cardsIn,
  newBoardId,
  openBoard,
  syncIndicator,
} from "./helpers";
import { SYNC_HOST } from "./ports";

const LAST_CARD = "Open the demo board";
const SOCKETS = /\/parties\//;

/** The code the sync server closes a connection to `boardId` with. */
function closeCode(page: Page, boardId: string): Promise<number> {
  return page.evaluate(
    (url) =>
      new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.onclose = (event) => resolve(event.code);
        setTimeout(
          () => reject(new Error("The socket was not closed.")),
          10_000,
        );
      }),
    `ws://${SYNC_HOST}/parties/board/${boardId}`,
  );
}

test.describe("two browsers", () => {
  test("stay in sync through the server", async ({ page, browser }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    // A second context shares nothing with the first: no storage, and no
    // direct channel between tabs. Only the server connects them.
    const otherBrowser = await browser.newContext();
    const other = await otherBrowser.newPage();
    await openBoard(other, boardId);

    await addCard(page, "Done", "From the first browser");
    await expect
      .poll(() => cardsIn(other, "Done"))
      .toEqual([LAST_CARD, "From the first browser"]);

    await addCard(other, "Review", "From the second browser");
    await expect
      .poll(() => cardsIn(page, "Review"))
      .toContain("From the second browser");

    await otherBrowser.close();
  });

  test("merge the edits each made while offline", async ({
    page,
    context,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const otherBrowser = await browser.newContext();
    const other = await otherBrowser.newPage();
    await openBoard(other, boardId);

    await context.setOffline(true);
    await otherBrowser.setOffline(true);
    for (const tab of [page, other]) {
      await expect(syncIndicator(tab)).toHaveAttribute(
        "data-sync-status",
        "offline",
      );
    }

    await addCard(page, "Done", "Offline in the first");
    await addCard(other, "Done", "Offline in the second");
    await expect(syncIndicator(page)).toContainText("kept on this device");
    expect(await cardsIn(page, "Done")).toEqual([
      LAST_CARD,
      "Offline in the first",
    ]);
    expect(await cardsIn(other, "Done")).toEqual([
      LAST_CARD,
      "Offline in the second",
    ]);

    await context.setOffline(false);
    await otherBrowser.setOffline(false);

    for (const tab of [page, other]) {
      await expect
        .poll(async () => (await cardsIn(tab, "Done")).sort(), {
          timeout: 20_000,
        })
        .toEqual(
          [LAST_CARD, "Offline in the first", "Offline in the second"].sort(),
        );
      await expect(syncIndicator(tab)).toHaveAttribute(
        "data-sync-status",
        "synced",
      );
    }
    // Both browsers put the two cards in the same order.
    expect(await cardsIn(page, "Done")).toEqual(await cardsIn(other, "Done"));

    await otherBrowser.close();
  });
});

test.describe("this device's copy", () => {
  test("opens the board when the server cannot be reached", async ({
    page,
  }) => {
    await openBoard(page);
    await addCard(page, "Done", "Saved on this device");
    await expect(card(page, "Saved on this device")).toBeVisible();

    // From here on the server drops every connection from this page.
    await page.routeWebSocket(SOCKETS, (socket) => socket.close());
    await page.reload();

    await expect(card(page, "Saved on this device")).toBeVisible();
    await expect(syncIndicator(page)).toHaveAttribute(
      "data-sync-status",
      "offline",
    );
  });

  test("a first visit without the server says so and shows no board", async ({
    page,
  }) => {
    await page.routeWebSocket(SOCKETS, (socket) => socket.close());
    await page.goto(boardUrl(newBoardId()));

    await expect(
      page.locator('[data-board-state="unavailable"]'),
    ).toHaveAttribute("data-reason", "offline");
    await expect(page.locator("[data-column-id]")).toHaveCount(0);
  });
});

test.describe("the server's storage", () => {
  test("a room that everyone left serves what was saved", async ({
    page,
    browser,
  }) => {
    test.slow();
    const boardId = newBoardId();
    await openBoard(page, boardId);
    await addCard(page, "Done", "Saved before everyone left");
    await expect(card(page, "Saved before everyone left")).toBeVisible();
    await page.close();

    // The server saves two seconds after the last change and drops an idle
    // room from memory about ten seconds later. Wait for both, so that the
    // next visitor is served from storage by a room started from nothing.
    await new Promise((resolve) => setTimeout(resolve, 14_000));

    const later = await browser.newContext();
    const visitor = await later.newPage();
    await openBoard(visitor, boardId);

    expect(await cardsIn(visitor, "Done")).toEqual([
      LAST_CARD,
      "Saved before everyone left",
    ]);
    await later.close();
  });

  test("a board whose storage is down is refused, not served empty", async ({
    page,
  }) => {
    // The test server fails every load of a board named test-fail-*.
    const boardId = `test-fail-${crypto.randomUUID().slice(0, 8)}`;
    await page.goto(boardUrl(boardId));

    await expect(
      page.locator('[data-board-state="unavailable"]'),
    ).toHaveAttribute("data-reason", "storage-unavailable");
    await expect(page.locator("[data-column-id]")).toHaveCount(0);
    expect(await closeCode(page, boardId)).toBe(4503);
  });

  test("a board that does not exist is refused", async ({ page }) => {
    await page.goto("/");

    expect(await closeCode(page, "no-such-board")).toBe(4404);
  });
});
