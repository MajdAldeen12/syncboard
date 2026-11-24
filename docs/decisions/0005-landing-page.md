# 0005: The landing page's animation and its cost

- **Date:** 2026-11-24
- **Status:** measured
- **Milestone:** M7

## Question

The M7 done checks: mobile Lighthouse performance of 90 or more on a production build, no layout shift from scroll-driven sections, and a static page with reduced motion. The page has a GSAP hero (two people's screens showing one board) and a scroll-driven tour of four features beside a picture that stays in view. Three choices decide whether those checks can pass at all.

## Decisions

- **The HTML is a complete picture.** The hero's markup is the board before anyone moves; the tour's is the board at the end of the tour, everyone present and every card in place. GSAP starts from what is there. Nothing is hidden by CSS waiting for JavaScript, so the page reads fully without JavaScript, before GSAP has loaded, and with reduced motion. The largest paint is text, never something GSAP reveals.
- **Animation only under `prefers-reduced-motion: no-preference`.** Both timelines are created inside `gsap.matchMedia()`. With reduced motion nothing is created, and the tour does not set its starting state either, so the reader sees the finished picture. `useGSAP` scopes the selectors to the component and reverts everything on unmount.
- **CSS `position: sticky`, not ScrollTrigger's `pin`.** Pinning wraps the element in a spacer when the trigger is created, which moves the content after it, and recalculates on refresh. Here the tour's height comes from its own text sections; the picture beside them (above them on a phone) is sticky. ScrollTrigger only scrubs one timeline across the sections. `ScrollTrigger.refresh()` runs once the display font has loaded, because the sections' heights change with it.

## How it was measured

- Production build (`pnpm --filter @syncboard/web build`) served by `next start` on port 3200 (the `web-prod` preview in `.claude/launch.json`). No sync server: the landing page needs none.
- Lighthouse 13.6.0 from the command line, performance only, its default mobile settings: simulated throttling (150 ms round trip, 1.6 Mbit/s, CPU slowed 4 times), a 412 by 823 screen at 1.75 pixel ratio. Headless Chromium 158 from Playwright.

  ```bash
  CHROME_PATH=<Playwright's chrome.exe> npx --yes lighthouse@13.6.0 http://localhost:3200/ \
    --only-categories=performance --output=json --output-path=mobile-1.json \
    --chrome-flags="--headless=new" --quiet
  ```

- Layout shift while reading: a Playwright script loads the page, waits 2.5 s, scrolls to the end in 120-pixel wheel steps, and adds up every `layout-shift` entry not caused by input. At 390 by 844 and 1280 by 800, with and without reduced motion.
- Machine: Intel Core i5-13420H, 16 GB, Windows 11.

## Results

| Run | Score | First paint | Largest paint | Total blocking time | Layout shift | Speed index |
| --- | ----- | ----------- | ------------- | ------------------- | ------------ | ----------- |
| 1   | 97    | 0.92 s      | 0.92 s        | 207 ms              | 0            | 1.6 s       |
| 2   | 99    | 0.91 s      | 0.91 s        | 68 ms               | 0            | 2.6 s       |
| 3   | 99    | 0.91 s      | 0.91 s        | 131 ms              | 0            | 1.2 s       |

- The largest paint is the introduction paragraph under the headline, so it lands with the first paint.
- The page weighs 457 KB in all. GSAP, ScrollTrigger and the landing page's own code are one chunk of 126 KB, 48 KB compressed. No other page loads it (`e2e/landing.spec.ts` checks that GSAP never runs on the board).
- Layout shift while scrolling to the end: 0 at both widths, moving and still.

## What this means

- **The checks pass with room to spare.** The score varies with total blocking time, which is mostly React hydrating the page and GSAP building the timelines; it stays above 95.
- **The browser tests guard the parts that could regress without anyone noticing:** the page without JavaScript (nothing hidden by style), reduced motion (nothing moves during the hero or the tour), layout shift (under 0.01 through the whole tour, both ways), and GSAP kept off the board. Each of the first, second and fourth was broken on purpose and the test failed.
- **Not measured:** a real phone, and a slow network without simulation. Repeat both when the site is deployed (M9).
