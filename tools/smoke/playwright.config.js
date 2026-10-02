// Smoke test for the running Compose stack. Run through script/smoke, which starts the
// stack, creates the test accounts and runs this in the Playwright container.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.js",
  // One worker: the tests share two accounts, and a smoke test should be boring.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    baseURL: `http://localhost:${process.env.FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
