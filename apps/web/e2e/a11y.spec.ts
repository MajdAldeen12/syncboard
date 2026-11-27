import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_CARD,
  activityOn,
  card,
  column,
  cursorOf,
  newBoardId,
  openBoard,
  ownName,
  people,
  pickUp,
} from "./helpers";

// Automated accessibility checks with axe. They catch what can be caught
// mechanically: names, roles, contrast, ARIA misuse. They do not replace a
// person with a screen reader; docs/decisions/0006 says what was reviewed
// by hand.
//
// The M8 done check is "no serious or critical issues". Moderate and minor
// ones are printed so that they are seen, not hidden.

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

interface Issue {
  rule: string;
  impact: string;
  help: string;
  elements: string[];
}

/**
 * What axe finds on the page as it is now, and the text whose contrast it
 * could not check because something covered it.
 */
async function scan(
  page: Page,
): Promise<{ issues: Issue[]; covered: string[] }> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const issues = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    elements: violation.nodes.map((node) => node.target.join(" ")),
  }));
  const covered = results.incomplete
    .filter((result) => result.id === "color-contrast")
    .flatMap((result) => result.nodes)
    .filter((node) =>
      node.any.some((check) => /overlapped by another/.test(check.message)),
    )
    // Words drawn inside the landing page's SVG pictures sit on drawn
    // shapes, which axe cannot see through. Those pictures are labelled
    // images (or hidden); the real text around them is checked.
    .filter((node) => !/^<(text|tspan)[\s>]/.test(node.html))
    // A held card or column is lifted by dnd-kit into a layer whose order
    // axe does not work out; its shadow layer counts as covering its text.
    // The same text in the same colours is checked when it is not held.
    .filter((node) => !node.target.join(" ").includes("data-dnd-dragging"))
    .map((node) => node.target.join(" "));
  return { issues, covered };
}

/**
 * Fails on serious and critical issues; prints the rest. Also fails when
 * text could not be checked for contrast because something lies over it:
 * a full-board layer once hid the whole board from the contrast check, and
 * every scan passed without checking a thing. Pass `covered: "allowed"`
 * where other people's pointers really do lie over the board.
 */
async function expectNoSeriousIssues(
  page: Page,
  where: string,
  { covered = "fail" }: { covered?: "fail" | "allowed" } = {},
) {
  const { issues, covered: unchecked } = await scan(page);
  if (covered === "fail") {
    expect(
      unchecked,
      `text whose contrast axe could not check ${where}`,
    ).toEqual([]);
  }
  const serious = issues.filter(
    (issue) => issue.impact === "serious" || issue.impact === "critical",
  );
  const lesser = issues.filter((issue) => !serious.includes(issue));
  if (lesser.length > 0) {
    console.log(`axe, ${where}, lesser issues:`, JSON.stringify(lesser));
  }
  expect(serious, `serious or critical axe issues ${where}`).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the landing page has no serious issues", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousIssues(page, `on / (${colorScheme})`);
    });

    test("the board has no serious issues", async ({ page }) => {
      await openBoard(page);
      await expectNoSeriousIssues(page, `on /demo (${colorScheme})`);
    });

    test("the card dialog has no serious issues", async ({ page }) => {
      await openBoard(page);
      await card(page, FIRST_CARD).hover();
      await page
        .getByRole("button", { name: `Open card: ${FIRST_CARD}` })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoSeriousIssues(page, `in the card dialog (${colorScheme})`);
    });

    test("the delete-column dialog has no serious issues", async ({ page }) => {
      await openBoard(page);
      await column(page, "Backlog")
        .getByRole("button", { name: "Delete column Backlog" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoSeriousIssues(
        page,
        `in the confirm dialog (${colorScheme})`,
      );
    });
  });
}

test("a board with other people on it has no serious issues", async ({
  browser,
}) => {
  const boardId = newBoardId();
  const one = await browser.newContext();
  const two = await browser.newContext();
  try {
    const mine = await one.newPage();
    const theirs = await two.newPage();
    await openBoard(mine, boardId);
    await openBoard(theirs, boardId);
    await expect(people(mine)).toHaveCount(2);

    // They point at a card and start editing another one's title.
    const theirName = await ownName(theirs);
    await card(theirs, FIRST_CARD).hover();
    await expect(cursorOf(mine, theirName)).toBeVisible();
    await column(theirs, "Review")
      .getByRole("button", { name: "Rename column Review" })
      .click();
    await expect(activityOn(column(mine, "Review"))).toBeVisible();

    await expectNoSeriousIssues(mine, "with someone else on the board", {
      covered: "allowed",
    });
  } finally {
    await one.close();
    await two.close();
  }
});

test("a board with a card held has no serious issues", async ({ page }) => {
  await openBoard(page);
  await card(page, FIRST_CARD).focus();
  await pickUp(page, FIRST_CARD);
  await expectNoSeriousIssues(page, "while a card is held");
  await page.keyboard.press("Escape");
});

test("a board that cannot be loaded has no serious issues", async ({
  page,
}) => {
  await page.goto(`/demo?board=test-fail-${crypto.randomUUID().slice(0, 8)}`);
  await expect(page.locator('[data-board-state="unavailable"]')).toBeVisible({
    timeout: 25_000,
  });
  await expectNoSeriousIssues(page, "on an unavailable board");
});
