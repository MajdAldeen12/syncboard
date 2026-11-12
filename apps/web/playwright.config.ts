import { defineConfig, devices } from "@playwright/test";

// A port of its own, so the tests can run while `pnpm dev` is using 3000.
const PORT = 3100;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // One at a time: on the Windows dev machine, several browsers loading the
  // page at once hang before the load event. The server answers concurrent
  // requests fine; the cause is not yet known. Revisit when e2e joins CI.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Keeps a step-by-step DOM recording of any test that fails.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Tests run against a production build. A dev server compiles on demand
    // and stalls when test artifacts are written into the project folder.
    // CI builds in an earlier step, so it only needs to start the server.
    command: isCI
      ? `pnpm exec next start --port ${PORT}`
      : `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/demo`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
