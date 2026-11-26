import { expect, test, type Page } from "@playwright/test";

import { account, dismissConsentBanner, missing, signInAs, type Account } from "./partner-institution-helpers";

/**
 * Smoke test of the whole Recruitment Partner Portal (/recruiter) for each partner role: every page in the
 * menu and the main detail pages open without a server error or an error screen, and show one visible h1.
 * Pages a role may not open show the friendly "no access" page; another partner's records are not found.
 *
 * Accounts and ids come from the env file written by `npm run db:seed:e2e` (see ui-recruiter.spec.ts):
 * E2E_PARTNER_* (owner), E2E_PARTNER_FINANCE_* (settlements only), E2E_PARTNER_RECRUITER_* (Recruiter role),
 * E2E_OTHER_PARTNER_*, E2E_PARTNER_ASSIGNMENT_ID, E2E_PARTNER_SUBMISSION_ID, E2E_PARTNER_SETTLEMENT_ID,
 * E2E_OTHER_PARTNER_SUBMISSION_ID, E2E_OTHER_PARTNER_SETTLEMENT_ID.
 */

const OWNER = account("PARTNER");
const FINANCE = account("PARTNER_FINANCE");
const RECRUITER = account("PARTNER_RECRUITER");
const OTHER = account("OTHER_PARTNER");
const ASSIGNMENT = process.env.E2E_PARTNER_ASSIGNMENT_ID;
const SUBMISSION = process.env.E2E_PARTNER_SUBMISSION_ID;
const SETTLEMENT = process.env.E2E_PARTNER_SETTLEMENT_ID;
const OTHER_SUBMISSION = process.env.E2E_OTHER_PARTNER_SUBMISSION_ID;
const OTHER_SETTLEMENT = process.env.E2E_OTHER_PARTNER_SETTLEMENT_ID;

/** Pages every member can open (the workspace, help and support need no extra permission). */
const COMMON = ["/recruiter", "/recruiter/help", "/recruiter/support", "/recruiter/support/new"];

const OWNER_PAGES = [
  ...COMMON,
  "/recruiter/requirements",
  "/recruiter/requirements?status=active",
  "/recruiter/submissions",
  "/recruiter/submissions?status=submitted",
  "/recruiter/candidates",
  "/recruiter/interviews",
  "/recruiter/documents",
  "/recruiter/performance",
  "/recruiter/settlements",
  "/recruiter/profile",
  "/recruiter/profile/verification",
  "/recruiter/announcements",
  "/recruiter/team",
  "/recruiter/messages",
  "/recruiter/messages/new",
  "/recruiter/billing",
  "/recruiter/billing/invoices",
  "/recruiter/billing/payments",
  "/recruiter/billing/details",
  "/recruiter/onboarding",
  ...(ASSIGNMENT ? [`/recruiter/requirements/${ASSIGNMENT}`, `/recruiter/requirements/${ASSIGNMENT}/submit`] : []),
  ...(SUBMISSION ? [`/recruiter/submissions/${SUBMISSION}`] : []),
  ...(SETTLEMENT ? [`/recruiter/settlements/${SETTLEMENT}`] : []),
];

const RECRUITER_PAGES = [
  ...COMMON,
  "/recruiter/requirements",
  "/recruiter/submissions",
  "/recruiter/candidates",
  "/recruiter/interviews",
  "/recruiter/documents",
  "/recruiter/messages",
  ...(ASSIGNMENT ? [`/recruiter/requirements/${ASSIGNMENT}`, `/recruiter/requirements/${ASSIGNMENT}/submit`] : []),
  ...(SUBMISSION ? [`/recruiter/submissions/${SUBMISSION}`] : []),
];
const RECRUITER_FORBIDDEN = ["/recruiter/settlements", "/recruiter/team", "/recruiter/profile", "/recruiter/billing", "/recruiter/performance", "/recruiter/announcements"];

const FINANCE_PAGES = [...COMMON, "/recruiter/settlements", ...(SETTLEMENT ? [`/recruiter/settlements/${SETTLEMENT}`] : [])];
const FINANCE_FORBIDDEN = ["/recruiter/requirements", "/recruiter/submissions", "/recruiter/candidates", "/recruiter/team", "/recruiter/profile", "/recruiter/billing", "/recruiter/messages"];

/**
 * Errors a `next dev` server raises while other people edit files (a hot reload lands before the router is
 * ready). They never happen on a production build and say nothing about the page under test.
 */
const DEV_SERVER_NOISE = /Router action dispatched before initialization|\[HMR\]|\[Fast Refresh\]|WebSocket/i;

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
  await expect(h1, `${path}: one h1`).toHaveCount(1);
  await expect(h1, `${path}: h1 visible`).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /couldn.t find that page|don.t have access/i }), `${path}: not-found or no-access page`).toHaveCount(0);
  page.off("pageerror", onError);
  expect(pageErrors, `${path}: uncaught errors in the browser`).toEqual([]);
}

/** The friendly "no access" page, shown inside the portal (its forbidden.tsx) so the member keeps the menu. */
async function expectNoAccess(page: Page, path: string): Promise<void> {
  await gotoPage(page, path);
  await expect(page.getByRole("heading", { level: 1, name: /don.t have access to this page/i }), path).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }), `${path}: portal menu`).toBeVisible();
}

/** HTTP 404 with the in-portal not-found page (unknown ids and other partners' ids look the same). */
async function expectMissing(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect(response?.status(), path).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: /couldn.t find that page/i }), path).toBeVisible();
}

/**
 * Password sign-in into the Partner Portal. A busy `next dev` server can take longer than the shared helper's
 * 30 s to finish the sign-in (the button stays on "Signing in…"), so give the submitted form more time
 * before failing; the form is submitted once, never retried (repeated attempts would hit the sign-in limit).
 */
async function signInPatiently(page: Page, creds: Account): Promise<void> {
  try {
    await signInAs(page, creds, "/recruiter");
  } catch (error) {
    if (!/did not complete/i.test(String(error))) throw error;
    await page.waitForURL((url) => url.pathname === "/recruiter" || url.pathname.startsWith("/recruiter/"), { timeout: 120_000 }).catch(() => {
      throw error;
    });
    await dismissConsentBanner(page);
  }
}

/** Sign in once and walk the pages, one step each, collecting every 5xx response on the way. */
async function walk(page: Page, creds: Account, pages: string[], forbidden: string[] = []): Promise<void> {
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await signInPatiently(page, creds);
  for (const path of pages) await test.step(path, () => expectPageWorks(page, path));
  for (const path of forbidden) await test.step(`${path} (no access)`, () => expectNoAccess(page, path));
  expect(serverErrors, "server errors").toEqual([]);
}

test.describe("recruitment partner portal smoke", () => {
  // Desktop is enough for a smoke run; the ui-recruiter spec covers small screens.
  test.skip(({ isMobile }) => isMobile, "Desktop only");
  // Up to 30 pages per test; on `next dev` each first visit compiles the route, which can take a minute.
  test.describe.configure({ timeout: 1_500_000 });

  test("owner opens every page", async ({ page }) => {
    test.skip(!OWNER, missing("PARTNER"));
    await walk(page, OWNER!, OWNER_PAGES);
  });

  test("recruiter role opens its pages and is refused the rest", async ({ page }) => {
    test.skip(!RECRUITER, missing("PARTNER_RECRUITER"));
    await walk(page, RECRUITER!, RECRUITER_PAGES, RECRUITER_FORBIDDEN);
  });

  test("settlements-only role opens its pages and is refused the rest", async ({ page }) => {
    test.skip(!FINANCE, missing("PARTNER_FINANCE"));
    await walk(page, FINANCE!, FINANCE_PAGES, FINANCE_FORBIDDEN);
  });

  test("another partner's records are not found, both ways", async ({ page }) => {
    test.skip(!OWNER || !OTHER, `${missing("PARTNER")} / ${missing("OTHER_PARTNER")}`);
    await signInPatiently(page, OTHER!);
    await expectPageWorks(page, "/recruiter");
    if (ASSIGNMENT) {
      await expectMissing(page, `/recruiter/requirements/${ASSIGNMENT}`);
      await expectMissing(page, `/recruiter/requirements/${ASSIGNMENT}/submit`);
    }
    if (SUBMISSION) await expectMissing(page, `/recruiter/submissions/${SUBMISSION}`);
    if (SETTLEMENT) await expectMissing(page, `/recruiter/settlements/${SETTLEMENT}`);

    await page.context().clearCookies();
    await signInPatiently(page, OWNER!);
    if (OTHER_SUBMISSION) await expectMissing(page, `/recruiter/submissions/${OTHER_SUBMISSION}`);
    if (OTHER_SETTLEMENT) await expectMissing(page, `/recruiter/settlements/${OTHER_SETTLEMENT}`);
  });
});
