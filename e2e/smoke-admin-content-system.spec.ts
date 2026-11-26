import { expect, test, type Page } from "@playwright/test";

import { dismissConsentBanner } from "./admin-ops-helpers";
import { hasCredentials, missingCredentials, signIn, type Role } from "./support";

/**
 * Smoke test of the Command Centre content and system areas for each staff role: website content (collections,
 * homepage, navigation, logo permissions), media, worker reviews, public statistics, announcements, settings,
 * users and roles, audit logs, privacy requests, system (backup, tasks) and analytics. Every page opens without a
 * server error or an error screen and shows one visible h1. Pages a role may not open show the friendly "no access"
 * page inside the Command Centre, and the export / download routes answer 403 instead of a file.
 *
 * Accounts come from the env file written by `npm run db:seed:e2e`: E2E_ADMIN_* (Super Admin), E2E_CONTENT_*
 * (Content Manager), E2E_FINANCE_* (Finance) and E2E_OPS_* (Operations Manager). Detail pages are found from the
 * lists (the first record in each), so the spec needs no ids.
 */

const CONTENT_PAGES = [
  "/admin/content",
  "/admin/content/homepage",
  "/admin/content/navigation",
  "/admin/content/site_settings",
  "/admin/content/news",
  "/admin/content/faqs",
  "/admin/content/services",
  "/admin/content/logo-permissions",
  "/admin/content/logo-permissions/new",
  "/admin/media",
  "/admin/public-metrics",
  "/admin/announcements",
  "/admin/analytics",
  "/admin/analytics/realtime",
  "/admin/analytics/pages",
  "/admin/analytics/sources",
  "/admin/analytics/audience",
  "/admin/analytics/engagement",
  "/admin/analytics/events",
  "/admin/analytics/funnels",
  "/admin/analytics/funnels/new",
  "/admin/analytics/heatmaps",
  "/admin/analytics/sessions",
];

const SYSTEM_PAGES = [
  "/admin/reviews",
  "/admin/reviews?tab=pending",
  "/admin/reviews?tab=published",
  "/admin/settings",
  "/admin/settings/modules",
  "/admin/settings/roles",
  "/admin/settings/security",
  "/admin/settings/integrations",
  "/admin/settings/taxonomies",
  "/admin/settings/workflows",
  "/admin/users",
  "/admin/audit",
  // Impossible days in the filter are ignored instead of failing the page.
  "/admin/audit?from=2026-02-30&to=2026-13-01",
  "/admin/audit/security",
  "/admin/audit/data-access",
  "/admin/privacy",
  "/admin/system",
  "/admin/system/backup",
  "/admin/system/tasks",
  "/admin/analytics/exports",
  "/admin/analytics/settings",
  "/admin/help",
];

/** List page → the pattern of the detail links in it (the first one found is opened). */
const DETAILS: [string, RegExp][] = [
  ["/admin/content/news", /^\/admin\/content\/news\/[0-9a-f-]{36}$/],
  ["/admin/content/faqs", /^\/admin\/content\/faqs\/[0-9a-f-]{36}$/],
  ["/admin/media", /^\/admin\/media\/[0-9a-f-]{36}$/],
  ["/admin/users", /^\/admin\/users\/[0-9a-f-]{36}$/],
  ["/admin/settings/roles", /^\/admin\/settings\/roles\/[0-9a-f-]{36}$/],
  ["/admin/settings/workflows", /^\/admin\/settings\/workflows\/[0-9a-f-]{36}$/],
  ["/admin/settings/taxonomies", /^\/admin\/settings\/taxonomies\/[a-z_-]+$/],
  ["/admin/privacy", /^\/admin\/privacy\/[0-9a-f-]{36}$/],
  ["/admin/analytics/funnels", /^\/admin\/analytics\/funnels\/[0-9a-f-]{36}\/edit$/],
];

/** Content Manager: content, media, statistics, announcements and analytics, nothing in system administration. */
const CONTENT_FORBIDDEN = ["/admin/settings", "/admin/settings/roles", "/admin/users", "/admin/audit", "/admin/privacy", "/admin/system", "/admin/system/backup", "/admin/reviews"];
/** Finance: none of the content or system areas. */
const FINANCE_FORBIDDEN = ["/admin/content", "/admin/media", "/admin/public-metrics", "/admin/settings", "/admin/users", "/admin/audit", "/admin/privacy", "/admin/system/backup", "/admin/analytics"];
/** Operations Manager: users (view), worker reviews and analytics; no content, settings, audit, privacy or system. */
const OPS_PAGES = ["/admin/users", "/admin/reviews", "/admin/analytics"];
const OPS_FORBIDDEN = ["/admin/content", "/admin/media", "/admin/public-metrics", "/admin/settings", "/admin/audit", "/admin/privacy", "/admin/system/backup"];

/** File routes: [path, roles that get the file]. Everyone else gets 403. */
const FILE_ROUTES: [string, Role[]][] = [
  ["/admin/audit/export?log=audit", ["admin"]],
  ["/admin/analytics/exports/download?dataset=events&range=7d", ["admin"]],
];

/**
 * Errors a `next dev` server raises while other people edit files (a hot reload lands before the router is
 * ready). They never happen on a production build and say nothing about the page under test.
 */
/** A page compiles on its first visit to a `next dev` server, which can take a while on a busy machine. */
const SLOW = { timeout: 90_000 };

const DEV_SERVER_NOISE = /Router action dispatched before initialization|\[HMR\]|\[Fast Refresh\]|WebSocket|ChunkLoadError|Failed to load chunk/i;

/** page.goto, retried when a dev-server reload aborts the navigation (net::ERR_ABORTED). */
async function gotoPage(page: Page, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(path);
    } catch (error) {
      if (attempt >= 3 || !/ERR_ABORTED|interrupted by another navigation/i.test(String(error))) throw error;
    }
  }
}

/** The page answers without a server error, shows no error screen and has exactly one visible h1. */
async function expectPageWorks(page: Page, path: string): Promise<void> {
  const pageErrors: string[] = [];
  const onError = (error: Error) => {
    if (!DEV_SERVER_NOISE.test(error.message)) pageErrors.push(error.message.slice(0, 200));
  };
  page.on("pageerror", onError);
  const response = await gotoPage(page, path);
  expect(response?.status(), `${path}: status`).toBeLessThan(400);
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1, `${path}: one h1`).toHaveCount(1, SLOW);
  await expect(h1, `${path}: h1 visible`).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /couldn.t find that page|don.t have access/i }), `${path}: not-found or no-access page`).toHaveCount(0);
  page.off("pageerror", onError);
  expect(pageErrors, `${path}: uncaught errors in the browser`).toEqual([]);
}

/** The friendly "no access" page, shown inside the Command Centre so the staff member keeps the menu. */
async function expectNoAccess(page: Page, path: string): Promise<void> {
  await gotoPage(page, path);
  await expect(page.getByRole("heading", { level: 1, name: /don.t have access to this page/i }), path).toBeVisible(SLOW);
  await expect(page.getByRole("navigation", { name: "Main navigation" }), `${path}: Command Centre menu`).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
}

/** The first link inside main whose path matches `pattern`, or null when the list is empty. */
async function firstDetailLink(page: Page, listPath: string, pattern: RegExp): Promise<string | null> {
  await gotoPage(page, listPath);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(SLOW);
  const hrefs = await page.locator("main a[href^='/admin/']").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.map((h) => h.split(/[?#]/)[0]!).find((h) => pattern.test(h)) ?? null;
}

async function expectFileRoutes(page: Page, role: Role): Promise<void> {
  for (const [path, allowed] of FILE_ROUTES) {
    const response = await page.request.get(path, { timeout: 180_000 });
    if (allowed.includes(role)) {
      expect(response.status(), `${path} as ${role}`).toBe(200);
      expect(response.headers()["content-type"], `${path}: a CSV file`).toMatch(/text\/csv/);
    } else {
      expect(response.status(), `${path} as ${role}`).toBe(403);
    }
  }
}

/** Sign in once and walk the pages, one step each, collecting every 5xx response on the way. */
async function walk(page: Page, role: Role, pages: string[], forbidden: string[] = []): Promise<void> {
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await signIn(page, role, { returnTo: "/admin" });
  await dismissConsentBanner(page);
  for (const path of pages) await test.step(path, () => expectPageWorks(page, path));
  for (const path of forbidden) await test.step(`${path} (no access)`, () => expectNoAccess(page, path));
  await test.step("export and download routes", () => expectFileRoutes(page, role));
  expect(serverErrors, "server errors").toEqual([]);
}

test.describe("command centre content and system smoke", () => {
  // Desktop is enough for a smoke run; the ui-admin-* specs cover small screens.
  test.skip(({ isMobile }) => isMobile, "Desktop only");
  test.describe.configure({ timeout: 1_800_000 });

  test("super admin opens every page and the main detail pages", async ({ page }) => {
    test.skip(!hasCredentials("admin"), missingCredentials("admin"));
    await walk(page, "admin", [...CONTENT_PAGES, ...SYSTEM_PAGES]);
    for (const [list, pattern] of DETAILS) {
      const href = await firstDetailLink(page, list, pattern);
      if (href) await test.step(href, () => expectPageWorks(page, href));
    }
  });

  test("content manager opens the content pages and is refused system administration", async ({ page }) => {
    test.skip(!hasCredentials("content"), missingCredentials("content"));
    await walk(page, "content", CONTENT_PAGES, CONTENT_FORBIDDEN);
  });

  test("finance is refused the content and system areas", async ({ page }) => {
    test.skip(!hasCredentials("finance"), missingCredentials("finance"));
    await walk(page, "finance", ["/admin"], FINANCE_FORBIDDEN);
  });

  test("operations manager opens users, reviews and analytics and is refused the rest", async ({ page }) => {
    test.skip(!hasCredentials("ops"), missingCredentials("ops"));
    await walk(page, "ops", OPS_PAGES, OPS_FORBIDDEN);
  });

  test("records that do not exist are not found", async ({ page }) => {
    test.skip(!hasCredentials("admin"), missingCredentials("admin"));
    await signIn(page, "admin", { returnTo: "/admin" });
    await dismissConsentBanner(page);
    const missingId = "00000000-0000-4000-8000-000000000000";
    for (const path of [
      `/admin/users/${missingId}`,
      "/admin/users/not-an-id",
      `/admin/content/news/${missingId}`,
      "/admin/content/no-such-collection",
      `/admin/media/${missingId}`,
      `/admin/privacy/${missingId}`,
      `/admin/settings/roles/${missingId}`,
      `/admin/settings/workflows/${missingId}`,
      `/admin/analytics/funnels/${missingId}/edit`,
    ]) {
      await test.step(path, async () => {
        await gotoPage(page, path);
        await expect(page.getByRole("heading", { level: 1, name: /couldn.t find that page/i }), path).toBeVisible(SLOW);
        await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
      });
    }
  });
});
