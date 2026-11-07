import { expect, test, type Page } from "@playwright/test";

/**
 * Recruitment Partner Portal (ui:recruiter): onboarding, dashboard, agency profile and verification,
 * requirements and the submit-candidate flow, submissions, my candidates, interviews, documents,
 * performance, settlements, announcements and team.
 *
 * Needs seeded accounts (flows are skipped when the variables are missing):
 * - E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD: owner of a recruitment partner organisation.
 * - E2E_PARTNER_VERIFIED=1 when that organisation is verified and has at least one active assignment.
 * - E2E_NEW_PARTNER_EMAIL / E2E_NEW_PARTNER_PASSWORD: a verified user without a partner organisation (onboarding).
 * - E2E_OTHER_PARTNER_SUBMISSION_ID (optional): a submission of another partner; must not be visible.
 */

const EMAIL = process.env.E2E_PARTNER_EMAIL;
const PASSWORD = process.env.E2E_PARTNER_PASSWORD;
const VERIFIED = process.env.E2E_PARTNER_VERIFIED === "1";
const NEW_EMAIL = process.env.E2E_NEW_PARTNER_EMAIL;
const NEW_PASSWORD = process.env.E2E_NEW_PARTNER_PASSWORD;
const OTHER_SUBMISSION = process.env.E2E_OTHER_PARTNER_SUBMISSION_ID;

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("partner onboarding", () => {
  test.skip(!NEW_EMAIL || !NEW_PASSWORD, "E2E_NEW_PARTNER_EMAIL / E2E_NEW_PARTNER_PASSWORD not set");

  test("registers an agency and lands on the agency profile checklist", async ({ page }) => {
    await signIn(page, NEW_EMAIL!, NEW_PASSWORD!, "/recruiter/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /become a venkat sai recruitment partner/i })).toBeVisible();

    await page.getByRole("button", { name: /create partner workspace/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    await page.getByLabel("Agency name").fill(`E2E Manpower ${unique()}`);
    await page.getByLabel(/country of registration/i).click();
    await page.getByRole("option", { name: /india/i }).first().click();
    await page.getByLabel("City").fill("Visakhapatnam");
    await page.getByLabel(/official email/i).fill(`partner-${unique()}@example.com`);
    await page.getByLabel("Business type").click();
    await page.getByRole("option", { name: /recruitment agency/i }).click();
    await page.getByLabel("Your designation").fill("Proprietor");
    await page.getByLabel(/authorised to register this agency/i).check();
    await page.getByLabel(/never charge a candidate/i).check();
    await page.getByRole("button", { name: /create partner workspace/i }).click();

    await page.waitForURL(/\/recruiter\/profile\?welcome=1/);
    await expect(page.getByText(/your partner workspace is ready/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Licences" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Partner agreement" })).toBeVisible();
  });
});

test.describe("partner workspace", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, EMAIL!, PASSWORD!, "/recruiter");
  });

  test("dashboard shows live sections and no placeholder numbers", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    await expect(page.getByText(/open requirements/i).first()).toBeVisible();
    await expect(page.getByText(/lorem ipsum/i)).toHaveCount(0);
  });

  const pages: [string, RegExp][] = [
    ["/recruiter/requirements", /assigned requirements/i],
    ["/recruiter/submissions", /^submissions$/i],
    ["/recruiter/candidates", /my candidates/i],
    ["/recruiter/interviews", /interviews/i],
    ["/recruiter/documents", /documents/i],
    ["/recruiter/performance", /performance/i],
    ["/recruiter/settlements", /settlements/i],
    ["/recruiter/profile", /agency profile/i],
    ["/recruiter/profile/verification", /agency verification/i],
    ["/recruiter/announcements", /announcements/i],
    ["/recruiter/team", /team/i],
  ];
  for (const [path, heading] of pages) {
    test(`renders ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("pages fit a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/recruiter", "/recruiter/requirements", "/recruiter/submissions", "/recruiter/profile"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
  });

  test("unknown or foreign records return not found", async ({ page }) => {
    for (const path of ["/recruiter/requirements/00000000-0000-4000-8000-000000000000", "/recruiter/submissions/not-a-uuid", "/recruiter/settlements/00000000-0000-4000-8000-000000000000"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
    if (OTHER_SUBMISSION) {
      const response = await page.goto(`/recruiter/submissions/${OTHER_SUBMISSION}`);
      expect(response?.status()).toBe(404);
    }
  });

  test("licence form validates required fields", async ({ page }) => {
    await page.goto("/recruiter/profile#licences");
    await page.getByRole("button", { name: /add licence/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^add licence$/i }).click();
    await expect(dialog.getByText(/licence number/i).first()).toBeVisible();
  });

  test.describe("verified partner", () => {
    test.skip(!VERIFIED, "E2E_PARTNER_VERIFIED not set");

    test("submits a new candidate with consent and sees the submission", async ({ page }) => {
      await page.goto("/recruiter/requirements?status=active");
      await page.getByRole("link", { name: /^open /i }).first().click();
      await page.getByRole("link", { name: /submit a candidate/i }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: /submit a candidate/i })).toBeVisible();

      const form = page.getByTestId("submit-candidate-form");
      await form.getByLabel(/a new person/i).check();
      // Consent is mandatory.
      await form.getByLabel("Full name").fill(`E2E Candidate ${unique()}`);
      await form.getByLabel("Email").fill(`candidate-${unique()}@example.com`);
      await form.getByRole("button", { name: /submit candidate/i }).click();
      await expect(form.getByText(/not submitted/i)).toBeVisible();

      await form.getByLabel(/how the candidate agreed/i).click();
      await page.getByRole("option", { name: /written/i }).click();
      await form.getByLabel(/i confirm/i).check();
      await form.getByRole("button", { name: /submit candidate/i }).click();

      await page.waitForURL(/\/recruiter\/submissions\/[0-9a-f-]+\?submitted=1/);
      await expect(page.getByText(/candidate submitted|held as a possible duplicate/i)).toBeVisible();
    });
  });
});
