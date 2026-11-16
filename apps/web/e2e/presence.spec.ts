import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  FIRST_CARD,
  activityOn,
  addCard,
  card,
  centre,
  column,
  cursorOf,
  cursorTip,
  newBoardId,
  openBoard,
  ownName,
  people,
  pickUp,
  silence,
} from "./helpers";

const LAST_CARD = "Open the demo board";
const PEOPLE_LIST = { name: "People on this board" };

/** Presence messages are Yjs awareness messages: binary, first byte 1. */
const isPresence = (payload: string | Buffer) =>
  typeof payload !== "string" && payload[0] === 1;

/** Counts what a page sends to the sync server. Call before the page loads. */
function countSent(page: Page) {
  const sent = { all: 0, presence: 0 };
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/parties/")) return;
    socket.on("framesent", ({ payload }) => {
      sent.all += 1;
      if (isPresence(payload)) sent.presence += 1;
    });
  });
  return sent;
}

/**
 * A second browser on the same board. It shares nothing with the first: no
 * storage, so it is another guest, and no direct channel between tabs, so
 * only the server connects the two.
 */
async function join(
  browser: Browser,
  boardId: string,
  viewport?: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page; name: string }> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await openBoard(page, boardId);
  return { context, page, name: await ownName(page) };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How far another person's pointer is drawn from the middle of a card. */
async function distanceFromCard(
  page: Page,
  name: string,
  title: string,
): Promise<number> {
  const box = await cursorOf(page, name).boundingBox();
  if (!box) return Infinity;
  const middle = await centre(card(page, title));
  return Math.hypot(box.x - middle.x, box.y - middle.y);
}

test.describe("who is here", () => {
  test("a browser gets a name and keeps it on a return visit", async ({
    page,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);

    const me = people(page);
    await expect(me).toHaveCount(1);
    await expect(me).toHaveAttribute("data-self", "true");
    const name = await ownName(page);
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    const colour = await me.getAttribute("data-user-color");
    expect(colour).toMatch(/^#[0-9a-f]{6}$/);

    await page.reload();
    await openBoard(page, boardId);

    expect(await ownName(page)).toBe(name);
    await expect(people(page)).toHaveAttribute("data-user-color", colour!);
  });

  test("avatars appear when someone joins and go when they leave", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const myName = await ownName(page);
    await expect(people(page)).toHaveCount(1);

    const other = await join(browser, boardId);

    await expect(people(page)).toHaveCount(2);
    await expect(page.getByRole("list", PEOPLE_LIST)).toContainText(other.name);
    // Each sees themselves first.
    await expect(people(other.page).first()).toHaveAttribute(
      "data-user-name",
      other.name,
    );
    await expect(people(other.page).nth(1)).toHaveAttribute(
      "data-user-name",
      myName,
    );

    // Leaving the page the ordinary way.
    await other.page.goto("about:blank");

    await expect(people(page)).toHaveCount(1);
    await other.context.close();
  });

  test("an avatar goes when a tab is closed without warning", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);
    await expect(people(page)).toHaveCount(2);

    // The tab cannot say goodbye. The server has to notice the connection
    // ending and tell everyone else.
    await silence(other.page);
    await other.context.close();

    await expect(people(page)).toHaveCount(1);
  });

  test("two tabs of one browser are one person with two pointers", async ({
    page,
    context,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const secondTab = await context.newPage();
    await openBoard(secondTab, boardId);

    // The same guest in both tabs, so one avatar...
    const name = await ownName(page);
    expect(await ownName(secondTab)).toBe(name);
    await expect(people(page)).toHaveCount(1);
    await expect(people(secondTab)).toHaveCount(1);

    // ...but the other tab's pointer is still shown.
    const target = await centre(card(secondTab, FIRST_CARD));
    await secondTab.mouse.move(target.x, target.y);
    await expect(cursorOf(page, name)).toHaveCount(1);
  });

  test("presence survives the room going to sleep", async ({
    page,
    browser,
  }) => {
    test.slow();
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const second = await join(browser, boardId);
    await expect(people(page)).toHaveCount(2);

    // Nobody does anything. The server drops an idle room from memory after
    // about ten seconds and builds it again when the next person connects.
    await pause(14_000);
    const third = await join(browser, boardId);

    // The newcomer is told about the two who were there all along...
    await expect(people(third.page)).toHaveCount(3);
    for (const name of [await ownName(page), second.name]) {
      await expect(third.page.getByRole("list", PEOPLE_LIST)).toContainText(
        name,
      );
    }
    // ...and they about the newcomer.
    await expect(people(page)).toHaveCount(3);

    // Asleep again, a tab dies. The room wakes up for nothing but that, and
    // still knows who it was.
    await pause(14_000);
    await silence(second.page);
    await second.context.close();

    await expect(people(page)).toHaveCount(2);
    await expect(people(third.page)).toHaveCount(2);
    await third.context.close();
  });
});

test.describe("cursors", () => {
  test("another browser's pointer is drawn where it points", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);
    await expect(cursorOf(page, other.name)).toHaveCount(0);

    const target = await centre(card(other.page, FIRST_CARD));
    await other.page.mouse.move(target.x, target.y);

    // Same window size, same layout: the same spot on the same card.
    await expect
      .poll(() => distanceFromCard(page, other.name, FIRST_CARD))
      .toBeLessThan(3);
    await expect(cursorOf(page, other.name)).toContainText(other.name);
    // Nobody is shown their own pointer.
    await expect(cursorOf(other.page, other.name)).toHaveCount(0);

    await other.context.close();
  });

  test("the pointer lands on the same card in a smaller, scrolled window", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const myName = await ownName(page);
    // A narrow window: the last column is off to the right.
    const other = await join(browser, boardId, { width: 520, height: 600 });

    // The narrow window scrolls to the last column and points at its card.
    const theirCard = card(other.page, LAST_CARD);
    await theirCard.scrollIntoViewIfNeeded();
    const there = await centre(theirCard);
    const here = await centre(card(page, LAST_CARD));
    // The card really is somewhere else on the two screens.
    expect(Math.abs(there.x - here.x)).toBeGreaterThan(100);
    await other.page.mouse.move(there.x, there.y);

    await expect
      .poll(() => distanceFromCard(page, other.name, LAST_CARD))
      .toBeLessThan(3);

    // And the other way round: pointing from the wide window at a card the
    // narrow one has scrolled to.
    await page.mouse.move(here.x, here.y);
    await expect
      .poll(() => distanceFromCard(other.page, myName, LAST_CARD))
      .toBeLessThan(3);

    await other.context.close();
  });

  test("the pointer finds its card in a column that has scrolled", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    // Enough cards that the column scrolls in a short window but not here.
    // The form stays open after each card, so the rest are typed into it.
    await addCard(page, "Backlog", "Extra card 1");
    for (let number = 2; number <= 6; number += 1) {
      await column(page, "Backlog")
        .getByRole("textbox", { name: "Card title" })
        .fill(`Extra card ${number}`);
      await page.keyboard.press("Enter");
    }
    const lowest = "Extra card 6";
    await expect(card(page, lowest)).toBeVisible();
    await page.keyboard.press("Escape");

    const other = await join(browser, boardId, { width: 1280, height: 420 });
    const theirCard = card(other.page, lowest);
    await theirCard.scrollIntoViewIfNeeded();
    const there = await centre(theirCard);
    const here = await centre(card(page, lowest));
    // The column scrolled there and not here, so the card is at another
    // height on the two screens.
    expect(Math.abs(there.y - here.y)).toBeGreaterThan(50);

    await other.page.mouse.move(there.x, there.y);

    await expect
      .poll(() => distanceFromCard(page, other.name, lowest))
      .toBeLessThan(3);

    await other.context.close();
  });

  test("a pointer over the bare board is placed from the board's corner", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId, { width: 520, height: 600 });

    // A spot under the "Add a column" button: no card, no column. In the
    // narrow window it only comes into view by scrolling.
    const spotBelow = async (tab: Page) => {
      const box = await tab
        .getByRole("button", { name: "Add a column" })
        .boundingBox();
      if (!box) throw new Error("The button is not visible");
      return { x: box.x + 20, y: box.y + box.height + 60 };
    };
    await other.page
      .getByRole("button", { name: "Add a column" })
      .scrollIntoViewIfNeeded();
    const there = await spotBelow(other.page);
    const here = await spotBelow(page);
    expect(Math.abs(there.x - here.x)).toBeGreaterThan(100);

    await other.page.mouse.move(there.x, there.y);

    await expect
      .poll(async () => {
        const box = await cursorOf(page, other.name).boundingBox();
        return box ? Math.hypot(box.x - here.x, box.y - here.y) : Infinity;
      })
      .toBeLessThan(3);

    await other.context.close();
  });

  test("the pointer stays on its card while this window scrolls", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await page.setViewportSize({ width: 520, height: 600 });
    await openBoard(page, boardId);
    const other = await join(browser, boardId);

    const target = await centre(card(other.page, FIRST_CARD));
    await other.page.mouse.move(target.x, target.y);
    await expect
      .poll(() => distanceFromCard(page, other.name, FIRST_CARD))
      .toBeLessThan(3);

    // Scroll this window sideways by a known amount, so that the card is
    // still partly in view. Nothing new arrives from the other browser.
    const before = await centre(card(page, FIRST_CARD));
    await page
      .locator("[data-board-scroll]")
      .evaluate((board) => board.scrollBy({ left: 120 }));
    await expect
      .poll(async () => (await centre(card(page, FIRST_CARD))).x)
      .toBeCloseTo(before.x - 120, 0);

    await expect
      .poll(() => distanceFromCard(page, other.name, FIRST_CARD))
      .toBeLessThan(3);

    await other.context.close();
  });

  test("the pointer goes when it leaves the board", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);
    const target = await centre(card(other.page, FIRST_CARD));
    await other.page.mouse.move(target.x, target.y);
    await expect(cursorOf(page, other.name)).toHaveCount(1);

    // Up into the page header, off the board.
    await other.page.mouse.move(40, 10);

    await expect(cursorOf(page, other.name)).toHaveCount(0);
    await other.context.close();
  });

  test("the pointer moves smoothly between the positions it is sent", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);
    const moverSent = { presence: 0 };
    // The mover is already connected, so its socket is watched through the
    // browser's debugging protocol instead of Playwright's own events.
    const debug = await other.context.newCDPSession(other.page);
    await debug.send("Network.enable");
    debug.on("Network.webSocketFrameSent", () => {
      moverSent.presence += 1;
    });

    const from = await centre(card(other.page, FIRST_CARD));
    await other.page.mouse.move(from.x, from.y);
    await expect
      .poll(() => distanceFromCard(page, other.name, FIRST_CARD))
      .toBeLessThan(3);

    // Record where the pointer is drawn on every frame from here on.
    await page.evaluate((name) => {
      const xs: number[] = [];
      (window as unknown as { cursorXs: number[] }).cursorXs = xs;
      const sample = () => {
        const cursor = document.querySelector(
          `[data-presence-cursor][data-user-name="${name}"]`,
        );
        if (cursor) xs.push(cursor.getBoundingClientRect().x);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, other.name);
    const sentBefore = moverSent.presence;

    // A steady sweep to the right: 600 px in a second and a half or so.
    for (let step = 1; step <= 60; step += 1) {
      await other.page.mouse.move(from.x + step * 10, from.y);
      await pause(20);
    }
    const start = (await centre(card(page, FIRST_CARD))).x;
    await expect
      .poll(async () => (await cursorTip(page, other.name)).x)
      .toBeGreaterThan(start + 590);

    const messages = moverSent.presence - sentBefore;
    const xs = await page.evaluate(
      () => (window as unknown as { cursorXs: number[] }).cursorXs,
    );
    // Only the frames of the sweep: from the first movement to the last.
    const changed = (x: number, index: number) =>
      index > 0 && x !== xs[index - 1];
    const moving = xs.slice(
      xs.findIndex(changed) - 1,
      xs.findLastIndex(changed) + 1,
    );
    const steps = moving.slice(1).map((x, index) => x - moving[index]!);

    // Drawn only where it was sent, the pointer would stand still for three
    // frames out of four and then jump. Drawn smoothly it moves on nearly
    // every frame, through far more places than there were messages.
    expect(messages).toBeGreaterThan(10);
    expect(new Set(moving).size).toBeGreaterThan(messages * 1.5);
    expect(steps.filter((step) => step !== 0).length).toBeGreaterThan(
      steps.length * 0.8,
    );
    // Never backwards, and never a leap.
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...steps)).toBeLessThan(60);

    await other.context.close();
  });

  test("pointer traffic is limited to about 15 messages a second and stops when the pointer does", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    const watcherSent = countSent(page);
    await openBoard(page, boardId);

    const context = await browser.newContext();
    const mover = await context.newPage();
    const moverSent = countSent(mover);
    await openBoard(mover, boardId);
    const name = await ownName(mover);
    await expect(people(page)).toHaveCount(2);
    await pause(500);

    // Move as fast as the browser will take it, for three seconds.
    const start = await centre(card(mover, FIRST_CARD));
    const before = { mover: moverSent.presence, watcher: watcherSent.all };
    const began = Date.now();
    let moves = 0;
    while (Date.now() - began < 3_000) {
      moves += 1;
      await mover.mouse.move(
        start.x + (moves % 200),
        start.y + ((moves * 7) % 150),
      );
    }
    const elapsed = Date.now() - began;
    const whileMoving = moverSent.presence - before.mover;

    // Several moves for every message, and the messages at about 15 a
    // second.
    expect(moves).toBeGreaterThan(whileMoving * 2);
    expect(whileMoving).toBeLessThanOrEqual(Math.ceil(elapsed / 66) + 1);
    expect(whileMoving).toBeGreaterThan((elapsed / 66) * 0.6);
    await expect(cursorOf(page, name)).toHaveCount(1);

    // Let the last position go out, then keep still.
    await pause(300);
    const settled = moverSent.all;
    await pause(3_000);

    // A still pointer sends nothing at all, of any kind.
    expect(moverSent.all - settled).toBe(0);
    // And the one watching never sent anything: what it was told about the
    // other pointer did not go back to the server.
    expect(watcherSent.all - before.watcher).toBe(0);

    await context.close();
  });
});

test.describe("what people are doing", () => {
  test("a card someone else is editing says who", async ({ page, browser }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);

    await card(other.page, FIRST_CARD).dblclick();
    await expect(
      other.page.getByRole("textbox", { name: `Edit card: ${FIRST_CARD}` }),
    ).toBeFocused();

    const tag = activityOn(card(page, FIRST_CARD));
    await expect(tag).toHaveText(`${other.name} is editing`);
    await expect(tag).toHaveAttribute("data-presence-activity", "editing");
    // Only that card, and not on the editor's own screen.
    await expect(page.locator("[data-presence-activity]")).toHaveCount(1);
    await expect(other.page.locator("[data-presence-activity]")).toHaveCount(0);

    await other.page.keyboard.press("Escape");

    await expect(tag).toHaveCount(0);
    await other.context.close();
  });

  test("the tag goes if the person editing closes the tab", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);
    await card(other.page, FIRST_CARD).dblclick();
    await expect(activityOn(card(page, FIRST_CARD))).toHaveCount(1);

    await silence(other.page);
    await other.context.close();

    await expect(page.locator("[data-presence-activity]")).toHaveCount(0);
  });

  test("a column whose title someone else is editing says who", async ({
    page,
    browser,
  }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);

    await other.page
      .getByRole("button", { name: "Rename column Backlog" })
      .click();

    const tag = page.locator(
      '[data-presence-activity][data-presence-item="column"]',
    );
    await expect(tag).toHaveText(`${other.name} is editing`);
    await expect(column(page, "Backlog").locator(tag)).toHaveCount(1);

    await other.page.keyboard.press("Enter");

    await expect(page.locator("[data-presence-activity]")).toHaveCount(0);
    await other.context.close();
  });

  test("a card someone else is holding says who", async ({ page, browser }) => {
    const boardId = newBoardId();
    await openBoard(page, boardId);
    const other = await join(browser, boardId);

    await card(other.page, FIRST_CARD).focus();
    await pickUp(other.page, FIRST_CARD);

    const tag = activityOn(card(page, FIRST_CARD));
    await expect(tag).toHaveText(`${other.name} is moving this`);
    await expect(tag).toHaveAttribute("data-presence-activity", "dragging");

    await other.page.keyboard.press("Escape");

    await expect(tag).toHaveCount(0);
    await other.context.close();
  });
});
