import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (Playwright). The app must already be running — start it yourself, then:
 *
 *   $env:PLAYWRIGHT_BROWSERS_PATH='E:\VenkatSaiGlobal-work\ms-playwright'
 *   npx playwright install chromium        # once, downloads into PLAYWRIGHT_BROWSERS_PATH
 *   $env:E2E_BASE_URL='http://localhost:3000'; npm run test:e2e
 *
 * Browsers must live on the E: drive (PLAYWRIGHT_BROWSERS_PATH); on Windows this config defaults it
 * to E:\VenkatSaiGlobal-work\ms-playwright when unset, so nothing is written to C:.
 */
if (process.platform === "win32" && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "E:\\VenkatSaiGlobal-work\\ms-playwright";
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
