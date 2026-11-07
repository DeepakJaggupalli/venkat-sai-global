import { expect, test, type Page } from "@playwright/test";

import { signInWith } from "./support";
import { ACTION_TIMEOUT, confirmDateOfBirth, dismissCookieBanner, expectHealthyPage, expectTranslated, registerCandidate, waitForHydration, watchServerErrors } from "./talent-helpers";

/**
 * Candidate sign-up and onboarding (age gate), profile, privacy, career services and notifications
 * (ui:talent-profile).
 *
 * Needs a seeded candidate who has passed the age step: E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD, and the
 * People Portal apply job from the E2E seed (E2E_TALENT_APPLY_JOB_SLUG). Sign-up journeys register their own
 * address on every run (talent-<label>-<project>-<stamp>@e2e.venkatsai.test) and read the 6-digit code from the
 * dev outbox, so they can run on chromium and mobile back to back. Tests are skipped when variables are missing.
 */

const CANDIDATE = { email: process.env.E2E_CANDIDATE_EMAIL, password: process.env.E2E_CANDIDATE_PASSWORD };
const APPLY_JOB_SLUG = process.env.E2E_TALENT_APPLY_JOB_SLUG;
const APPLY_JOB_ID = process.env.E2E_TALENT_APPLY_JOB_ID;

async function signIn(page: Page, account: { email?: string; password?: string }, returnTo: string) {
  await signInWith(page, { email: account.email!, password: account.password! }, { returnTo, expectPath: /\/talent/ });
  await dismissCookieBanner(page);
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

test.describe("new candidate", () => {
  test.skip(!APPLY_JOB_SLUG || !APPLY_JOB_ID, "Set E2E_TALENT_APPLY_JOB_SLUG / E2E_TALENT_APPLY_JOB_ID (npm run db:seed:e2e)");

  test("signs up with an emailed code, confirms an adult date of birth, sets goals, sees the profile and applies", async ({ page }, testInfo) => {
    const serverErrors = watchServerErrors(page);
    await registerCandidate(page, testInfo, "adult");

    // A new account is held on the age step: every People Portal page sends it back there.
    await expect(page).toHaveURL(/\/talent\/onboarding/);
    for (const path of ["/talent/profile", "/talent/jobs", `/talent/apply/${APPLY_JOB_ID}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/talent\/onboarding/);
    }

    // The date of birth is required and validated inline; the form keeps the page usable.
    await waitForHydration(page.getByTestId("onboarding-dob-form"));
    await page.getByTestId("onboarding-dob-form").getByRole("button").click();
    await expect(page.getByTestId("onboarding-dob-form").getByRole("alert").first()).toBeVisible({ timeout: ACTION_TIMEOUT });
    await confirmDateOfBirth(page, 25);

    const goals = page.getByTestId("onboarding-goals");
    await expect(goals).toBeVisible();
    await goals.getByRole("checkbox", { name: /a job/i }).check();
    await goals.getByRole("checkbox", { name: /work overseas/i }).check();
    await goals.getByRole("button", { name: /save and continue/i }).click();
    await expect(page).toHaveURL(/step=basics/, { timeout: ACTION_TIMEOUT });

    await page.goto("/talent/profile");
    await expect(page.getByRole("heading", { level: 1, name: /my profile/i })).toBeVisible();
    await expect(page.locator("#personal")).toBeVisible();

    // Apply to the People Portal test job.
    await page.goto(`/talent/jobs/${APPLY_JOB_SLUG}`);
    await page.getByTestId("apply-button").click();
    const form = page.getByTestId("apply-form");
    await expect(form).toBeVisible();
    await form.getByRole("checkbox", { name: /agree to share my profile/i }).check();
    await form.getByRole("checkbox", { name: /resume and the documents/i }).check();
    await form.getByRole("checkbox", { name: /information I am sharing is true/i }).check();
    await page.getByTestId("submit-application").click();
    await expect(page.getByTestId("apply-confirmation")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("application-code")).toHaveText(/VSG-APP-/);
    await page.getByTestId("apply-confirmation").getByRole("link", { name: /track your application/i }).click();
    await expect(page.getByTestId("application-stage")).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test("an under-18 date of birth holds the new account at the guardian step and gated actions refuse", async ({ page }, testInfo) => {
    await registerCandidate(page, testInfo, "minor");
    await expect(page).toHaveURL(/\/talent\/onboarding/);
    await confirmDateOfBirth(page, 16);

    const guardian = page.getByTestId("onboarding-guardian-form");
    await expect(guardian).toBeVisible();
    // Other People Portal pages, and the later onboarding steps, stay closed until a guardian consents.
    for (const path of ["/talent/privacy", "/talent/jobs", "/talent/onboarding?step=goals", `/talent/apply/${APPLY_JOB_ID}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/talent\/onboarding/);
      await expect(page.getByTestId("onboarding-guardian-form")).toBeVisible();
    }

    // Submitting without consent or a contact shows inline errors and keeps what was typed.
    await waitForHydration(guardian);
    await guardian.getByLabel(/full name/i).fill("Test Guardian");
    await guardian.getByRole("button", { name: /record consent/i }).click();
    await expect(guardian.getByRole("alert").first()).toBeVisible();
    await expect(guardian.getByLabel(/full name/i)).toHaveValue("Test Guardian");

    // A gated module action outside /talent (saving a job on the public job page) refuses with the guardian reason.
    await page.goto(`/jobs/${APPLY_JOB_SLUG}`);
    await page.getByTestId("save-job").first().click();
    await expect(page.getByText(/parent or guardian needs to give consent/i).first()).toBeVisible();
    await expect(page.getByTestId("save-job").first()).toHaveAttribute("aria-pressed", "false");
  });

  test("privacy page: export, correction and deletion requests appear in the list", async ({ page }, testInfo) => {
    await registerCandidate(page, testInfo, "privacy");
    await confirmDateOfBirth(page, 30);
    await expect(page.getByTestId("onboarding-goals")).toBeVisible();

    await page.goto("/talent/privacy");
    const requests = page.locator("#requests");
    await expect(requests.getByText(/you have not made any data requests/i)).toBeVisible();

    await page.getByTestId("privacy-request-export").getByRole("button", { name: /request a full copy/i }).click();
    await expect(requests.getByText("Copy of my data").filter({ visible: true }).first()).toBeVisible();

    // Too short: a field error, and the text stays in the box.
    const correction = page.getByTestId("privacy-request-correction");
    await waitForHydration(correction);
    await correction.getByLabel(/what should be corrected/i).fill("Too short");
    await correction.getByRole("button", { name: /send correction request/i }).click();
    await expect(correction.getByRole("alert").first()).toBeVisible();
    await expect(correction.getByLabel(/what should be corrected/i)).toHaveValue("Too short");
    await correction.getByLabel(/what should be corrected/i).fill("My date of birth was entered with the wrong year.");
    await correction.getByRole("button", { name: /send correction request/i }).click();
    await expect(requests.getByText("Correction").filter({ visible: true }).first()).toBeVisible();

    // Deletion needs the explicit confirmation first.
    const deletion = page.getByTestId("privacy-request-deletion");
    await deletion.getByRole("button", { name: /send deletion request/i }).click();
    await expect(deletion.getByText(/please confirm that you understand/i).first()).toBeVisible();
    await deletion.getByRole("checkbox", { name: /i understand what will be deleted/i }).check();
    await deletion.getByRole("button", { name: /send deletion request/i }).click();
    await expect(requests.getByText("Deletion").filter({ visible: true }).first()).toBeVisible();

    // All three are listed with a reference and the Received status.
    await page.reload();
    // The list is a table on wide screens and cards on phones; check the version that is shown.
    for (const label of ["Copy of my data", "Correction", "Deletion"]) await expect(requests.getByText(label).filter({ visible: true }).first()).toBeVisible();
    await expect(requests.getByText("Received").filter({ visible: true }).first()).toBeVisible();
  });

  test("the language switcher shows the People Portal in Hindi and Telugu without raw keys", async ({ page }, testInfo) => {
    await registerCandidate(page, testInfo, "lang");
    await confirmDateOfBirth(page, 22);
    await expect(page.getByTestId("onboarding-goals")).toBeVisible();

    await page.getByRole("button", { name: "Change language" }).first().click();
    await page.getByRole("menuitemradio", { name: /हिन्दी|हिंदी/ }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    for (const path of ["/talent", "/talent/profile", "/talent/privacy", "/talent/onboarding?step=goals"]) await expectTranslated(page, path, "hi");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/your goals|welcome/i);

    await page.getByRole("button", { name: "Change language" }).first().click();
    await page.getByRole("menuitemradio", { name: /తెలుగు/ }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "te");
    for (const path of ["/talent", "/talent/profile", "/talent/privacy", "/talent/career", "/talent/notifications"]) await expectTranslated(page, path, "te");
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
    await expect(page.getByText(/saved/i).filter({ visible: true }).first()).toBeVisible();

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

  // One h1, no sideways scroll on the project's viewport (Pixel 7 for mobile), no serious/critical axe issues.
  test("profile, privacy, career, onboarding and notifications pages are healthy", async ({ page }) => {
    test.setTimeout(180_000);
    const serverErrors = watchServerErrors(page);
    await signIn(page, CANDIDATE, "/talent/profile");
    for (const path of ["/talent/profile", "/talent/profile/preview", "/talent/privacy", "/talent/career", "/talent/career/resume", "/talent/notifications", "/talent/onboarding?step=goals"]) {
      await expectHealthyPage(page, path);
    }
    expect(serverErrors()).toEqual([]);
  });

  test("profile pages render in Hindi and Telugu without raw keys", async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    await signIn(page, CANDIDATE, "/talent/profile");
    // The cookie only, so the shared account's saved language (users.locale) is left alone for other specs.
    for (const locale of ["hi", "te"] as const) {
      await context.addCookies([{ name: "vsg_locale", value: locale, url: baseURL! }]);
      for (const path of ["/talent/profile", "/talent/profile/preview", "/talent/privacy", "/talent/career", "/talent/career/resume", "/talent/notifications", "/talent/onboarding?step=goals"]) {
        await expectTranslated(page, path, locale);
      }
    }
  });
});
