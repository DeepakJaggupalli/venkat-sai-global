import { expect, test, type Page } from "@playwright/test";

import { signIn as signInAs, signInWith } from "./support";
import { dismissCookieBanner, expectHealthyPage, expectTranslated, watchServerErrors } from "./talent-helpers";

/**
 * Job discovery, applications and the People Portal dashboard (ui:talent-jobs).
 *
 * Public flows run signed out against the seeded database. Candidate flows need a seeded candidate:
 * set E2E_CANDIDATE_EMAIL and E2E_CANDIDATE_PASSWORD (the account must have passed the age step);
 * they are skipped otherwise. The apply / withdraw flow uses the People Portal test job from the E2E seed
 * (E2E_TALENT_APPLY_JOB_ID / _SLUG), so the shared employer jobs stay untouched. The children's-data checks use
 * the seeded minor without guardian consent (E2E_MINOR_*) and the 16-year-old with consent on file
 * (E2E_TALENT_CONSENTED_MINOR_*).
 */

const CANDIDATE_EMAIL = process.env.E2E_CANDIDATE_EMAIL;
const CANDIDATE_PASSWORD = process.env.E2E_CANDIDATE_PASSWORD;
const APPLY_JOB_ID = process.env.E2E_TALENT_APPLY_JOB_ID;
const APPLY_JOB_SLUG = process.env.E2E_TALENT_APPLY_JOB_SLUG;
const OVERSEAS_JOB_ID = process.env.E2E_EMPLOYER_OVERSEAS_JOB_ID;
const OVERSEAS_JOB_SLUG = process.env.E2E_EMPLOYER_OVERSEAS_JOB_SLUG;
const CONSENTED_MINOR = { email: process.env.E2E_TALENT_CONSENTED_MINOR_EMAIL, password: process.env.E2E_TALENT_CONSENTED_MINOR_PASSWORD };

async function signIn(page: Page, returnTo: string) {
  await signInAs(page, "candidate", { returnTo });
  await dismissCookieBanner(page);
}

test.describe("public job board", () => {
  test("lists jobs with search, filters and an honest count", async ({ page }) => {
    const response = await page.goto("/jobs");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("job-result-count")).toBeVisible();
    await expect(page.getByRole("link", { name: /how to stay safe/i }).first()).toHaveAttribute("href", "/safe-recruitment");

    // Keywords are URL-synced (debounced) and reset the page.
    await page.getByRole("searchbox").first().fill("welder");
    await page.getByRole("searchbox").first().press("Enter");
    await expect(page).toHaveURL(/[?&]q=welder/);
  });

  test("filters are URL-driven and survive a reload", async ({ page }) => {
    await page.goto("/jobs?overseas=1&type=full_time&sort=newest");
    await expect(page.getByTestId("job-result-count")).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/overseas=1/);
    await expect(page).toHaveURL(/type=full_time/);
  });

  test("mobile filter sheet opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/jobs");
    await page.getByTestId("open-filters").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /show \d+ job/i }).click();
    await expect(dialog).toBeHidden();
    // No horizontal page scroll at 360px.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("job page shows details, JSON-LD and a sign-in-first apply", async ({ page }) => {
    await page.goto("/jobs");
    const first = page.getByTestId("job-card").first();
    test.skip((await first.count()) === 0, "No published jobs in the seeded database");
    await first.getByRole("heading").getByRole("link").click();
    await expect(page.getByTestId("job-detail")).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    const apply = page.getByTestId("apply-button");
    if (await apply.count()) await expect(apply).toHaveAttribute("href", /\/sign-in\?returnTo=%2Ftalent%2Fapply%2F/);
    await expect(page.getByTestId("copy-job-link")).toBeVisible();
  });

  test("overseas job names the recruiting agent and its eMigrate registration", async ({ page }) => {
    test.skip(!OVERSEAS_JOB_SLUG, "Set E2E_EMPLOYER_OVERSEAS_JOB_SLUG");
    await page.goto(`/jobs/${OVERSEAS_JOB_SLUG}`);
    await expect(page.getByTestId("job-detail")).toBeVisible();
    await expect(page.getByText(/recruiting agent/i).first()).toBeVisible();
    await expect(page.getByText(/emigrate registration/i).first()).toBeVisible();
    await expect(page.getByText(/never be asked to pay/i).first()).toBeVisible();
  });

  test("unknown job shows a friendly not-found page", async ({ page }) => {
    const response = await page.goto("/jobs/this-job-does-not-exist-000000");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("link", { name: /browse open jobs/i })).toBeVisible();
  });

  test("job board and job pages are healthy", async ({ page }) => {
    const serverErrors = watchServerErrors(page);
    for (const path of ["/jobs", APPLY_JOB_SLUG ? `/jobs/${APPLY_JOB_SLUG}` : null, OVERSEAS_JOB_SLUG ? `/jobs/${OVERSEAS_JOB_SLUG}` : null].filter((p): p is string => Boolean(p))) {
      await expectHealthyPage(page, path);
    }
    expect(serverErrors()).toEqual([]);
  });

  test("job board and job pages render in Hindi and Telugu without raw keys", async ({ page, context, baseURL }) => {
    for (const locale of ["hi", "te"] as const) {
      await context.addCookies([{ name: "vsg_locale", value: locale, url: baseURL! }]);
      for (const path of ["/jobs", APPLY_JOB_SLUG ? `/jobs/${APPLY_JOB_SLUG}` : null, OVERSEAS_JOB_SLUG ? `/jobs/${OVERSEAS_JOB_SLUG}` : null].filter((p): p is string => Boolean(p))) {
        await expectTranslated(page, path, locale);
      }
    }
  });

  test("keyboard focus is visible on the job board", async ({ page }) => {
    await page.goto("/jobs");
    await dismissCookieBanner(page);
    await page.locator("main").first().focus().catch(() => undefined);
    let checked = 0;
    for (let i = 0; i < 60 && checked < 5; i++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest("main") || el === document.body) return null;
        const own = getComputedStyle(el);
        const after = getComputedStyle(el, "::after");
        const visible = (own.outlineStyle !== "none" && parseFloat(own.outlineWidth) > 0) || own.boxShadow !== "none" || after.boxShadow !== "none";
        return { label: `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}`, visible };
      });
      if (!focus) continue;
      checked++;
      expect(focus.visible, `no visible focus indicator on ${focus.label}`).toBeTruthy();
    }
    expect(checked, "keyboard focus never reached the main content").toBeGreaterThan(0);
  });
});

test.describe("People Portal", () => {
  test.skip(!CANDIDATE_EMAIL || !CANDIDATE_PASSWORD, "Set E2E_CANDIDATE_EMAIL and E2E_CANDIDATE_PASSWORD");

  test("dashboard shows live blocks only", async ({ page }) => {
    await signIn(page, "/talent");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /recommended jobs/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^applications$/i })).toBeVisible();
  });

  test("discover, save and see a saved job", async ({ page }) => {
    await signIn(page, "/talent/jobs");
    // The E2E seed publishes jobs, so an empty list here is a failure, not a reason to skip.
    await expect(page.getByTestId("job-result-count")).toBeVisible();
    const card = page.getByTestId("job-card").first();
    await expect(card).toBeVisible();
    const save = card.getByTestId("save-job");
    const wasSaved = (await save.getAttribute("aria-pressed")) === "true";
    if (!wasSaved) {
      await save.click();
      await expect(save).toHaveAttribute("aria-pressed", "true");
    }
    await page.goto("/talent/saved");
    await expect(page.getByTestId("job-card").first()).toBeVisible();
  });

  test("create and delete a job alert from a search", async ({ page }) => {
    await signIn(page, "/talent/alerts");
    // Alerts left by an interrupted run count towards the 10-alert limit: clear them first.
    const leftovers = page.getByTestId("alert-item").filter({ hasText: /fitter/i });
    while ((await leftovers.count()) > 0) {
      const before = await leftovers.count();
      await leftovers.first().getByRole("button", { name: /delete/i }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
      await expect(leftovers).toHaveCount(before - 1);
    }

    const keyword = `fitter${Date.now().toString(36)}`;
    await page.goto(`/talent/alerts?new=1&q=${keyword}&type=full_time`);
    const form = page.getByTestId("alert-form");
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/keywords/i)).toHaveValue(keyword);
    await form.getByRole("button", { name: /create alert/i }).click();
    const item = page.getByTestId("alert-item").filter({ hasText: keyword }).first();
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: /delete/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByTestId("alert-item").filter({ hasText: keyword })).toHaveCount(0);
  });

  test("apply with consent, get a code, then withdraw", async ({ page }) => {
    test.skip(!APPLY_JOB_SLUG, "Set E2E_TALENT_APPLY_JOB_SLUG (npm run db:seed:e2e)");
    await signIn(page, `/talent/jobs/${APPLY_JOB_SLUG}`);
    await expect(page.getByTestId("job-detail")).toBeVisible();

    // A run that failed after applying leaves an open application; withdraw it so this run starts clean.
    const existing = page.getByRole("link", { name: /view your application/i });
    if (await existing.isVisible()) {
      await existing.click();
      await page.getByTestId("withdraw-application").click();
      await page.getByRole("alertdialog").getByRole("button", { name: /^withdraw$/i }).click();
      await expect(page.getByTestId("application-stage")).toHaveText(/withdrawn/i);
      await page.goto(`/talent/jobs/${APPLY_JOB_SLUG}`);
      await expect(page.getByTestId("job-detail")).toBeVisible();
    }

    await page.getByTestId("apply-button").click();
    const form = page.getByTestId("apply-form");
    await expect(form).toBeVisible();

    // Consent is required: submitting without it shows inline errors.
    await page.getByTestId("submit-application").click();
    await expect(form.getByText(/agree to share/i).first()).toBeVisible();

    await form.getByRole("checkbox", { name: /agree to share my profile/i }).check();
    await form.getByRole("checkbox", { name: /resume and the documents/i }).check();
    await form.getByRole("checkbox", { name: /information I am sharing is true/i }).check();
    await page.getByTestId("submit-application").click();

    const done = page.getByTestId("apply-confirmation");
    await expect(done).toBeVisible();
    await expect(page.getByTestId("application-code")).toHaveText(/VSG-APP-/);
    await done.getByRole("link", { name: /track your application/i }).click();
    await expect(page.getByTestId("application-stage")).toBeVisible();
    await page.getByTestId("withdraw-application").click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^withdraw$/i }).click();
    await expect(page.getByTestId("application-stage")).toHaveText(/withdrawn/i);
  });

  test("applications and interviews pages render with tabs and empty states", async ({ page }) => {
    await signIn(page, "/talent/applications");
    await expect(page.getByRole("navigation", { name: /application views/i })).toBeVisible();
    await page.goto("/talent/applications?status=closed");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/talent/interviews");
    await expect(page.getByRole("heading", { level: 1, name: /interviews/i })).toBeVisible();
  });

  // People Portal pages stream behind the portal's loading skeleton, so the HTTP status is already 200 when a
  // page calls notFound() (Next.js then adds noindex). What matters is that an unknown id and another person's
  // id get the same not-found page, with nothing of the other application in it.
  test("another person's application is not found", async ({ page }) => {
    await signIn(page, "/talent/applications");
    const foreign = [process.env.E2E_EMPLOYER_QA_APPLICATION_ID, "00000000-0000-4000-8000-000000000000", "not-a-uuid"].filter(Boolean) as string[];
    for (const id of foreign) {
      await page.goto(`/talent/applications/${id}`);
      await expect(page.getByTestId("talent-not-found")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByTestId("application-stage")).toHaveCount(0);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    }
    const ics = await page.request.get("/talent/interviews/00000000-0000-4000-8000-000000000000/ics");
    expect(ics.status()).toBe(404);
  });

  test("unknown messages, support requests and jobs show the same not-found page", async ({ page }) => {
    await signIn(page, "/talent");
    const unknown = "00000000-0000-4000-8000-000000000000";
    for (const path of [`/talent/messages/${unknown}`, `/talent/support/${unknown}`, "/talent/jobs/this-job-does-not-exist-000000"]) {
      await page.goto(path);
      await expect(page.getByTestId("talent-not-found")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });

  test("dashboard, jobs, applications, messages and support pages are healthy", async ({ page }) => {
    test.setTimeout(240_000);
    const serverErrors = watchServerErrors(page);
    await signIn(page, "/talent");
    const paths = [
      "/talent",
      "/talent/jobs",
      APPLY_JOB_SLUG ? `/talent/jobs/${APPLY_JOB_SLUG}` : null,
      APPLY_JOB_ID ? `/talent/apply/${APPLY_JOB_ID}` : null,
      "/talent/saved",
      "/talent/alerts",
      "/talent/applications",
      process.env.E2E_EMPLOYER_APPLICATION_ID ? `/talent/applications/${process.env.E2E_EMPLOYER_APPLICATION_ID}` : null,
      "/talent/interviews",
      "/talent/messages",
      "/talent/support",
      "/talent/support/new",
    ].filter((p): p is string => Boolean(p));
    for (const path of paths) await expectHealthyPage(page, path);
    expect(serverErrors()).toEqual([]);
  });

  test("dashboard, jobs and applications render in Hindi and Telugu without raw keys", async ({ page, context, baseURL }) => {
    test.setTimeout(240_000);
    await signIn(page, "/talent");
    // The cookie only, so the shared account's saved language (users.locale) is left alone for other specs.
    for (const locale of ["hi", "te"] as const) {
      await context.addCookies([{ name: "vsg_locale", value: locale, url: baseURL! }]);
      for (const path of ["/talent", "/talent/jobs", APPLY_JOB_SLUG ? `/talent/jobs/${APPLY_JOB_SLUG}` : null, "/talent/saved", "/talent/alerts", "/talent/applications", "/talent/interviews", "/talent/messages", "/talent/support"].filter(
        (p): p is string => Boolean(p),
      )) {
        await expectTranslated(page, path, locale);
      }
    }
  });
});

test.describe("children's data (DPDP Rules 2025)", () => {
  test("a minor without guardian consent is held at the guardian step and cannot save jobs", async ({ page }) => {
    test.skip(!process.env.E2E_MINOR_EMAIL || !APPLY_JOB_SLUG, "Set E2E_MINOR_* and E2E_TALENT_APPLY_JOB_SLUG");
    await signInAs(page, "minor");
    await dismissCookieBanner(page);
    await expect(page.getByTestId("onboarding-guardian-form")).toBeVisible();
    for (const path of ["/talent", "/talent/jobs", `/talent/apply/${APPLY_JOB_ID}`, "/talent/training/courses"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/talent\/onboarding/);
    }
    await page.goto(`/jobs/${APPLY_JOB_SLUG}`);
    await page.getByTestId("save-job").first().click();
    await expect(page.getByText(/parent or guardian needs to give consent/i).first()).toBeVisible();
    await expect(page.getByTestId("save-job").first()).toHaveAttribute("aria-pressed", "false");
  });

  test("a 16-year-old with guardian consent can apply locally but not for an overseas job", async ({ page }) => {
    test.skip(!CONSENTED_MINOR.email || !CONSENTED_MINOR.password || !OVERSEAS_JOB_ID || !APPLY_JOB_ID, "Set E2E_TALENT_CONSENTED_MINOR_* and the job ids (npm run db:seed:e2e)");
    await signInWith(page, { email: CONSENTED_MINOR.email!, password: CONSENTED_MINOR.password! }, { returnTo: `/talent/apply/${OVERSEAS_JOB_ID}`, expectPath: /\/talent\/apply\// });
    await dismissCookieBanner(page);
    await expect(page.getByText(/overseas jobs are open from age 18/i).first()).toBeVisible();
    await expect(page.getByTestId("apply-form")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /explore training/i })).toHaveAttribute("href", "/talent/training");

    // A job in India stays open to them.
    await page.goto(`/talent/apply/${APPLY_JOB_ID}`);
    await expect(page.getByTestId("apply-form")).toBeVisible();
  });
});
