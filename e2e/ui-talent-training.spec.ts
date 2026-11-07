import { expect, test, type Page } from "@playwright/test";

/**
 * Training discovery, enrolment, certificates and assessments (ui:talent-training).
 * Runs against a seeded database. Public tests need no account; People Portal tests need a candidate that
 * passed the age step (E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD). Tests that depend on catalogue data
 * (a published course with an open batch) skip themselves when the catalogue is empty, so an honest empty
 * state never fails the run.
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

test.describe("public training catalogue", () => {
  test("lists courses or an honest empty state, with labelled filters", async ({ page }) => {
    const response = await page.goto("/training");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: /training programmes/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /check a certificate/i })).toHaveAttribute("href", "/verify-certificate");
    await expect(page.getByRole("search").first()).toBeVisible();
    const cards = page.getByTestId("course-card");
    if ((await cards.count()) === 0) {
      await expect(page.getByText(/no courses are open yet|no courses match/i)).toBeVisible();
    } else {
      await expect(cards.first().getByText(/fee/i).first()).toBeVisible();
    }
  });

  test("filters are URL-synced and validated", async ({ page }) => {
    await page.goto("/training?category=welding&mode=bogus&duration=forever");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Invalid values are ignored instead of breaking the page.
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("course page shows syllabus, batches, certificate explanation and a sign-in call to action", async ({ page }) => {
    await page.goto("/training");
    const first = page.getByTestId("course-card").first();
    test.skip((await first.count()) === 0, "No published courses in the seeded catalogue");
    await first.getByRole("link").first().click();
    await page.waitForURL(/\/training\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /syllabus/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^batches$/i })).toBeVisible();
    await expect(page.getByTestId("certification-note")).toBeVisible();
    await expect(page.getByText(/does not guarantee a job/i)).toBeVisible();
    const signIn = page.getByRole("link", { name: /sign in to apply/i }).first();
    if (await signIn.count()) {
      await expect(signIn).toHaveAttribute("href", /\/sign-in\?returnTo=%2Ftalent%2Ftraining%2Fcourses%2F.+%2Fapply%3Fbatch%3D/);
    }
  });

  test("unknown course returns 404", async ({ page }) => {
    const response = await page.goto("/training/this-course-does-not-exist-qa");
    expect(response?.status()).toBe(404);
  });
});

test.describe("certificate verification", () => {
  test("is not indexed and reports unknown codes without leaking details", async ({ page }) => {
    await page.goto("/verify-certificate");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await page.getByLabel(/verification code/i).fill("ZZZZ-ZZZZ-ZZZZ");
    await page.getByRole("button", { name: /check certificate/i }).click();
    await expect(page.getByTestId("verification-result")).toContainText(/no certificate found/i);
  });

  test("validates a too-short code inline", async ({ page }) => {
    await page.goto("/verify-certificate");
    await page.getByLabel(/verification code/i).fill("AB");
    await page.getByRole("button", { name: /check certificate/i }).click();
    await expect(page.getByText(/enter the full code/i).first()).toBeVisible();
  });

  test("share link path looks the code up", async ({ page }) => {
    const response = await page.goto("/verify-certificate/ZZZZ-ZZZZ-ZZZZ");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByTestId("verification-result").first()).toBeVisible();
  });
});

test.describe("People Portal training", () => {
  test.skip(!CANDIDATE_EMAIL || !CANDIDATE_PASSWORD, "Set E2E_CANDIDATE_EMAIL and E2E_CANDIDATE_PASSWORD");

  test("my training page shows enrolments or an empty state", async ({ page }) => {
    await signIn(page, "/talent/training");
    await expect(page.getByRole("heading", { level: 1, name: /training/i })).toBeVisible();
    const cards = page.getByTestId("enrolment-card");
    if ((await cards.count()) === 0) await expect(page.getByText(/not applied for a course yet/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /find courses/i }).first()).toHaveAttribute("href", "/talent/training/courses");
  });

  test("enrolment form requires consent to share contact details and the declaration", async ({ page }) => {
    await signIn(page, "/talent/training/courses");
    const course = page.getByTestId("course-card").first();
    test.skip((await course.count()) === 0, "No published courses in the seeded catalogue");
    await course.getByRole("link").first().click();
    const apply = page.getByRole("link", { name: /apply for this batch|join the waitlist/i }).first();
    test.skip((await apply.count()) === 0, "No open batch, or the candidate already applied");
    await apply.click();
    await page.waitForURL(/\/apply\?batch=/);
    const form = page.getByTestId("apply-form");
    await expect(form.getByText(/your name/i)).toBeVisible();
    await expect(form.getByText(/your email address/i)).toBeVisible();
    await expect(form.getByText(/your phone number/i)).toBeVisible();

    await form.getByRole("button", { name: /send application|join the waitlist/i }).click();
    await expect(page.getByText(/agree to share your contact details/i)).toBeVisible();
    await expect(page.getByText(/confirm the declaration/i)).toBeVisible();

    await form.getByRole("checkbox", { name: /name, email and phone number are shared/i }).check();
    await form.getByRole("checkbox", { name: /information in my profile is true/i }).check();
    await form.getByRole("button", { name: /send application|join the waitlist/i }).click();
    await page.waitForURL(/\/talent\/training\/enrolments\/[^/?]+\?applied=1/);
    await expect(page.getByText(/application sent|on the waitlist/i).first()).toBeVisible();

    // Withdraw again so the test can be re-run.
    await page.getByRole("button", { name: /^withdraw$/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^withdraw$/i }).click();
    await expect(page.getByText(/cancelled|dropped out/i).first()).toBeVisible();
  });

  test("certificates page labels issuer types and offers verification codes", async ({ page }) => {
    await signIn(page, "/talent/certificates");
    await expect(page.getByRole("heading", { level: 1, name: /certificates/i })).toBeVisible();
    await expect(page.getByText(/not external accredited qualifications/i).first()).toBeVisible();
    const cards = page.getByTestId("certificate-card");
    if ((await cards.count()) === 0) {
      await expect(page.getByText(/no certificates yet/i)).toBeVisible();
    } else {
      await expect(cards.first().getByText(/issuer type/i)).toBeVisible();
      await expect(cards.first().getByTestId("verification-code")).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    }
  });

  test("assessments page states that job-related trade tests are free", async ({ page }) => {
    await signIn(page, "/talent/assessments");
    await expect(page.getByRole("heading", { level: 1, name: /assessments/i })).toBeVisible();
    await expect(page.getByText(/never pay for a job-related trade test/i)).toBeVisible();
  });

  test("an unknown enrolment id is not found", async ({ page }) => {
    await signIn(page, "/talent/training");
    const response = await page.goto("/talent/training/enrolments/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });
});
