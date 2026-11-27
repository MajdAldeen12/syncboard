import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { openBoard } from "./helpers";

// GSAP belongs to the landing page and Yjs to the board. Each page's own
// code must carry only its library, so neither page pays to download and
// parse the other's.
//
// Text that survives minification identifies each library: GSAP registers
// itself in `gsapVersions`, and Yjs marks the page with "__ $YJS$ __" to
// warn about duplicate copies.
const GSAP = "gsapVersions";
const YJS = "__ $YJS$ __";

/** The script files a page's server-rendered HTML loads, with their text. */
async function scriptsOf(
  request: APIRequestContext,
  path: string,
): Promise<string[]> {
  const html = await (await request.get(path)).text();
  const sources = [
    ...new Set(html.match(/\/_next\/static\/chunks\/[^"'\s]+\.js/g) ?? []),
  ];
  expect(sources.length, `scripts in the HTML of ${path}`).toBeGreaterThan(0);
  return Promise.all(
    sources.map(async (source) => (await request.get(source)).text()),
  );
}

const carrying = (scripts: string[], mark: string) =>
  scripts.filter((script) => script.includes(mark)).length;

test("the landing page's code carries GSAP and not Yjs", async ({
  request,
}) => {
  const scripts = await scriptsOf(request, "/");
  expect(carrying(scripts, GSAP)).toBeGreaterThan(0);
  expect(carrying(scripts, YJS)).toBe(0);
});

test("the board's code carries Yjs and not GSAP", async ({ request }) => {
  const scripts = await scriptsOf(request, "/demo");
  expect(carrying(scripts, YJS)).toBeGreaterThan(0);
  expect(carrying(scripts, GSAP)).toBe(0);
});

/** Every script the page downloads from now on, including prefetches. */
function recordScripts(page: Page): Promise<string>[] {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      bodies.push(response.text().catch(() => ""));
    }
  });
  return bodies;
}

test("Yjs never runs on the landing page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // The landing page may fetch the board's code ahead of a click on "Open
  // the demo board"; it must not run it.
  expect(await page.evaluate((mark) => mark in window, YJS)).toBe(false);
});

test("the board does not download the landing page's animation", async ({
  page,
}) => {
  // Few people go from the board back to the home page, so the link there
  // is not prefetched, and with it GSAP.
  const scripts = recordScripts(page);
  await openBoard(page);
  await page.waitForLoadState("networkidle");
  expect(carrying(await Promise.all(scripts), GSAP)).toBe(0);
});
