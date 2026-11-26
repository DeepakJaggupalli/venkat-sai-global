import { expect, test, type Page } from "@playwright/test";

import { account, expectForbidden, expectNotFound, missing, signInAs, type Account } from "./partner-institution-helpers";

/**
 * Smoke test of the whole Institution Portal (/institution) for each institution role: every page in the menu
 * and the main detail pages open without a server error or an error screen, and show one visible h1. Pages a
 * role may not open show the friendly "no access" page; another institution's records are not found.
 *
 * Accounts and ids come from the env file written by `npm run db:seed:e2e` (see ui-institution.spec.ts):
 * E2E_INSTITUTION_* (owner), E2E_INSTITUTION_PLACEMENTS_* (dashboard + placements only),
 * E2E_OTHER_INSTITUTION_*, E2E_INSTITUTION_COURSE_ID, E2E_INSTITUTION_BATCH_ID, E2E_INSTITUTION_QA_BATCH_ID,
 * E2E_OTHER_BATCH_ID, E2E_OTHER_INSTITUTION_COURSE_ID.
 */

const OWNER = account("INSTITUTION");
const PLACEMENTS = account("INSTITUTION_PLACEMENTS");
const OTHER = account("OTHER_INSTITUTION");
const COURSE = process.env.E2E_INSTITUTION_COURSE_ID;
const BATCH = process.env.E2E_INSTITUTION_BATCH_ID;
const QA_BATCH = process.env.E2E_INSTITUTION_QA_BATCH_ID;
const OTHER_BATCH = process.env.E2E_OTHER_BATCH_ID;
const OTHER_COURSE = process.env.E2E_OTHER_INSTITUTION_COURSE_ID;

/** Pages every member can open (the workspace, help, messages and support need no extra permission). */
const COMMON = ["/institution", "/institution/help", "/institution/messages", "/institution/messages/new", "/institution/support", "/institution/support/new"];

const OWNER_PAGES = [
  ...COMMON,
  "/institution/courses",
  "/institution/courses/new",
  "/institution/batches",
  "/institution/batches/new",
  "/institution/students",
  "/institution/assessments",
  "/institution/certificates",
  "/institution/placements",
  "/institution/placements?tab=outcomes",
  "/institution/reports",
  "/institution/profile",
  "/institution/team",
  "/institution/announcements",
  "/institution/billing",
  "/institution/billing/invoices",
  "/institution/billing/payments",
  "/institution/billing/details",
  "/institution/onboarding",
  ...(COURSE ? [`/institution/courses/${COURSE}`, `/institution/courses/${COURSE}/edit`, `/institution/batches/new?course=${COURSE}`] : []),
  ...(BATCH ? [`/institution/batches/${BATCH}`, `/institution/batches/${BATCH}/edit`, `/institution/students?batch=${BATCH}`] : []),
  ...(QA_BATCH
    ? [`/institution/batches/${QA_BATCH}?tab=learners`, `/institution/batches/${QA_BATCH}?tab=attendance`, `/institution/batches/${QA_BATCH}?tab=assessments`]
    : []),
];

const PLACEMENTS_PAGES = [...COMMON, "/institution/placements", "/institution/placements?tab=outcomes"];
const PLACEMENTS_FORBIDDEN = [
  "/institution/courses",
  "/institution/batches",
  "/institution/students",
  "/institution/assessments",
  "/institution/certificates",
  "/institution/reports",
  "/institution/profile",
  "/institution/team",
  "/institution/announcements",
  "/institution/billing",
];

/**
 * Errors a `next dev` server raises while other people edit files (a hot reload lands before the router is
 * ready). They never happen on a production build and say nothing about the page under test.
 */
const DEV_SERVER_NOISE = /Router action dispatched before initialization|[HMR]|[Fast Refresh]|WebSocket/i;

/** A first visit to a route compiles it on a dev server, and a hot reload can land meanwhile: be patient. */
const SLOW = { timeout: 60_000 };

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
  await expect(h1, `${path}: h1 visible`).toBeVisible(SLOW);
  await expect(h1, `${path}: one h1`).toHaveCount(1);
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /couldn.t find that page|don.t have access/i }), `${path}: not-found or no-access page`).toHaveCount(0);
  page.off("pageerror", onError);
  expect(pageErrors, `${path}: uncaught errors in the browser`).toEqual([]);
}

/** Sign in once and walk the pages, one step each, collecting every 5xx response on the way. */
async function walk(page: Page, creds: Account, pages: string[], forbidden: string[] = []): Promise<void> {
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await signInAs(page, creds, "/institution");
  for (const path of pages) await test.step(path, () => expectPageWorks(page, path));
  for (const path of forbidden) await test.step(`${path} (no access)`, () => expectForbidden(page, path));
  expect(serverErrors, "server errors").toEqual([]);
}

test.describe("institution portal smoke", () => {
  // Desktop is enough for a smoke run; the ui-institution spec covers small screens.
  test.skip(({ isMobile }) => isMobile, "Desktop only");
  test.describe.configure({ timeout: 600_000 });

  test("owner opens every page", async ({ page }) => {
    test.skip(!OWNER, missing("INSTITUTION"));
    await walk(page, OWNER!, OWNER_PAGES);
  });

  test("placements-only member opens its pages and is refused the rest", async ({ page }) => {
    test.skip(!PLACEMENTS, missing("INSTITUTION_PLACEMENTS"));
    await walk(page, PLACEMENTS!, PLACEMENTS_PAGES, PLACEMENTS_FORBIDDEN);
    const csv = await page.request.get("/institution/reports/export");
    expect(csv.status(), "report export without institution.reports.view").toBe(403);
  });

  test("unknown and malformed links stay inside the portal", async ({ page }) => {
    test.skip(!OWNER, missing("INSTITUTION"));
    await signInAs(page, OWNER!, "/institution");
    await expectNotFound(page, "/institution/no-such-page");
    await expectNotFound(page, "/institution/courses/not-a-real-id");
    await expectNotFound(page, "/institution/batches/00000000-0000-4000-8000-000000000000");
    await expectNotFound(page, "/institution/placements/drives/00000000-0000-4000-8000-000000000000");
    // Odd query strings never break a list page.
    await expectPageWorks(page, "/institution/students?page=-5&status=%3Cscript%3E");
    await expectPageWorks(page, "/institution/certificates?status=zzz&page=99999");
  });

  test("another institution's records are not found, both ways", async ({ page }) => {
    test.skip(!OWNER || !OTHER, `${missing("INSTITUTION")} / ${missing("OTHER_INSTITUTION")}`);
    await signInAs(page, OTHER!, "/institution");
    await expectPageWorks(page, "/institution");
    if (COURSE) {
      await expectNotFound(page, `/institution/courses/${COURSE}`);
      await expectNotFound(page, `/institution/courses/${COURSE}/edit`);
    }
    if (BATCH) {
      await expectNotFound(page, `/institution/batches/${BATCH}`);
      await expectNotFound(page, `/institution/batches/${BATCH}/edit`);
    }

    await page.context().clearCookies();
    await signInAs(page, OWNER!, "/institution");
    if (OTHER_COURSE) await expectNotFound(page, `/institution/courses/${OTHER_COURSE}`);
    if (OTHER_BATCH) {
      await expectNotFound(page, `/institution/batches/${OTHER_BATCH}`);
      await expectNotFound(page, `/institution/batches/${OTHER_BATCH}/edit`);
    }
  });
});
