import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./admin-ops-helpers";
import { hasCredentials, missingCredentials, type Role } from "./support";

/**
 * Smoke test of the Command Centre operations and money areas for the Super Admin, the Operations Manager and Finance:
 * training (courses, batches, certificates), trade test and training bookings, assessments, revenue and billing
 * (plans, invoices, worker invoices, payments, seller details, tax rates, coupons, disputes, refunds, settlements,
 * subscriptions), referrals, resume requests, support, tasks, approvals, notifications and announcements.
 *
 * Every page answers without a server error or an error screen and shows one visible h1; the first record of each
 * list opens too. A role without the permission gets the friendly "no access" page inside the Command Centre.
 * Unknown or hand-made ids show the not-found page (never a server error), and the Excel / PDF downloads answer.
 *
 * Accounts: E2E_ADMIN_*, E2E_OPS_*, E2E_FINANCE_* (`npm run db:seed:e2e`). Desktop only (the chromium project).
 */

/** Errors a `next dev` server raises while other people edit files; never seen on a production build. */
const DEV_SERVER_NOISE = /Router action dispatched before initialization|\[HMR\]|\[Fast Refresh\]|WebSocket|Failed to fetch|NetworkError|Load failed|ChunkLoadError/i;

const TRAINING = ["/admin/training", "/admin/training/courses", "/admin/training/batches", "/admin/training/certificates"];
const TRAINING_EDIT = ["/admin/training/courses/new"];
const BOOKINGS = ["/admin/bookings", "/admin/bookings?when=past", "/admin/bookings/new"];
const ASSESSMENTS = ["/admin/assessments", "/admin/assessments/new", "/admin/assessments/centres"];
const COMMERCIAL_VIEW = [
  "/admin/commercial",
  "/admin/commercial/plans",
  "/admin/commercial/invoices",
  "/admin/commercial/worker-invoices",
  "/admin/commercial/payments",
  "/admin/commercial/seller",
  "/admin/commercial/tax-rates",
  "/admin/commercial/coupons",
  "/admin/commercial/disputes",
  "/admin/commercial/refunds",
  "/admin/commercial/subscriptions",
];
const COMMERCIAL_EDIT = [
  "/admin/commercial/plans/new",
  "/admin/commercial/invoices/new",
  "/admin/commercial/worker-invoices/new",
  "/admin/commercial/payments/new",
  "/admin/commercial/tax-rates/new",
  "/admin/commercial/coupons/new",
  "/admin/commercial/subscriptions/new",
];
const SETTLEMENTS = ["/admin/commercial/settlements"];
const PEOPLE = ["/admin/referrals", "/admin/referrals?view=referrers", "/admin/referrals?reward=due", "/admin/resume-requests"];
const DESK = ["/admin/support", "/admin/tasks", "/admin/approvals", "/admin/approvals?status=pending"];
const DESK_MANAGE = ["/admin/support/new", "/admin/support/grievances"];
const NOTIFICATIONS = ["/admin/notifications", "/admin/notifications/templates", "/admin/notifications/deliveries"];
const ANNOUNCEMENTS = ["/admin/announcements", "/admin/announcements/new"];
const HOME = ["/admin", "/admin/overview", "/admin/training/institutions"];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** List page → the detail links found on it (the first one is opened). */
const DETAIL_SOURCES: { list: string; link: RegExp; also?: string[] }[] = [
  { list: "/admin/training/courses", link: new RegExp(`^/admin/training/courses/${UUID}$`) },
  { list: "/admin/training/batches", link: new RegExp(`^/admin/training/batches/${UUID}$`) },
  { list: "/admin/assessments?view=all", link: new RegExp(`^/admin/assessments/${UUID}$`) },
  { list: "/admin/bookings", link: new RegExp(`^/admin/bookings/${UUID}$`), also: ["/edit", "/print"] },
  { list: "/admin/commercial/plans", link: new RegExp(`^/admin/commercial/plans/${UUID}$`) },
  { list: "/admin/commercial/invoices", link: new RegExp(`^/admin/commercial/invoices/${UUID}$`) },
  { list: "/admin/commercial/worker-invoices", link: new RegExp(`^/admin/commercial/worker-invoices/${UUID}$`) },
  { list: "/admin/commercial/tax-rates", link: new RegExp(`^/admin/commercial/tax-rates/${UUID}$`) },
  { list: "/admin/commercial/coupons", link: new RegExp(`^/admin/commercial/coupons/${UUID}$`) },
  { list: "/admin/commercial/subscriptions", link: new RegExp(`^/admin/commercial/subscriptions/${UUID}$`) },
  { list: "/admin/commercial/settlements", link: new RegExp(`^/admin/commercial/settlements/${UUID}$`) },
  { list: "/admin/commercial/refunds", link: new RegExp(`^/admin/commercial/refunds/${UUID}$`) },
  { list: "/admin/commercial/disputes", link: new RegExp(`^/admin/commercial/disputes/${UUID}$`) },
  { list: "/admin/resume-requests", link: new RegExp(`^/admin/resume-requests/${UUID}$`) },
  { list: "/admin/support", link: new RegExp(`^/admin/support/${UUID}$`) },
  { list: "/admin/approvals", link: new RegExp(`^/admin/approvals/${UUID}$`) },
  { list: "/admin/announcements", link: new RegExp(`^/admin/announcements/${UUID}$`) },
  { list: "/admin/notifications/templates", link: /^\/admin\/notifications\/templates\/[a-z0-9._-]+$/ },
];

/** Detail routes probed with ids that do not exist or are not ids at all. */
const DETAIL_ROUTES = [
  "/admin/training/courses",
  "/admin/training/batches",
  "/admin/assessments",
  "/admin/bookings",
  "/admin/commercial/plans",
  "/admin/commercial/invoices",
  "/admin/commercial/worker-invoices",
  "/admin/commercial/tax-rates",
  "/admin/commercial/coupons",
  "/admin/commercial/disputes",
  "/admin/commercial/refunds",
  "/admin/commercial/settlements",
  "/admin/commercial/subscriptions",
  "/admin/resume-requests",
  "/admin/support",
  "/admin/approvals",
  "/admin/announcements",
];
const BAD_IDS = ["00000000-0000-4000-8000-000000000000", "not-an-id", "-".repeat(36), "a".repeat(36)];

/**
 * On a shared `next dev` server other people's edits push "reload" messages that throw a page under test back to a
 * fresh load (and can loop sign-in). Drop only those messages. A production build has no such socket.
 */
async function ignoreDevReloads(page: Page): Promise<void> {
  await page.routeWebSocket(/\/_next\/(webpack-)?hmr/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && (message.includes('"reloadPage"') || (message.includes('"turbopack-message"') && message.includes('"restart"')))) return;
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });
}

/** Password sign-in into the Command Centre, retried when a busy dev server is slow to answer. */
async function signInRole(page: Page, role: Role): Promise<void> {
  await ignoreDevReloads(page);
  for (let attempt = 1; ; attempt++) {
    try {
      await signInAs(page, role, "/admin");
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

/** page.goto, retried when a dev-server reload aborts the navigation. */
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
  await expect(h1, `${path}: one h1`).toHaveCount(1, { timeout: 30_000 });
  await expect(h1, `${path}: h1 visible`).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /couldn.t find that page|don.t have access/i }), `${path}: not-found or no-access page`).toHaveCount(0);
  page.off("pageerror", onError);
  expect(pageErrors, `${path}: uncaught errors in the browser`).toEqual([]);
}

/** The friendly "no access" page, inside the Command Centre (the menu stays). */
async function expectNoAccess(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect(response?.status(), `${path}: status`).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1, name: /don.t have access to this page/i }), path).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
}

/** The in-portal not-found page, never a server error (pages that stream answer 200, the rest 404). */
async function expectMissing(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect(response?.status(), `${path}: status`).toBeLessThan(500);
  expect([200, 404], `${path}: status`).toContain(response?.status());
  await expect(page.getByRole("heading", { level: 1, name: /couldn.t find that page/i }), path).toBeVisible({ timeout: 30_000 });
}

/** Sign in once, walk the pages one step each and collect every 5xx response on the way. */
async function walk(page: Page, role: Role, pages: string[], forbidden: string[] = []): Promise<void> {
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await signInRole(page, role);
  for (const path of pages) await test.step(path, () => expectPageWorks(page, path));
  for (const path of forbidden) await test.step(`${path} (no access)`, () => expectNoAccess(page, path));
  expect(serverErrors, "server errors").toEqual([]);
}

/** Open each list, then the first record it links to (skipped when the list is empty). */
async function walkDetails(page: Page, sources: typeof DETAIL_SOURCES): Promise<string[]> {
  const opened: string[] = [];
  for (const source of sources) {
    await test.step(`first record of ${source.list}`, async () => {
      await expectPageWorks(page, source.list);
      const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
      const href = hrefs.map((h) => h.split(/[?#]/)[0]!).find((h) => source.link.test(h));
      if (!href) return;
      await expectPageWorks(page, href);
      opened.push(href);
      for (const suffix of source.also ?? []) await expectPageWorks(page, `${href}${suffix}`);
    });
  }
  return opened;
}

test.describe("command centre operations and money smoke", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop only");
  test.describe.configure({ timeout: 1_200_000 });

  test("super admin opens every page", async ({ page }) => {
    test.skip(!hasCredentials("admin"), missingCredentials("admin"));
    await walk(page, "admin", [
      ...HOME,
      ...TRAINING,
      ...TRAINING_EDIT,
      ...BOOKINGS,
      ...ASSESSMENTS,
      ...COMMERCIAL_VIEW,
      ...COMMERCIAL_EDIT,
      ...SETTLEMENTS,
      ...PEOPLE,
      ...DESK,
      ...DESK_MANAGE,
      ...NOTIFICATIONS,
      ...ANNOUNCEMENTS,
    ]);
  });

  test("super admin opens the first record of every list, and the downloads answer", async ({ page }) => {
    test.skip(!hasCredentials("admin"), missingCredentials("admin"));
    const serverErrors: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    });
    await signInRole(page, "admin");
    const opened = await walkDetails(page, DETAIL_SOURCES);

    await test.step("Excel and PDF downloads", async () => {
      const excel = /spreadsheetml/;
      for (const path of ["/admin/referrals/export", "/admin/resume-requests/export"]) {
        const response = await page.request.get(path);
        expect(response.status(), path).toBe(200);
        expect(response.headers()["content-type"], path).toMatch(excel);
      }
      const slot = opened.find((href) => href.startsWith("/admin/bookings/"));
      if (slot) {
        const response = await page.request.get(`${slot}/export`);
        expect(response.status(), `${slot}/export`).toBe(200);
        expect(response.headers()["content-type"]).toMatch(excel);
      }
      const workerInvoice = opened.find((href) => href.startsWith("/admin/commercial/worker-invoices/"));
      if (workerInvoice) {
        const response = await page.request.get(`${workerInvoice}/pdf`);
        expect(response.status(), `${workerInvoice}/pdf`).toBe(200);
        expect(response.headers()["content-type"]).toMatch(/pdf/);
      }
      for (const id of BAD_IDS) {
        for (const path of [`/admin/bookings/${id}/export`, `/admin/training/batches/${id}/export`, `/admin/commercial/worker-invoices/${id}/pdf`]) {
          const response = await page.request.get(path);
          expect(response.status(), path).toBe(404);
        }
      }
    });
    expect(serverErrors, "server errors").toEqual([]);
  });

  test("unknown and hand-made ids show the not-found page, never a server error", async ({ page }) => {
    test.skip(!hasCredentials("admin"), missingCredentials("admin"));
    await signInRole(page, "admin");
    for (const route of DETAIL_ROUTES) {
      for (const id of BAD_IDS) await test.step(`${route}/${id}`, () => expectMissing(page, `${route}/${id}`));
    }
    await test.step("unknown notification template", () => expectMissing(page, "/admin/notifications/templates/no.such.event"));
  });

  test("operations manager opens operations pages and is refused money, notifications and announcements", async ({ page }) => {
    test.skip(!hasCredentials("ops"), missingCredentials("ops"));
    await walk(
      page,
      "ops",
      [...HOME, ...TRAINING, ...BOOKINGS, ...ASSESSMENTS, ...PEOPLE, ...DESK],
      [...TRAINING_EDIT, "/admin/commercial", "/admin/commercial/invoices", "/admin/commercial/worker-invoices/new", "/admin/support/new", "/admin/support/grievances", ...NOTIFICATIONS, ...ANNOUNCEMENTS],
    );
    await test.step("downloads follow the same permissions", async () => {
      expect((await page.request.get(`/admin/commercial/worker-invoices/${BAD_IDS[0]}/pdf`)).status()).toBe(403);
      expect((await page.request.get("/admin/referrals/export")).status()).toBe(200);
    });
  });

  test("finance opens the money pages and is refused operations", async ({ page }) => {
    test.skip(!hasCredentials("finance"), missingCredentials("finance"));
    await walk(
      page,
      "finance",
      [...HOME, ...COMMERCIAL_VIEW, ...COMMERCIAL_EDIT, ...SETTLEMENTS, "/admin/support", "/admin/tasks", "/admin/approvals"],
      [...TRAINING, ...BOOKINGS, ...ASSESSMENTS, "/admin/referrals", "/admin/resume-requests", "/admin/support/new", ...NOTIFICATIONS, ...ANNOUNCEMENTS],
    );
    await test.step("downloads follow the same permissions", async () => {
      for (const path of [`/admin/bookings/${BAD_IDS[0]}/export`, `/admin/training/batches/${BAD_IDS[0]}/export`, "/admin/referrals/export", "/admin/resume-requests/export"]) {
        expect((await page.request.get(path)).status(), path).toBe(403);
      }
    });
  });
});
