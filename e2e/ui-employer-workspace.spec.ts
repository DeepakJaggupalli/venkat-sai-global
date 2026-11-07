import { expect, test, type Page } from "@playwright/test";

import { expectHealthyPage, expectNotFound, signInAs } from "./employer-helpers";

/**
 * Employer workspace (ui:employer-workspace): onboarding, dashboard, company profile and verification,
 * team, jobs and workforce requirements, announcements, permission boundaries and page health.
 *
 * Needs seeded accounts (flows are skipped when the variables are missing; `npm run db:seed:e2e`):
 * - E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD: owner of the verified "E2E Employer Co".
 * - E2E_EMPLOYER_MEMBER_EMAIL / _PASSWORD: HR Manager there (no team or billing permission).
 * - E2E_NEW_USER_EMAIL / E2E_NEW_USER_PASSWORD: a verified user without an employer organisation (onboarding).
 * - E2E_OTHER_EMPLOYER_EMAIL / _PASSWORD, E2E_OTHER_EMPLOYER_JOB_ID, E2E_OTHER_EMPLOYER_REQUIREMENT_ID: owner and
 *   draft records of the unverified "E2E Other Employer Co" (isolation and unverified states).
 * Set E2E_EMPLOYER_VERIFIED=1 when the seeded employer organisation is verified.
 */

const EMPLOYER_EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const EMPLOYER_PASSWORD = process.env.E2E_EMPLOYER_PASSWORD;
const MEMBER_EMAIL = process.env.E2E_EMPLOYER_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_EMPLOYER_MEMBER_PASSWORD;
const NEW_EMAIL = process.env.E2E_NEW_USER_EMAIL;
const NEW_PASSWORD = process.env.E2E_NEW_USER_PASSWORD;
const OTHER_EMAIL = process.env.E2E_OTHER_EMPLOYER_EMAIL;
const OTHER_PASSWORD = process.env.E2E_OTHER_EMPLOYER_PASSWORD;
const OTHER_JOB_ID = process.env.E2E_OTHER_EMPLOYER_JOB_ID;
const OTHER_REQUIREMENT_ID = process.env.E2E_OTHER_EMPLOYER_REQUIREMENT_ID;
const JOB_ID = process.env.E2E_EMPLOYER_JOB_ID;
const VERIFIED = process.env.E2E_EMPLOYER_VERIFIED === "1";

/** First compile of a route in dev mode can take several seconds. */
const NAV = { timeout: 45_000 };

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await signInAs(page, { email, password }, returnTo);
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function chooseCountry(page: Page, label: string | RegExp, country: string) {
  await page.getByLabel(label).first().click();
  await page.getByRole("option", { name: country, exact: true }).first().click();
}

test.describe("employer onboarding", () => {
  test.skip(!NEW_EMAIL || !NEW_PASSWORD, "E2E_NEW_USER_EMAIL / E2E_NEW_USER_PASSWORD not set");

  test("creates an employer workspace and lands on the setup checklist", async ({ page }) => {
    await signIn(page, NEW_EMAIL!, NEW_PASSWORD!, "/employer/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /set up your employer workspace/i })).toBeVisible();

    // Required fields are explained inline when missing, and what was typed is kept.
    await page.getByLabel("City").fill("Visakhapatnam");
    await page.getByRole("button", { name: /create employer workspace/i }).click();
    await expect(page.getByLabel("Company name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert").filter({ hasText: /please fix/i })).toBeVisible();
    await expect(page.getByLabel("City")).toHaveValue("Visakhapatnam");

    await page.getByLabel("Company name").fill(`E2E Fabrication ${unique()}`);
    await chooseCountry(page, /country of registration/i, "India");
    await page.getByLabel("Registered address").fill("Auto Nagar");
    await page.getByLabel("Official email").fill(`hr-${unique()}@example.com`);
    await page.getByLabel("Your designation").fill("HR Manager");
    await page.getByLabel(/i confirm i am authorised/i).check();
    await page.getByRole("button", { name: /create employer workspace/i }).click();

    await page.waitForURL(/\/employer\?welcome=1/, NAV);
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
    await expect(page.getByText(/company details saved/i).first()).toBeVisible();

    await page.goto("/employer/company/verification");
    await expect(page.getByRole("heading", { level: 1, name: /company verification/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /before you submit/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /history/i })).toBeVisible();
  });

  test("team page validates invitations, keeps input and lists roles", async ({ page }) => {
    await page.goto("/employer/team");
    await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await expect(page.getByTestId("team-member").first()).toBeVisible();
    const email = page.getByLabel("Email address");
    await email.fill("not-an-email");
    await page.getByRole("button", { name: /send invitation/i }).click();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveValue("not-an-email");

    const invitee = `invitee-${unique()}@example.com`;
    await email.fill(invitee);
    await page.getByRole("button", { name: /send invitation/i }).click();
    await expect(page.getByText(`Invitation sent to ${invitee}.`)).toBeVisible();
    await expect(page.getByTestId("team-invitation").filter({ hasText: invitee })).toBeVisible();
    // The form is cleared for the next invitation.
    await expect(page.getByLabel("Email address")).toHaveValue("");
  });

  test("creates a job draft with screening questions and shows its timeline", async ({ page }) => {
    const title = `E2E Pipe welder ${unique()}`;
    await page.goto("/employer/jobs/new");
    await expect(page.getByRole("heading", { level: 1, name: /post a job/i })).toBeVisible();
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Summary").fill("TIG and ARC welding on process piping.");
    await chooseCountry(page, "Country", "India");

    await page.getByRole("button", { name: /add question/i }).click();
    await page.getByTestId("screening-question").getByLabel("Question", { exact: true }).fill("Do you hold a valid passport?");

    if (!VERIFIED) {
      await expect(page.getByRole("button", { name: /save and submit for review/i })).toBeDisabled();
      await expect(page.getByText(/must be verified by venkat sai/i).first()).toBeVisible();
    }
    await page.getByRole("button", { name: /save draft/i }).click();
    await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}$/, NAV);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: /status timeline/i })).toContainText(/draft created/i);
    await expect(page.getByRole("region", { name: /screening questions/i })).toContainText(/valid passport/i);

    await page.goto("/employer/jobs?status=draft");
    await expect(page.getByRole("link", { name: new RegExp(`open ${title}`, "i") })).toBeVisible();
  });

  test("job form shows field errors and keeps what was typed", async ({ page }) => {
    await page.goto("/employer/jobs/new");
    await page.getByLabel("Summary").fill("Summary kept after a failed save.");
    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page.getByLabel("Job title")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Summary")).toHaveValue("Summary kept after a failed save.");
  });

  test("submits a new job for Venkat Sai's review", async ({ page }) => {
    test.skip(!VERIFIED, "E2E_EMPLOYER_VERIFIED is not 1");
    const title = `E2E Submitted welder ${unique()}`;
    await page.goto("/employer/jobs/new");
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Summary").fill("Structural welding at the Visakhapatnam yard.");
    await chooseCountry(page, "Country", "India");
    await page.getByRole("button", { name: /save and submit for review/i }).click();
    await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}$/, NAV);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: /status timeline/i })).toContainText(/submitted for review/i);
  });

  test("duplicates a job into a new draft", async ({ page }) => {
    await page.goto("/employer/jobs?status=draft");
    const first = page.getByRole("link", { name: /^open /i }).first();
    test.skip((await first.count()) === 0, "No draft jobs to duplicate");
    await first.click();
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /duplicate/i }).click();
    await page.getByRole("button", { name: /create copy/i }).click();
    await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}\/edit$/, NAV);
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

    await page.waitForURL(/\/employer\/requirements\/[0-9a-f-]{36}$/, NAV);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Pipe fitter")).toBeVisible();
    await expect(page.getByText("Rigger")).toBeVisible();
    await expect(page.getByRole("region", { name: /status timeline/i })).toContainText(/draft created/i);
    await expect(page.getByRole("link", { name: /edit draft/i })).toBeVisible();
  });

  test("submits a workforce requirement to Venkat Sai", async ({ page }) => {
    const title = `E2E Fabrication crew ${unique()}`;
    await page.goto("/employer/requirements/new");
    await page.getByLabel("Requirement title").fill(title);
    const line = page.getByTestId("requirement-line").first();
    await line.getByLabel("Role / trade").fill("Welder");
    await line.getByLabel("Positions").fill("6");
    await page.getByRole("button", { name: "Submit to Venkat Sai" }).click();
    await page.waitForURL(/\/employer\/requirements\/[0-9a-f-]{36}$/, NAV);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: /status timeline/i })).toContainText(/submitted to venkat sai/i);
    await expect(page.getByRole("link", { name: /edit draft/i })).toHaveCount(0);
  });

  test("announcements are limited to verified companies", async ({ page }) => {
    await page.goto("/employer/announcements");
    await expect(page.getByRole("heading", { level: 1, name: "Announcements" })).toBeVisible();
    if (VERIFIED) await expect(page.getByRole("button", { name: /send to venkat sai for review/i })).toBeVisible();
    else await expect(page.getByText(/available to verified companies/i)).toBeVisible();
  });

  test("unknown and other organisations' records are not found", async ({ page }) => {
    await expectNotFound(page, "/employer/jobs/00000000-0000-4000-8000-000000000000");
    await expectNotFound(page, "/employer/requirements/00000000-0000-4000-8000-000000000000");
    // The not-found page keeps the portal navigation.
    await expect(page.getByRole("link", { name: "Go to your dashboard" })).toBeVisible();
    if (OTHER_JOB_ID) {
      await expectNotFound(page, `/employer/jobs/${OTHER_JOB_ID}`);
      await expectNotFound(page, `/employer/jobs/${OTHER_JOB_ID}/edit`);
    }
    if (OTHER_REQUIREMENT_ID) {
      await expectNotFound(page, `/employer/requirements/${OTHER_REQUIREMENT_ID}`);
      await expectNotFound(page, `/employer/requirements/${OTHER_REQUIREMENT_ID}/edit`);
    }
  });

  test("keyboard focus is visible on the jobs page", async ({ page }) => {
    await page.goto("/employer/jobs");
    await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
    // Skip link first, then into the shell: every focused control must show a focus indicator.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      const indicator = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "none";
        const style = getComputedStyle(el);
        const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        return outline || style.boxShadow !== "none" ? "visible" : `missing on ${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
      });
      expect(indicator).toBe("visible");
    }
  });

  test("workspace pages render cleanly: one h1, no sideways scroll, no serious accessibility violations", async ({ page }) => {
    test.setTimeout(240_000);
    const pages: [string, string | RegExp][] = [
      ["/employer", /welcome/i],
      ["/employer/company", "Company profile"],
      ["/employer/company/verification", /company verification/i],
      ["/employer/team", "Team"],
      ["/employer/jobs", "Jobs"],
      ["/employer/jobs/new", /post a job/i],
      ["/employer/requirements", /workforce requirements/i],
      ["/employer/requirements/new", /requirement/i],
      ["/employer/announcements", "Announcements"],
      ["/employer/billing", /billing/i],
      ["/employer/billing/invoices", /invoices/i],
      ["/employer/billing/payments", /payments/i],
      ["/employer/billing/details", /billing details/i],
      ["/employer/messages", /messages/i],
      ["/employer/messages/new", /conversation|message/i],
      ["/employer/support", /support/i],
      ["/employer/support/new", /support|request|ticket/i],
    ];
    if (JOB_ID) {
      pages.push([`/employer/jobs/${JOB_ID}`, /E2E Structural welder/]);
      pages.push([`/employer/jobs/${JOB_ID}/edit`, /.+/]);
    }
    // Outside the workspace shell; an existing member sees the "you already belong" note.
    pages.push(["/employer/onboarding", /set up your employer workspace/i]);
    for (const [path, h1] of pages) {
      await test.step(path, async () => {
        await expectHealthyPage(page, path, h1);
      });
    }
  });
});

test.describe("employer navigation", () => {
  test.skip(!EMPLOYER_EMAIL || !EMPLOYER_PASSWORD, "E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD not set");

  test("every Employer Portal link on the dashboard resolves", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!, "/employer");
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    const hrefs = await page.locator('a[href^="/employer"]').evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href")!.split("#")[0]!))]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      await test.step(href, async () => {
        const response = await page.goto(href);
        expect(response?.status(), href).toBeLessThan(400);
        // The owner may open every page: never the not-found, access or error screens.
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/couldn.t find|don.t have access|something went wrong/i);
      });
    }
  });
});

test.describe("employer member without team or billing permission", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "E2E_EMPLOYER_MEMBER_EMAIL / E2E_EMPLOYER_MEMBER_PASSWORD not set");

  test("gets the friendly access page inside the portal", async ({ page }) => {
    await signIn(page, MEMBER_EMAIL!, MEMBER_PASSWORD!, "/employer");
    for (const path of ["/employer/team", "/employer/billing", "/employer/company"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: /don.t have access/i })).toBeVisible();
      await expect(page.getByRole("link", { name: "Go to your dashboard" })).toBeVisible();
    }
    // What the HR Manager role does include still works.
    await page.goto("/employer/jobs");
    await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  });
});

test.describe("unverified employer", () => {
  test.skip(!OTHER_EMAIL || !OTHER_PASSWORD, "E2E_OTHER_EMPLOYER_EMAIL / E2E_OTHER_EMPLOYER_PASSWORD not set");

  test("can draft but not submit jobs, and announcements explain verification", async ({ page }) => {
    await signIn(page, OTHER_EMAIL!, OTHER_PASSWORD!, "/employer/jobs/new");
    await expect(page.getByRole("heading", { level: 1, name: /post a job/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /save and submit for review/i })).toBeDisabled();
    await expect(page.getByText(/must be verified by venkat sai/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /save draft/i })).toBeEnabled();

    await page.goto("/employer/announcements");
    await expect(page.getByText(/available to verified companies/i)).toBeVisible();

    // Its own draft opens; the verified employer's job does not.
    if (OTHER_JOB_ID) {
      await page.goto(`/employer/jobs/${OTHER_JOB_ID}`);
      await expect(page.getByRole("heading", { level: 1, name: /E2E Other employer draft job/ })).toBeVisible();
    }
    if (JOB_ID) await expectNotFound(page, `/employer/jobs/${JOB_ID}`);
  });
});
