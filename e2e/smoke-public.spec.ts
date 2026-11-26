import { expect, test, type Page } from "@playwright/test";

import { credentials, fillPasswordSignInForm, type Credentials, type Role } from "./support";

/**
 * Smoke test of the whole public website at desktop size: every page in the header, footer and sitemap opens
 * without a server error or an error screen and shows one visible h1; the detail pages linked from the listings
 * open; unknown links show the friendly not-found page with HTTP 404; the homepage works in every public language
 * (Arabic right to left); the main forms answer an empty submit with friendly field errors; and signed-in users of
 * each portal still see the public site, with a link back to their portal.
 *
 * Accounts come from the env file written by `npm run db:seed:e2e` (E2E_<KEY>_EMAIL / E2E_<KEY>_PASSWORD).
 */

/** Pages in the header, footer and sitemap, plus the public tools that are only linked from inside the site. */
const PUBLIC_PAGES = [
  "/",
  "/jobs",
  "/jobs?q=welder",
  "/requirements",
  "/requirements/submit",
  "/send-cv",
  "/send-cv?ref=NOPE1234",
  "/send-cv?requirement=no-such-requirement",
  "/send-cv/documents",
  "/status",
  "/refer",
  "/book",
  "/resume-service",
  "/resume-service/download",
  "/share/choose",
  "/review/not-a-real-token",
  "/careers",
  "/training",
  "/services",
  "/industries",
  "/global-reach",
  "/employers",
  "/employers/request",
  "/candidates",
  "/partners",
  "/institutions",
  "/about",
  "/success-stories",
  "/news",
  "/blog",
  "/events",
  "/gallery",
  "/videos",
  "/faqs",
  "/contact",
  "/support",
  "/grievance",
  "/safe-recruitment",
  "/verify-certificate",
  "/search",
  "/search?q=welder",
  "/cookie-preferences",
  "/legal/privacy-policy",
  "/legal/terms",
  "/legal/cookie-policy",
  "/legal/data-rights",
  "/legal/image-credits",
  "/sign-in",
  "/sign-up",
  "/sign-up?intent=candidate",
  "/sign-up?intent=travel_agency",
  "/sign-up?intent=employer",
  "/sign-up?intent=partner",
  "/sign-up?intent=institution",
  "/forgot-password",
];

/** Listings whose first detail link must open as well (the slugs come from the database). */
const LISTINGS: { path: string; detail: RegExp }[] = [
  { path: "/jobs", detail: /^\/jobs\/[a-z0-9-]+$/ },
  { path: "/requirements", detail: /^\/requirements\/(?!submit$)[a-z0-9-]+$/ },
  { path: "/training", detail: /^\/training\/[a-z0-9-]+$/ },
  { path: "/services", detail: /^\/services\/[a-z0-9-]+$/ },
  { path: "/book", detail: /^\/book\/[A-Za-z0-9-]+$/ },
];

/** Unknown links: the friendly not-found page inside the site, with a 404 status. */
const NOT_FOUND = [
  "/no-such-page-anywhere",
  "/jobs/no-such-job",
  "/requirements/no-such-requirement",
  "/training/no-such-course",
  "/services/no-such-service",
  "/book/NOPE123",
  "/employers/no-such-employer",
];

const PORTAL_ROLES: { role: Role; link: RegExp }[] = [
  { role: "candidate", link: /go to people portal/i },
  { role: "employer", link: /go to (company|travel agency) portal/i },
  { role: "partner", link: /go to partner portal/i },
  { role: "institution", link: /go to institution portal/i },
  { role: "admin", link: /go to command centre/i },
];

/**
 * Errors a `next dev` server raises while other people edit files (a hot reload lands before the router is
 * ready). They never happen on a production build and say nothing about the page under test.
 */
const DEV_SERVER_NOISE = /Router action dispatched before initialization|\[HMR\]|\[Fast Refresh\]|WebSocket/i;

/**
 * On a `next dev` server, other people's edits push hot-reload messages that reload the page in the middle of a
 * check. Pass the socket through but drop those messages. A production server has no such socket.
 */
async function ignoreDevReloads(page: Page): Promise<void> {
  await page.context().routeWebSocket(/\/_next\/(webpack-)?hmr/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (typeof message === "string" && /"type":"(turbopack-message|reloadPage|serverComponentChanges|serverOnlyChanges)"/.test(message)) return;
      ws.send(message);
    });
  });
}

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

/** The page answers without an error, shows no error screen and has exactly one visible h1. */
async function expectPageWorks(page: Page, path: string): Promise<void> {
  const pageErrors: string[] = [];
  const onError = (error: Error) => {
    if (!DEV_SERVER_NOISE.test(error.message)) pageErrors.push(error.message.slice(0, 200));
  };
  page.on("pageerror", onError);
  const response = await gotoPage(page, path);
  expect(response?.status(), `${path}: status`).toBeLessThan(400);
  const h1 = page.getByRole("heading", { level: 1 });
  // Generous first wait: on a busy dev server the browser can be busy hydrating for a while after "load".
  await expect(h1, `${path}: one h1`).toHaveCount(1, { timeout: 60_000 });
  await expect(h1, `${path}: h1 visible`).toBeVisible();
  await expect(page.locator('[data-slot="route-error"]'), `${path}: error screen`).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /this page is not here/i }), `${path}: not-found page`).toHaveCount(0);
  await expect(page, `${path}: page title`).toHaveTitle(/\S/);
  page.off("pageerror", onError);
  expect(pageErrors, `${path}: uncaught errors in the browser`).toEqual([]);
}

/**
 * Password sign-in that allows for a slow first compile on a dev server (the shared signInWith waits 30 s), then
 * waits until the app has left the sign-in screen for the account's portal.
 */
async function signInSlowly(page: Page, creds: Credentials): Promise<void> {
  await gotoPage(page, "/sign-in");
  await fillPasswordSignInForm(page, creds);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 180_000 });
}

/** Collect every 5xx response (documents, data requests and form posts) while a test runs. */
function watchServerErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return () => errors;
}

/** The cookie banner covers the bottom of the page until a choice is made. */
async function rejectOptionalCookies(page: Page): Promise<void> {
  const reject = page.getByRole("region", { name: /your privacy choices/i }).getByRole("button", { name: /reject non-essential/i });
  await expect(async () => {
    if (await reject.isVisible()) await reject.click({ timeout: 2_000 });
    await expect(reject).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("public website smoke", () => {
  // Desktop is enough for a smoke run; ui-public-marketing and ui-public-content cover small screens.
  test.skip(({ isMobile }) => isMobile, "Desktop only");
  test.describe.configure({ timeout: 900_000 });
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => ignoreDevReloads(page));

  // Groups of pages, so a slow first compile on a dev server cannot push one long walk past the time limit.
  const GROUP_SIZE = 5;
  const groups = Array.from({ length: Math.ceil(PUBLIC_PAGES.length / GROUP_SIZE) }, (_, i) => PUBLIC_PAGES.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE));
  groups.forEach((paths, i) => {
    test(`a signed-out visitor opens every public page (${i + 1}/${groups.length})`, async ({ page }) => {
      const serverErrors = watchServerErrors(page);
      for (const path of paths) await test.step(path, () => expectPageWorks(page, path));
      expect(serverErrors(), "server errors").toEqual([]);
    });
  });

  test("the first detail page of every listing opens", async ({ page }) => {
    const serverErrors = watchServerErrors(page);
    for (const { path, detail } of LISTINGS) {
      await test.step(path, async () => {
        await gotoPage(page, path);
        const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
        const href = hrefs.map((h) => h.split(/[?#]/)[0]).find((h) => detail.test(h));
        // An empty listing is a valid state (no open dates, no requirements); the empty message is checked above.
        if (href) await expectPageWorks(page, href);
      });
    }
    expect(serverErrors(), "server errors").toEqual([]);
  });

  test("every sitemap address answers with a page", async ({ request, baseURL }) => {
    const sitemap = await request.get("/sitemap.xml", { timeout: 180_000 });
    expect(sitemap.ok()).toBeTruthy();
    // The sitemap uses the configured site address; check each path on the server under test.
    const paths = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(paths.length).toBeGreaterThan(10);
    const failures: string[] = [];
    const check = async (path: string) => {
      const response = await request.get(new URL(path, baseURL).toString(), { timeout: 180_000 });
      if (response.status() !== 200) failures.push(`${response.status()} ${path}`);
      else if (!/<h1[\s>]/.test(await response.text())) failures.push(`no h1 ${path}`);
    };
    // A few at a time: quick on a production build, and bearable while a dev server compiles each route once.
    for (let i = 0; i < paths.length; i += 4) await Promise.all(paths.slice(i, i + 4).map(check));
    expect(failures, "sitemap addresses that do not open").toEqual([]);
  });

  test("unknown links show the friendly not-found page with a 404", async ({ page }) => {
    for (const path of NOT_FOUND) {
      await test.step(path, async () => {
        const response = await gotoPage(page, path);
        expect(response?.status(), path).toBe(404);
        const h1 = page.getByRole("heading", { level: 1 });
        await expect(h1, path).toHaveCount(1);
        await expect(h1, path).toBeVisible();
        await expect(page.locator('[data-slot="route-error"]'), path).toHaveCount(0);
        await expect(page.getByRole("link", { name: /homepage|browse open jobs|explore jobs|latest requirements|see all/i }).first(), path).toBeVisible();
      });
    }
  });

  test("the homepage works in every public language, Arabic right to left", async ({ page }) => {
    for (const lang of ["hi", "te", "or", "ar"] as const) {
      await test.step(lang, async () => {
        await expectPageWorks(page, `/?lang=${lang}`);
        await expect(page.locator(`main [lang="${lang}"]`).first(), lang).toBeAttached();
        if (lang === "ar") await expect(page.locator('main [lang="ar"][dir="rtl"]').first()).toBeAttached();
      });
    }
  });

  test("the main forms answer an empty submit with friendly field errors", async ({ page }) => {
    const serverErrors = watchServerErrors(page);

    await test.step("send your CV", async () => {
      await gotoPage(page, "/send-cv");
      await rejectOptionalCookies(page);
      await page.getByRole("button", { name: /apply now/i }).click();
      await expect(page.getByRole("alert").filter({ hasText: /your name is required/i }).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText("Phone number is required").first()).toBeVisible();
      await expect(page.locator('[data-slot="route-error"]')).toHaveCount(0);
    });

    await test.step("contact", async () => {
      await gotoPage(page, "/contact");
      await page.getByRole("button", { name: /send message/i }).click();
      await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('[data-slot="route-error"]')).toHaveCount(0);
    });

    await test.step("sign in with a wrong password", async () => {
      await gotoPage(page, "/sign-in");
      const form = page.locator("form").filter({ has: page.locator('input[type="password"]') }).first();
      await form.getByLabel("Email or mobile number").fill("nobody-smoke-public@example.com");
      await form.locator('input[type="password"]').fill("Not-the-right-password-1");
      await form.getByRole("button", { name: "Sign in", exact: true }).click();
      const alert = page.getByRole("alert").filter({ hasText: /\S/ }).first();
      await expect(alert).toBeVisible({ timeout: 45_000 });
      await expect(alert).not.toContainText(/error:|exception|stack|undefined|null/i);
      await expect(page).toHaveURL(/\/sign-in/);
    });

    expect(serverErrors(), "server errors").toEqual([]);
  });

  for (const { role, link } of PORTAL_ROLES) {
    test(`signed in as ${role}, the public site still works and links back to the portal`, async ({ page }) => {
      const creds = credentials(role);
      test.skip(!creds, `E2E credentials for ${role} are not set (run npm run db:seed:e2e and source the env file)`);
      const serverErrors = watchServerErrors(page);
      await signInSlowly(page, creds!);
      for (const path of ["/", "/jobs", "/requirements", "/contact"]) {
        await test.step(path, async () => {
          await expectPageWorks(page, path);
          await expect(page.getByRole("banner").getByRole("link", { name: link }), `${path}: link to the portal`).toBeVisible();
        });
      }
      // Signed-in users who open the sign-in page are sent on to their portal instead.
      await gotoPage(page, "/sign-in");
      await expect(page).not.toHaveURL(/\/sign-in(\?|$)/);
      expect(serverErrors(), "server errors").toEqual([]);
    });
  }
});
