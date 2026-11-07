import { expect, test, type Page } from "@playwright/test";

/**
 * Candidate onboarding (age gate), profile, privacy, career services and notifications
 * (ui:talent-profile).
 *
 * Needs a seeded candidate who has passed the age step: E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD.
 * The age-gate tests need a fresh candidate without a date of birth: E2E_NEW_CANDIDATE_EMAIL /
 * E2E_NEW_CANDIDATE_PASSWORD (each run consumes it: the date of birth is locked once recorded).
 * Tests are skipped when the variables are missing.
 */

const CANDIDATE = { email: process.env.E2E_CANDIDATE_EMAIL, password: process.env.E2E_CANDIDATE_PASSWORD };
const NEW_CANDIDATE = { email: process.env.E2E_NEW_CANDIDATE_EMAIL, password: process.env.E2E_NEW_CANDIDATE_PASSWORD };

async function signIn(page: Page, account: { email?: string; password?: string }, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(account.email!);
  await page.getByLabel(/password/i).first().fill(account.password!);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith("/talent"));
}

test.describe("signed out", () => {
  test("People Portal pages require sign-in", async ({ request }) => {
    for (const path of ["/talent/profile", "/talent/privacy", "/talent/career", "/talent/notifications", "/talent/onboarding"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect([303, 307, 308]).toContain(response.status());
      expect(response.headers()["location"] ?? "").toContain("/sign-in");
    }
  });

  test("the data download requires sign-in", async ({ request }) => {
    const response = await request.get("/talent/privacy/download", { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });
});

test.describe("age gate", () => {
  test.skip(!NEW_CANDIDATE.email || !NEW_CANDIDATE.password, "Set E2E_NEW_CANDIDATE_EMAIL / E2E_NEW_CANDIDATE_PASSWORD");

  test("a new candidate is sent to the age step and an under-18 date asks for guardian consent", async ({ page }) => {
    await signIn(page, NEW_CANDIDATE, "/talent/profile");
    await expect(page).toHaveURL(/\/talent\/onboarding/);
    const form = page.getByTestId("onboarding-dob-form");
    await expect(form).toBeVisible();

    // Other People Portal pages stay closed until the age step is done.
    await page.goto("/talent/privacy");
    await expect(page).toHaveURL(/\/talent\/onboarding/);

    const sixteen = new Date();
    sixteen.setUTCFullYear(sixteen.getUTCFullYear() - 16);
    await form.getByLabel(/date of birth/i).fill(sixteen.toISOString().slice(0, 10));
    await form.getByRole("button").click();

    const guardian = page.getByTestId("onboarding-guardian-form");
    await expect(guardian).toBeVisible();
    // Submitting without consent or a contact shows inline errors.
    await guardian.getByLabel(/full name/i).fill("Test Guardian");
    await guardian.getByRole("button", { name: /record consent/i }).click();
    await expect(guardian.getByRole("alert").first()).toBeVisible();
  });
});

test.describe("candidate", () => {
  test.skip(!CANDIDATE.email || !CANDIDATE.password, "Set E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD");

  test("onboarding steps can be skipped and resumed", async ({ page }) => {
    await signIn(page, CANDIDATE, "/talent/onboarding?step=goals");
    await expect(page.getByTestId("onboarding-goals")).toBeVisible();
    await page.getByRole("button", { name: /skip for now/i }).click();
    await expect(page).toHaveURL(/step=basics/);
    await expect(page.getByTestId("onboarding-basics")).toBeVisible();
  });

  test("profile shows completeness, sections and the employer preview", async ({ page }) => {
    await signIn(page, CANDIDATE, "/talent/profile");
    await expect(page.getByRole("heading", { level: 1, name: /my profile/i })).toBeVisible();
    for (const id of ["personal", "professional", "preferences", "experience", "education", "skills", "languages", "credentials", "portfolio", "documents", "privacy"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await expect(page.getByRole("progressbar").first()).toBeVisible();

    // Edit the professional summary in its dialog.
    await page.getByRole("button", { name: /edit: professional summary/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^headline/i).fill("Certified TIG welder");
    await dialog.getByRole("button", { name: /^save$/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#professional")).toContainText("Certified TIG welder");

    await page.getByRole("link", { name: /how employers see you/i }).first().click();
    await expect(page).toHaveURL(/\/talent\/profile\/preview/);
    await page.getByRole("link", { name: /employer you applied to/i }).click();
    await expect(page).toHaveURL(/as=applied/);
  });

  test("privacy page: visibility, consents, data rights and access log", async ({ page }) => {
    await signIn(page, CANDIDATE, "/talent/privacy");
    await expect(page.getByTestId("privacy-visibility")).toBeVisible();
    await expect(page.getByTestId("privacy-disclosure")).toBeVisible();
    await expect(page.getByTestId("privacy-consents")).toBeVisible();
    await expect(page.locator("#requests")).toBeVisible();
    await expect(page.locator("#access-log")).toBeVisible();
    await expect(page.getByRole("link", { name: /raise a grievance/i })).toHaveAttribute("href", "/grievance");

    // Change visibility and save.
    await page.getByTestId("privacy-visibility").getByLabel(/venkat sai team only/i).check();
    await page.getByTestId("privacy-visibility").getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/saved/i).first()).toBeVisible();

    // The immediate data download returns JSON.
    const download = await page.request.get("/talent/privacy/download");
    expect(download.ok()).toBeTruthy();
    expect(download.headers()["content-type"]).toContain("application/json");
  });

  test("career services: resume builder, requests and skill gap", async ({ page }) => {
    await signIn(page, CANDIDATE, "/talent/career");
    await expect(page.locator("#skill-gap")).toBeVisible();
    await expect(page.locator("#interview-preparation")).toBeVisible();
    await expect(page.getByTestId("career-request-resume_review")).toBeVisible();

    await page.goto("/talent/career/resume?template=compact");
    await expect(page.locator("#resume-sheet")).toBeVisible();
    await expect(page.getByRole("button", { name: /print or save as pdf/i })).toBeVisible();
  });

  test("notifications inbox with All / Unread views", async ({ page }) => {
    await signIn(page, CANDIDATE, "/talent/notifications");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /^unread/i }).first().click();
    await expect(page).toHaveURL(/filter=unread/);
    await expect(page.getByRole("link", { name: /notification settings/i })).toHaveAttribute("href", "/account/notifications/preferences");
  });
});
