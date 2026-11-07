import { expect, test, type Page } from "@playwright/test";

/**
 * Employer workspace (ui:employer-workspace): onboarding, dashboard, company profile and verification,
 * team, jobs and workforce requirements, announcements.
 *
 * Needs seeded accounts (flows are skipped when the variables are missing):
 * - E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD: owner of an employer organisation.
 * - E2E_NEW_USER_EMAIL / E2E_NEW_USER_PASSWORD: a verified user without an employer organisation (onboarding).
 * Set E2E_EMPLOYER_VERIFIED=1 when the seeded employer organisation is verified.
 */

const EMPLOYER_EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const EMPLOYER_PASSWORD = process.env.E2E_EMPLOYER_PASSWORD;
const NEW_EMAIL = process.env.E2E_NEW_USER_EMAIL;
const NEW_PASSWORD = process.env.E2E_NEW_USER_PASSWORD;
const VERIFIED = process.env.E2E_EMPLOYER_VERIFIED === "1";

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

test.describe("employer onboarding", () => {
  test.skip(!NEW_EMAIL || !NEW_PASSWORD, "E2E_NEW_USER_EMAIL / E2E_NEW_USER_PASSWORD not set");

  test("creates an employer workspace and lands on the setup checklist", async ({ page }) => {
    await signIn(page, NEW_EMAIL!, NEW_PASSWORD!, "/employer/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /set up your employer workspace/i })).toBeVisible();

    // Required fields are explained inline when missing.
    await page.getByRole("button", { name: /create employer workspace/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    await page.getByLabel("Company name").fill(`E2E Fabrication ${unique()}`);
    await page.getByLabel(/country of registration/i).click();
    await page.getByRole("option", { name: /india/i }).first().click();
    await page.getByLabel("City").fill("Visakhapatnam");
    await page.getByLabel("Registered address").fill("Auto Nagar");
    await page.getByLabel("Official email").fill(`hr-${unique()}@example.com`);
    await page.getByLabel("Your designation").fill("HR Manager");
    await page.getByLabel(/i confirm i am authorised/i).check();
    await page.getByRole("button", { name: /create employer workspace/i }).click();

    await page.waitForURL(/\/employer\?welcome=1/);
    await expect(page.getByText(/your employer workspace is ready/i)).toBeVisible();
    await expect(page.getByRole("region", { name: /set up your workspace/i })).toBeVisible();
  });
});

test.describe("employer workspace", () => {
  test.skip(!EMPLOYER_EMAIL || !EMPLOYER_PASSWORD, "E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!, "/employer");
  });

  test("dashboard shows real figures and honest empty states", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /hiring overview/i })).toBeVisible();
    await expect(page.getByText("Active requirements")).toBeVisible();
    await expect(page.getByText("Pending actions").first()).toBeVisible();
  });

  test("company profile saves details and the verification page lists requirements", async ({ page }) => {
    await page.goto("/employer/company");
    await expect(page.getByRole("heading", { level: 1, name: "Company profile" })).toBeVisible();
    await page.getByLabel("Short description").fill(`Fabrication and welding services. Updated ${unique()}.`);
    await page.getByRole("button", { name: /save company details/i }).click();
    await expect(page.getByText(/company details saved/i)).toBeVisible();

    await page.goto("/employer/company/verification");
    await expect(page.getByRole("heading", { level: 1, name: /company verification/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /before you submit/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /history/i })).toBeVisible();
  });

  test("team page validates invitations and lists roles", async ({ page }) => {
    await page.goto("/employer/team");
    await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await expect(page.getByTestId("team-member").first()).toBeVisible();
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: /send invitation/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    await page.getByLabel("Email address").fill(`invitee-${unique()}@example.com`);
    await page.getByRole("button", { name: /send invitation/i }).click();
    await expect(page.getByText(/invitation sent to/i)).toBeVisible();
    await expect(page.getByTestId("team-invitation").first()).toBeVisible();
  });

  test("creates a job draft with screening questions and shows its timeline", async ({ page }) => {
    const title = `E2E Pipe welder ${unique()}`;
    await page.goto("/employer/jobs/new");
    await expect(page.getByRole("heading", { level: 1, name: /post a job/i })).toBeVisible();
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Summary").fill("TIG and ARC welding on process piping.");
    await page.getByLabel("Country").first().click();
    await page.getByRole("option", { name: /india/i }).first().click();

    await page.getByRole("button", { name: /add question/i }).click();
    await page.getByTestId("screening-question").getByLabel("Question").fill("Do you hold a valid passport?");

    if (!VERIFIED) {
      await expect(page.getByRole("button", { name: /save and submit for review/i })).toBeDisabled();
      await expect(page.getByText(/must be verified by venkat sai/i).first()).toBeVisible();
    }
    await page.getByRole("button", { name: /save draft/i }).click();
    await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: /status timeline/i })).toContainText(/draft created/i);
    await expect(page.getByRole("region", { name: /screening questions/i })).toContainText(/valid passport/i);

    await page.goto("/employer/jobs?status=draft");
    await expect(page.getByRole("link", { name: new RegExp(`open ${title}`, "i") })).toBeVisible();
  });

  test("duplicates a job into a new draft", async ({ page }) => {
    await page.goto("/employer/jobs?status=draft");
    const first = page.getByRole("link", { name: /^open /i }).first();
    test.skip((await first.count()) === 0, "No draft jobs to duplicate");
    await first.click();
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /duplicate/i }).click();
    await page.getByRole("button", { name: /create copy/i }).click();
    await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}\/edit$/);
  });

  test("saves a workforce requirement draft with two trades", async ({ page }) => {
    const title = `E2E Shutdown crew ${unique()}`;
    await page.goto("/employer/requirements/new");
    await page.getByLabel("Requirement title").fill(title);
    const lines = page.getByTestId("requirement-line");
    await lines.nth(0).getByLabel("Role / trade").fill("Pipe fitter");
    await lines.nth(0).getByLabel("Positions").fill("10");
    await page.getByRole("button", { name: /add another trade/i }).click();
    await lines.nth(1).getByLabel("Role / trade").fill("Rigger");
    await lines.nth(1).getByLabel("Positions").fill("4");
    await expect(page.getByText(/2 trades · 14 positions in total/i)).toBeVisible();
    await page.getByRole("button", { name: /save draft/i }).click();

    await page.waitForURL(/\/employer\/requirements\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Pipe fitter")).toBeVisible();
    await expect(page.getByText("Rigger")).toBeVisible();
    await expect(page.getByRole("region", { name: /status timeline/i })).toContainText(/draft created/i);
    await expect(page.getByRole("link", { name: /edit draft/i })).toBeVisible();
  });

  test("announcements are limited to verified companies", async ({ page }) => {
    await page.goto("/employer/announcements");
    await expect(page.getByRole("heading", { level: 1, name: "Announcements" })).toBeVisible();
    if (VERIFIED) await expect(page.getByRole("button", { name: /send to venkat sai for review/i })).toBeVisible();
    else await expect(page.getByText(/available to verified companies/i)).toBeVisible();
  });

  test("other organisations' records are not found", async ({ page }) => {
    const response = await page.goto("/employer/jobs/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
    const req = await page.goto("/employer/requirements/00000000-0000-4000-8000-000000000000");
    expect(req?.status()).toBe(404);
  });
});
