import { expect, test, type Page } from "@playwright/test";

import { account, missing, signInAs, type Account } from "./partner-institution-helpers";

/**
 * Smoke test of the Command Centre recruitment and people pages (/admin home, owner overview, candidates, applicants
 * and CVs, requirements and posters, jobs, pipeline, interviews, mobilisation, organisations, partners, leads,
 * messages) for three staff roles. Every page opens without a server error or an error screen and shows one visible
 * h1; detail pages are reached through the first row of each list; pages a role may not open show the friendly
 * "no access" page, and unknown ids show the not-found page.
 *
 * Accounts and ids come from the env file written by `npm run db:seed:e2e`:
 * - E2E_ADMIN_* (Super Admin) and E2E_OPS_* (Operations Manager: no content.view, so no requirement posters).
 * - Optional E2E_STAFF_RECRUITER_EMAIL / _PASSWORD: a staff member with the default "Venkat Sai Recruiter" role
 *   (no orgs.view, leads.view, content.view, jobs.manage or partners.assign). Skipped when not set.
 * - Optional ids: E2E_CANDIDATE_ID, E2E_EMPLOYER_JOB_ID, E2E_EMPLOYER_ORG_ID, E2E_PARTNER_ASSIGNMENT_ID,
 *   E2E_PARTNER_SUBMISSION_ID.
 */

const ADMIN = account("ADMIN");
const OPS = account("OPS");
const RECRUITER = account("STAFF_RECRUITER");
const CANDIDATE_ID = process.env.E2E_CANDIDATE_ID;
const JOB_ID = process.env.E2E_EMPLOYER_JOB_ID;
const ORG_ID = process.env.E2E_EMPLOYER_ORG_ID;
const ASSIGNMENT_ID = process.env.E2E_PARTNER_ASSIGNMENT_ID;
const SUBMISSION_ID = process.env.E2E_PARTNER_SUBMISSION_ID;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

/** Pages every role in this spec can open (dashboard.view, candidates.view, requirements.view, recruitment.*). */
const COMMON = [
  "/admin",
  "/admin/overview",
  "/admin/overview?days=90",
  "/admin/help",
  "/admin/candidates",
  "/admin/cv-submissions",
  "/admin/cv-submissions?status=received",
  "/admin/cv-submissions/import",
  "/admin/requirements",
  "/admin/requirements?view=board",
  "/admin/jobs",
  "/admin/pipeline",
  "/admin/pipeline?view=board",
  "/admin/interviews",
  "/admin/interviews/new",
  "/admin/mobilisation",
  "/admin/mobilisation?view=table",
  "/admin/partners",
  "/admin/partners/submissions",
  "/admin/partners/performance",
  "/admin/partners/agreements",
  "/admin/messages",
  "/admin/messages/new",
  ...(CANDIDATE_ID ? [`/admin/candidates/${CANDIDATE_ID}`] : []),
  ...(JOB_ID ? [`/admin/jobs/${JOB_ID}`] : []),
  ...(ASSIGNMENT_ID ? [`/admin/partners/${ASSIGNMENT_ID}`] : []),
  ...(SUBMISSION_ID ? [`/admin/partners/submissions/${SUBMISSION_ID}`] : []),
];

/** Also open for the Operations Manager (orgs, leads, jobs.manage, partners.assign). */
const MANAGER = [
  ...COMMON,
  "/admin/jobs/new",
  "/admin/organizations",
  "/admin/organizations?type=employer",
  "/admin/organizations?type=recruitment_partner",
  "/admin/partners/new",
  "/admin/leads",
  "/admin/leads?tab=enquiries",
  ...(JOB_ID ? [`/admin/jobs/${JOB_ID}/edit`] : []),
  ...(ORG_ID ? [`/admin/organizations/${ORG_ID}`] : []),
];

/** Super Admin only among these roles: requirement posters need content.view. */
const ADMIN_PAGES = [...MANAGER, "/admin/requirements/posters", "/admin/requirements/posters/new"];

/** List page → links to its detail pages (the first one found is opened). */
const DETAILS: { list: string; link: RegExp; needs?: "posters" | "leads" | "orgs" }[] = [
  { list: "/admin/candidates", link: /^\/admin\/candidates\/[0-9a-f-]{36}$/ },
  { list: "/admin/cv-submissions", link: /^\/admin\/cv-submissions\/[0-9a-f-]{36}$/ },
  { list: "/admin/requirements", link: /^\/admin\/requirements\/[0-9a-f-]{36}$/ },
  { list: "/admin/jobs", link: /^\/admin\/jobs\/[0-9a-f-]{36}$/ },
  { list: "/admin/pipeline", link: /^\/admin\/pipeline\/[0-9a-f-]{36}$/ },
  { list: "/admin/interviews?range=all", link: /^\/admin\/interviews\/[0-9a-f-]{36}$/ },
  { list: "/admin/mobilisation?view=table", link: /^\/admin\/mobilisation\/[0-9a-f-]{36}$/ },
  { list: "/admin/messages", link: /^\/admin\/messages\/[0-9a-f-]{36}$/ },
  { list: "/admin/requirements/posters", link: /^\/admin\/requirements\/posters\/[0-9a-f-]{36}\/applicants$/, needs: "posters" },
  { list: "/admin/requirements/posters", link: /^\/admin\/requirements\/posters\/[0-9a-f-]{36}\/matches$/, needs: "posters" },
  { list: "/admin/leads", link: /^\/admin\/leads\/[0-9a-f-]{36}$/, needs: "leads" },
  { list: "/admin/organizations", link: /^\/admin\/organizations\/[0-9a-f-]{36}$/, needs: "orgs" },
];

/** Detail routes that must answer "not found" (never an error screen) for an unknown id. */
const UNKNOWN_IDS = [
  `/admin/candidates/${UNKNOWN}`,
  `/admin/cv-submissions/${UNKNOWN}`,
  `/admin/cv-submissions/not-a-uuid`,
  `/admin/requirements/${UNKNOWN}`,
  `/admin/requirements/${UNKNOWN}/matches`,
  `/admin/jobs/${UNKNOWN}`,
  `/admin/pipeline/${UNKNOWN}`,
  `/admin/interviews/${UNKNOWN}`,
  `/admin/mobilisation/${UNKNOWN}`,
  `/admin/partners/${UNKNOWN}`,
  `/admin/partners/submissions/${UNKNOWN}`,
  `/admin/messages/${UNKNOWN}`,
  `/admin/organizations/${UNKNOWN}`,
  `/admin/leads/${UNKNOWN}`,
  `/admin/leads/enquiries/${UNKNOWN}`,
];

/** Pages the recruiter role may not open (each shows the in-portal "no access" page). */
const RECRUITER_FORBIDDEN = [
  "/admin/requirements/posters",
  "/admin/requirements/posters/new",
  "/admin/jobs/new",
  "/admin/organizations",
  "/admin/leads",
  "/admin/partners/new",
  "/admin/settings",
];

/**
 * Errors a `next dev` server raises while other people edit files (a hot reload lands before the router is
 * ready). They never happen on a production build and say nothing about the page under test.
 */
const DEV_SERVER_NOISE = /Router action dispatched before initialization|\[HMR\]|\[Fast Refresh\]|WebSocket|Failed to fetch RSC payload/i;

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
  await expect(h1, `${path}: one h1`).toHaveCount(1);
  await expect(h1, `${path}: h1 visible`).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /couldn.t find that page|don.t have access/i }), `${path}: not-found or no-access page`).toHaveCount(0);
  page.off("pageerror", onError);
  expect(pageErrors, `${path}: uncaught errors in the browser`).toEqual([]);
}

/** The friendly "no access" page, shown inside the Command Centre so the staff member keeps the menu. */
async function expectNoAccess(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect(response?.status(), `${path}: status`).toBe(403);
  await expect(page.getByRole("heading", { level: 1, name: /don.t have access to this page/i }), path).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }), `${path}: portal menu`).toBeVisible();
}

/**
 * The in-portal not-found page. Pages with a loading screen have already streamed a 200 when the id turns out to
 * be unknown, so the status is only checked to be below 500.
 */
async function expectMissing(page: Page, path: string): Promise<void> {
  const response = await gotoPage(page, path);
  expect(response?.status(), `${path}: status`).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1, name: /couldn.t find that page/i }), path).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
}

/** Open a list and return the first link to one of its detail pages (null when the list is empty). */
async function firstDetailLink(page: Page, list: string, link: RegExp): Promise<string | null> {
  await gotoPage(page, list);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const hrefs = await page.locator("main a[href^='/admin/']").evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.map((h) => h.split("?")[0]!).find((h) => link.test(h)) ?? null;
}

/** Links on the page that point at Command Centre pages, for the "no dead ends" check. */
async function mainLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("main a[href^='/admin']").evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs.filter((h) => !/\/(export|pack|cv|documents|template|share|match-whatsapp)(\?|$)/.test(h)))];
}

type Walk = { creds: Account; pages: string[]; forbidden?: string[]; can: { posters: boolean; leads: boolean; orgs: boolean }; checkLinks?: boolean };

/** Sign in once and walk the pages, one step each, collecting every 5xx response on the way. */
async function walk(page: Page, { creds, pages, forbidden = [], can, checkLinks = false }: Walk): Promise<void> {
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await signInAs(page, creds, "/admin");
  for (const path of pages) await test.step(path, () => expectPageWorks(page, path));
  const details: string[] = [];
  for (const d of DETAILS) {
    if (d.needs && !can[d.needs]) continue;
    const href = await test.step(`first row of ${d.list}`, () => firstDetailLink(page, d.list, d.link));
    if (href) details.push(href);
  }
  for (const path of details) await test.step(path, () => expectPageWorks(page, path));
  for (const path of forbidden) await test.step(`${path} (no access)`, () => expectNoAccess(page, path));
  if (checkLinks) {
    // A role without a permission must not be offered links that end on the "no access" page.
    for (const path of ["/admin", ...details]) {
      await test.step(`links on ${path} lead somewhere this role may go`, async () => {
        await gotoPage(page, path);
        const links = await mainLinks(page);
        for (const link of links) {
          const target = link.split("?")[0]!;
          expect(forbidden.some((f) => target === f || target.startsWith(`${f}/`)), `${path} links to ${link}`).toBe(false);
        }
      });
    }
  }
  expect(serverErrors, "server errors").toEqual([]);
}

test.describe("Command Centre recruitment and people smoke", () => {
  // Desktop is enough for a smoke run; the ui-admin-* specs cover small screens.
  test.skip(({ isMobile }) => isMobile, "Desktop only");
  test.describe.configure({ timeout: 1_200_000 });

  test("Super Admin opens every page", async ({ page }) => {
    test.skip(!ADMIN, missing("ADMIN"));
    await walk(page, { creds: ADMIN!, pages: ADMIN_PAGES, can: { posters: true, leads: true, orgs: true } });
  });

  test("Operations Manager opens its pages and is refused requirement posters", async ({ page }) => {
    test.skip(!OPS, missing("OPS"));
    await walk(page, {
      creds: OPS!,
      pages: MANAGER,
      forbidden: ["/admin/requirements/posters", "/admin/requirements/posters/new"],
      can: { posters: false, leads: true, orgs: true },
    });
  });

  test("recruiter role opens its pages, is refused the rest and is not linked to them", async ({ page }) => {
    test.skip(!RECRUITER, missing("STAFF_RECRUITER"));
    await walk(page, { creds: RECRUITER!, pages: COMMON, forbidden: RECRUITER_FORBIDDEN, can: { posters: false, leads: false, orgs: false }, checkLinks: true });
  });

  test("unknown ids show the not-found page, never an error screen", async ({ page }) => {
    test.skip(!ADMIN, missing("ADMIN"));
    await signInAs(page, ADMIN!, "/admin");
    for (const path of UNKNOWN_IDS) await test.step(path, () => expectMissing(page, path));
  });

  test("route handlers answer bad input with a status, not a crash", async ({ page }) => {
    test.skip(!ADMIN, missing("ADMIN"));
    await signInAs(page, ADMIN!, "/admin");
    const checks: [string, number[]][] = [
      [`/admin/cv-submissions/${UNKNOWN}/pack?type=cv`, [404]],
      [`/admin/cv-submissions/not-a-uuid/pack?type=cv`, [400, 404]],
      [`/admin/candidates/${UNKNOWN}/pack?type=cv`, [404]],
      ["/admin/requirements/match-whatsapp?target=garbage&person=cv:zzz", [400, 404]],
      ["/admin/cv-submissions/export?status=bogus&trade=nope", [200]],
    ];
    for (const [path, statuses] of checks) {
      await test.step(path, async () => {
        const response = await page.request.get(path, { maxRedirects: 0 });
        expect(statuses, `${path}: ${response.status()}`).toContain(response.status());
      });
    }
  });
});
