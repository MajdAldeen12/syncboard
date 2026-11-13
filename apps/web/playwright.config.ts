import { defineConfig, devices } from "@playwright/test";
import {
  LOOPBACK,
  SYNC_HOST,
  SYNC_PORT,
  WEB_ORIGIN,
  WEB_PORT,
} from "./e2e/ports";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: WEB_ORIGIN,
    // Keeps a step-by-step DOM recording of any test that fails.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // The real sync server, run locally. ALLOW_TEST_BOARDS lets each test
      // use a board of its own (see apps/sync/src/seed.ts). Its storage goes
      // to a folder that `pnpm e2e` empties before each run.
      command: `pnpm --filter @syncboard/sync exec wrangler dev --ip ${LOOPBACK} --port ${SYNC_PORT} --var ALLOW_TEST_BOARDS:1 --persist-to .wrangler/e2e`,
      url: `http://${SYNC_HOST}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Tests run against a production build. A dev server compiles on
      // demand and stalls when test artifacts are written into the project
      // folder. The build goes to its own folder because it has test-only
      // settings switched on.
      command: `pnpm exec next build && pnpm exec next start --hostname ${LOOPBACK} --port ${WEB_PORT}`,
      url: `${WEB_ORIGIN}/demo`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_SYNC_HOST: SYNC_HOST,
        NEXT_PUBLIC_ALLOW_TEST_BOARDS: "1",
      },
    },
  ],
});
