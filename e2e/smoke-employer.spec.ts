import { expect, test, type Page } from "@playwright/test";

import { dismissConsentBanner } from "./employer-helpers";
import { fillPasswordSignInForm, type Credentials } from "./support";

/**
 * Smoke test of the Company Portal (/employer) and the Travel Agency Portal (/agency): every page in scope renders
 * for each role without a server error or an error screen, with one visible h1; roles without a permission get the
 * friendly "no access" page; another organisation's records are not found.
 *
 * Accounts (each group is skipped when its variables are missing; `npm run db:seed:e2e`):
 * - E2E_EMPLOYER_EMAIL / _PASSWORD: owner of the verified "E2E Employer Co" (a direct company).
 * - E2E_EMPLOYER_MEMBER_EMAIL / _PASSWORD: HR Manager there (no billing, team or company profile permission).
 * - E2E_OTHER_EMPLOYER_EMAIL / _PASSWORD: owner of another employer organisation (isolation).
 * - E2E_AGENCY_EMAIL / _PASSWORD: owner of a travel agency organisation (the local demo agency account).
 * Desktop only (the chromium project); the pages are the same on phones.
 */

function envCredentials(prefix: string): Credentials | null {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

const OWNER = envCredentials("EMPLOYER");
const MEMBER = envCredentials("EMPLOYER_MEMBER");
const OTHER = envCredentials("OTHER_EMPLOYER");
const AGENCY = envCredentials("AGENCY");

/** Pages every company owner can open. */
const COMPANY_PAGES = [
  "/employer",
  "/employer/jobs",
  "/employer/jobs?status=draft",
  "/employer/jobs/new",
  "/employer/requirements",
  "/employer/requirements?status=draft",
  "/employer/requirements/new",
  "/employer/candidates",
  "/employer/candidates/compare",
  "/employer/lists",
  "/employer/pipeline",
  "/employer/interviews",
  "/employer/interviews?view=week",
  "/employer/offers",
  "/employer/offers?tab=placements",
  "/employer/reports",
  "/employer/messages",
  "/employer/messages/new",
  "/employer/support",
  "/employer/support/new",
  "/employer/help",
];

/** Pages that need billing, team or company-profile permission (owner yes, HR Manager no). */
const ADMIN_PAGES = [
  "/employer/announcements",
  "/employer/company",
  "/employer/company/verification",
  "/employer/team",
  "/employer/billing",
  "/employer/billing/invoices",
  "/employer/billing/payments",
  "/employer/billing/details",
];

const AGENCY_PAGES = [
  "/agency",
  "/agency/requirements",
  "/agency/requirements?status=draft",
  "/agency/requirements/new",
  "/agency/pipeline",
  "/agency/interviews",
  "/agency/offers",
  "/agency/offers?tab=placements",
  "/agency/messages",
  "/agency/messages/new",
  "/agency/billing",
  "/agency/billing/invoices",
  "/agency/billing/payments",
  "/agency/billing/details",
  "/agency/team",
  "/agency/company",
  "/agency/company/verification",
  "/agency/support",
  "/agency/support/new",
  "/agency/announcements",
  "/agency/help",
];

/** Detail pages are found from the list pages, so the spec works with whatever the seed created. */
const DETAIL_SOURCES: { list: string; pattern: RegExp }[] = [
  { list: "/employer/requirements?status=all", pattern: /^\/employer\/requirements\/[0-9a-f-]{36}$/ },
  { list: "/employer/jobs", pattern: /^\/employer\/jobs\/[0-9a-f-]{36}$/ },
  { list: "/employer/lists", pattern: /^\/employer\/lists\/[0-9a-f-]{36}$/ },
  { list: "/employer/pipeline", pattern: /^\/employer\/pipeline\/[0-9a-f-]{36}$/ },
];

const ERROR_SCREEN = /something went wrong|we could not load|application error|unhandled runtime error/i;

/** First compile of a route on the dev server can be slow. */
const NAV = { timeout: 120_000 };

/**
 * On a shared `next dev` server other people's edits push "reload" messages that throw a page under test back to a
 * fresh load (and can loop sign-in). Drop only those messages. A production build has no such socket.
 */
const reloadGuarded = new WeakSet<Page>();
async function ignoreDevReloads(page: Page): Promise<void> {
  if (reloadGuarded.has(page)) return;
  reloadGuarded.add(page);
  await page.routeWebSocket(/\/_next\/(webpack-)?hmr/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && (message.includes('"reloadPage"') || (message.includes('"turbopack-message"') && message.includes('"restart"')))) return;
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });
}

/**
 * page.goto, retried when a dev-server reload, restart or a slow first compile gets in the way. Waits for the HTML
 * only: the checks below wait for the h1 themselves.
 */
async function gotoPage(page: Page, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(path, { ...NAV, waitUntil: "domcontentloaded" });
    } catch (error) {
      if (attempt >= 3 || !/ERR_ABORTED|interrupted by another navigation|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|Timeout/i.test(String(error))) throw error;
      await page.waitForTimeout(5_000);
    }
  }
}

/**
 * Password sign-in through /sign-in into `portal`, with the slow-server allowances a shared dev server needs. A slow
 * earlier attempt may have signed in after all: /sign-in then forwards to the portal, which counts as success.
 */
async function signInTo(page: Page, creds: Credentials, portal: "/employer" | "/agency"): Promise<void> {
  await ignoreDevReloads(page);
  for (let attempt = 1; ; attempt++) {
    try {
      await gotoPage(page, `/sign-in?returnTo=${encodeURIComponent(portal)}`);
      if (!new URL(page.url()).pathname.startsWith("/sign-in")) break;
      // Type only once the form is interactive, so hydration cannot drop what was typed.
      await page.waitForLoadState("load", NAV);
      await fillPasswordSignInForm(page, creds);
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), NAV);
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
  await expect(page).toHaveURL((url) => url.pathname === portal || url.pathname.startsWith(`${portal}/`), NAV);
  await dismissConsentBanner(page);
}

// Not serial: a failure for one account must not skip the others (the isolation test finds its own pages).

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop smoke run only");
  testInfo.setTimeout(40 * 60_000);
});

/** Open `path`; it must render (status < 500, no error screen) with one visible h1. Soft, so one run lists every bad page. */
async function expectPageRenders(page: Page, path: string, h1?: RegExp): Promise<void> {
  const response = await gotoPage(page, path);
  expect.soft(response?.status() ?? 0, `${path} status`).toBeLessThan(500);
  const heading = page.getByRole("heading", { level: 1 });
  await expect.soft(heading, `${path} should have one h1`).toHaveCount(1, NAV);
  await expect.soft(heading.first(), `${path} h1 visible`).toBeVisible();
  if (h1) await expect.soft(heading.first(), `${path} h1 text`).toHaveText(h1);
  await expect.soft(page.getByText(ERROR_SCREEN), `${path} shows an error screen`).toHaveCount(0);
}

async function expectNoAccess(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect.soft(response?.status() ?? 0, `${path} status`).toBeLessThan(500);
  await expect.soft(page.getByRole("heading", { level: 1, name: /don.t have access/i }), `${path} no-access page`).toBeVisible(NAV);
}

async function expectNotFound(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect.soft([200, 404], `${path} status`).toContain(response?.status());
  await expect.soft(page.getByRole("heading", { level: 1, name: /couldn.t find/i }), `${path} not found`).toBeVisible(NAV);
}

async function firstDetailLinks(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const { list, pattern } of DETAIL_SOURCES) {
    await gotoPage(page, list);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(NAV);
    const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    const match = hrefs.find((href) => pattern.test(href));
    if (match) found.push(match);
  }
  return found;
}

let ownerDetailPages: string[] = [];

test("company owner: every page renders", async ({ page }) => {
  test.skip(!OWNER, "E2E_EMPLOYER_EMAIL / _PASSWORD not set");
  await signInTo(page, OWNER!, "/employer");
  for (const path of [...COMPANY_PAGES, ...ADMIN_PAGES]) await expectPageRenders(page, path);
  ownerDetailPages = await firstDetailLinks(page);
  expect(ownerDetailPages.length, "seeded requirements / jobs to open").toBeGreaterThan(0);
  for (const path of ownerDetailPages) await expectPageRenders(page, path);
  // Exports answer with files, not error pages.
  for (const path of ["/employer/reports/export?report=jobs", "/employer/reports/export/xlsx?report=jobs"]) {
    const response = await page.request.get(path);
    expect.soft(response.status(), path).toBe(200);
  }
  // An impossible date in the address bar is ignored (it used to throw "Invalid time value" on the page and a 500 on
  // the Excel export).
  await expectPageRenders(page, "/employer/reports?from=garbage&to=2026-13-45&jobId=not-a-uuid", /recruitment reports/i);
  const badDates = await page.request.get("/employer/reports/export/xlsx?report=jobs&from=2026-02-31&to=2026-99-99");
  expect.soft(badDates.status(), "xlsx export with impossible dates").toBe(200);
});

test("HR Manager: allowed pages render, billing / team / profile show the no-access page", async ({ page }) => {
  test.skip(!MEMBER, "E2E_EMPLOYER_MEMBER_EMAIL / _PASSWORD not set");
  await signInTo(page, MEMBER!, "/employer");
  for (const path of COMPANY_PAGES) await expectPageRenders(page, path);
  for (const path of ADMIN_PAGES) await expectNoAccess(page, path);
});

test("another organisation cannot open this organisation's records", async ({ page }) => {
  test.skip(!OWNER || !OTHER, "E2E_EMPLOYER_* / E2E_OTHER_EMPLOYER_* not set");
  if (!ownerDetailPages.length) {
    await signInTo(page, OWNER!, "/employer");
    ownerDetailPages = await firstDetailLinks(page);
    await page.context().clearCookies();
  }
  await signInTo(page, OTHER!, "/employer");
  for (const path of ownerDetailPages) await expectNotFound(page, path);
  for (const path of ["/employer/requirements/not-a-uuid", "/employer/jobs/not-a-uuid", "/employer/candidates/not-a-uuid"]) await expectNotFound(page, path);
  const pdf = await page.request.get("/employer/billing/invoices/00000000-0000-4000-8000-000000000000/pdf");
  expect.soft(pdf.status(), "unknown invoice PDF").toBe(404);
});

test("travel agency owner: every page renders inside /agency", async ({ page }) => {
  test.skip(!AGENCY, "E2E_AGENCY_EMAIL / _PASSWORD not set");
  await signInTo(page, AGENCY!, "/agency");
  for (const path of AGENCY_PAGES) await expectPageRenders(page, path);

  // Billing names the agency portal and marks the open tab.
  await gotoPage(page, "/agency/billing/invoices");
  await expect.soft(page.locator("main").getByRole("link", { name: "Company Portal" })).toHaveCount(0);
  await expect.soft(page.locator("main").getByRole("link", { name: "Travel Agency Portal" }).first()).toBeVisible();
  await expect.soft(page.getByRole("navigation", { name: "Billing sections" }).getByRole("link", { name: "Invoices" })).toHaveAttribute("aria-current", "page");

  // In-page links written for /employer stay inside /agency.
  await gotoPage(page, "/agency/requirements");
  await page.getByRole("link", { name: "Drafts", exact: true }).click();
  await expect(page).toHaveURL(/\/agency\/requirements\?status=draft$/, NAV);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
