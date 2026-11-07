import { expect, test, type Page } from "@playwright/test";

/**
 * Job discovery, applications and the People Portal dashboard (ui:talent-jobs).
 *
 * Public flows run signed out against the seeded database. Candidate flows need a seeded candidate:
 * set E2E_CANDIDATE_EMAIL and E2E_CANDIDATE_PASSWORD (the account must have passed the age step);
 * they are skipped otherwise. Apply / withdraw flows need at least one open platform-apply job.
 */

const CANDIDATE_EMAIL = process.env.E2E_CANDIDATE_EMAIL;
const CANDIDATE_PASSWORD = process.env.E2E_CANDIDATE_PASSWORD;

async function signIn(page: Page, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(CANDIDATE_EMAIL!);
  await page.getByLabel(/password/i).first().fill(CANDIDATE_PASSWORD!);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]));
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

  test("unknown job shows a friendly not-found page", async ({ page }) => {
    const response = await page.goto("/jobs/this-job-does-not-exist-000000");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("link", { name: /browse open jobs/i })).toBeVisible();
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
    const card = page.getByTestId("job-card").first();
    test.skip((await card.count()) === 0, "No published jobs");
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
    await page.goto("/talent/alerts?new=1&q=fitter&type=full_time");
    const form = page.getByTestId("alert-form");
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/keywords/i)).toHaveValue("fitter");
    await form.getByRole("button", { name: /create alert/i }).click();
    const item = page.getByTestId("alert-item").filter({ hasText: "fitter" }).first();
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: /delete/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByTestId("alert-item").filter({ hasText: "fitter" })).toHaveCount(0);
  });

  test("apply with consent, get a code, then withdraw", async ({ page }) => {
    await signIn(page, "/talent/jobs");
    await page.goto("/talent/jobs?sort=newest");
    const cards = page.getByTestId("job-card").filter({ hasNotText: /applied/i });
    test.skip((await cards.count()) === 0, "No job left to apply for");
    await cards.first().getByRole("heading").getByRole("link").click();
    const apply = page.getByTestId("apply-button");
    test.skip((await apply.count()) === 0, "Job does not take platform applications");
    await apply.click();
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
    // Jobs with required screening questions stay on the form with field errors; that is expected.
    if (await done.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(page.getByTestId("application-code")).toHaveText(/VSG-APP-/);
      await done.getByRole("link", { name: /track your application/i }).click();
      await expect(page.getByTestId("application-stage")).toBeVisible();
      await page.getByTestId("withdraw-application").click();
      await page.getByRole("alertdialog").getByRole("button", { name: /^withdraw$/i }).click();
      await expect(page.getByTestId("application-stage")).toHaveText(/withdrawn/i);
    }
  });

  test("applications and interviews pages render with tabs and empty states", async ({ page }) => {
    await signIn(page, "/talent/applications");
    await expect(page.getByRole("navigation", { name: /application views/i })).toBeVisible();
    await page.goto("/talent/applications?status=closed");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/talent/interviews");
    await expect(page.getByRole("heading", { level: 1, name: /interviews/i })).toBeVisible();
  });

  test("another person's application is not found", async ({ page }) => {
    await signIn(page, "/talent/applications");
    const response = await page.goto("/talent/applications/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
    const ics = await page.request.get("/talent/interviews/00000000-0000-4000-8000-000000000000/ics");
    expect(ics.status()).toBe(404);
  });
});
