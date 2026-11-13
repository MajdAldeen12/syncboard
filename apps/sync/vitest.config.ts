import { defineConfig } from "vitest/config";

// These tests cover the room's rules as plain functions and run in Node.
// The Durable Object itself is exercised by the browser tests in apps/web,
// through a real `wrangler dev`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
