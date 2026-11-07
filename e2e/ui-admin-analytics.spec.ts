import { expect, test, type Page } from "@playwright/test";

/**
 * Command Centre website analytics (ui:admin-analytics): overview, reports, funnels, heatmaps,
 * session diagnostics (reason required), settings and CSV export.
 *
 * Needs a seeded staff account with analytics.view, analytics.sessions, analytics.export and
 * analytics.configure (Super Admin), 2FA satisfied for the test environment:
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * Works on an empty analytics dataset (empty states) and on seeded traffic.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

test.describe("Command Centre analytics", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, "/admin/analytics");
  });

  test("overview shows key figures, the privacy notice and keeps the period across reports", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Website analytics" })).toBeVisible();
    await expect(page.getByText("Unique visitors")).toBeVisible();
    await expect(page.getByText("Active now")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "About this data" })).toContainText("Pseudonymous, consent-based data");

    await page.goto("/admin/analytics?range=7d");
    const nav = page.getByRole("navigation", { name: "Analytics reports" });
    await nav.getByRole("link", { name: "Pages" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/pages\?range=7d/);
    await expect(page.getByRole("heading", { level: 1, name: "Pages" })).toBeVisible();
  });

  for (const [path, heading] of [
    ["/admin/analytics/realtime", "Real-time"],
    ["/admin/analytics/sources", "Sources and campaigns"],
    ["/admin/analytics/audience", "Audience"],
    ["/admin/analytics/events", "Events"],
    ["/admin/analytics/engagement", "Forms, search and CTAs"],
    ["/admin/analytics/heatmaps", "Heatmaps"],
    ["/admin/analytics/funnels", "Journeys and funnels"],
    ["/admin/analytics/exports", "Exports"],
    ["/admin/analytics/settings", "Settings"],
  ] as const) {
    test(`${heading} report renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("custom period is applied through the URL", async ({ page }) => {
    await page.getByLabel("Reporting period").click();
    await page.getByRole("option", { name: "Custom range" }).click();
    await page.getByLabel("From").fill("2026-10-01");
    await page.getByLabel("To").fill("2026-10-31");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/range=custom&from=2026-10-01&to=2026-10-31/);
  });

  test("funnel builder previews unsaved steps", async ({ page }) => {
    await page.goto("/admin/analytics/funnels/new?range=90d");
    await expect(page.getByRole("heading", { level: 1, name: "Build a funnel" })).toBeVisible();
    await page.getByLabel("Step name").nth(0).fill("Jobs");
    await page.getByLabel("Path (optional)").nth(0).fill("/jobs");
    await page.getByLabel("Step name").nth(1).fill("Job details");
    await page.getByLabel("Path (optional)").nth(1).fill("/jobs/*");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/entered|Nobody entered this funnel/)).toBeVisible();
  });

  test("campaign with a manual cost can be added", async ({ page }) => {
    await page.goto("/admin/analytics/sources");
    await page.getByRole("button", { name: "Add campaign" }).click();
    const dialog = page.getByRole("dialog");
    const key = `e2e_${Date.now().toString(36)}`;
    await dialog.getByLabel("utm_campaign value").fill(key);
    await dialog.getByLabel("Name").fill(`E2E campaign ${key}`);
    await dialog.getByLabel("Channel").click();
    await page.getByRole("option", { name: "Email" }).click();
    await dialog.getByRole("button", { name: "Add campaign" }).click();
    await expect(page.getByText(`E2E campaign ${key}`).first()).toBeVisible();
  });

  test("opening a session requires a reason", async ({ page }) => {
    await page.goto("/admin/analytics/sessions?range=90d");
    await expect(page.getByRole("heading", { level: 1, name: "Session diagnostics" })).toBeVisible();
    const open = page.getByRole("button", { name: /Open session diagnostics/ }).first();
    if (!(await open.isVisible().catch(() => false))) test.skip(true, "No sessions recorded in the test database");
    await open.click();
    await page.getByRole("button", { name: "Open timeline" }).click();
    await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();
    await page.getByLabel(/Reason for opening/).fill("E2E check of the diagnostics flow");
    await page.getByRole("button", { name: "Open timeline" }).click();
    await expect(page.getByRole("heading", { name: /Events \(/ })).toBeVisible();
  });

  test("CSV export downloads a csv file", async ({ page }) => {
    const response = await page.request.get("/admin/analytics/exports/download?dataset=daily_metrics&range=7d");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("attachment");
  });

  test("export rejects an unknown dataset", async ({ page }) => {
    const response = await page.request.get("/admin/analytics/exports/download?dataset=users");
    expect(response.status()).toBe(400);
  });
});

test("analytics is not reachable signed out", async ({ page }) => {
  await page.goto("/admin/analytics");
  await expect(page).not.toHaveURL(/\/admin\/analytics$/);
});
