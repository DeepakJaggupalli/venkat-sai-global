import { expect, test, type Page } from "@playwright/test";

/**
 * Institution & Training Portal (ui:institution): onboarding, dashboard, profile and verification, courses,
 * batches (attendance and assessments), students (?batch=), certificates, placements, reports, team,
 * announcements.
 *
 * Needs seeded accounts (flows are skipped when the variables are missing):
 * - E2E_INSTITUTION_EMAIL / E2E_INSTITUTION_PASSWORD: owner of an institution organisation.
 * - E2E_NEW_USER_EMAIL / E2E_NEW_USER_PASSWORD: a verified user without an institution (onboarding).
 * Optional:
 * - E2E_INSTITUTION_BATCH_ID: a batch of that institution with at least one confirmed learner.
 * - E2E_OTHER_BATCH_ID: a batch of a different organisation (must 404).
 */

const EMAIL = process.env.E2E_INSTITUTION_EMAIL;
const PASSWORD = process.env.E2E_INSTITUTION_PASSWORD;
const NEW_EMAIL = process.env.E2E_NEW_USER_EMAIL;
const NEW_PASSWORD = process.env.E2E_NEW_USER_PASSWORD;
const BATCH_ID = process.env.E2E_INSTITUTION_BATCH_ID;
const OTHER_BATCH_ID = process.env.E2E_OTHER_BATCH_ID;

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

test.describe("institution onboarding", () => {
  test.skip(!NEW_EMAIL || !NEW_PASSWORD, "E2E_NEW_USER_EMAIL / E2E_NEW_USER_PASSWORD not set");

  test("creates an institution workspace and lands on the setup checklist", async ({ page }) => {
    await signIn(page, NEW_EMAIL!, NEW_PASSWORD!, "/institution/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /set up your institution workspace/i })).toBeVisible();

    await page.getByRole("button", { name: /create institution workspace/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    await page.getByLabel("Kind of institution").click();
    await page.getByRole("option", { name: /industrial training institute/i }).click();
    await page.getByLabel("Institution name").fill(`E2E Technical Institute ${unique()}`);
    await page.getByLabel("Country").click();
    await page.getByRole("option", { name: /india/i }).first().click();
    await page.getByLabel("City").fill("Visakhapatnam");
    await page.getByLabel("Address", { exact: true }).fill("Auto Nagar");
    await page.getByLabel("Official email").fill(`office-${unique()}@example.com`);
    await page.getByLabel("Your designation").fill("Principal");
    await page.getByLabel(/i confirm i am authorised/i).check();
    await page.getByRole("button", { name: /create institution workspace/i }).click();

    await page.waitForURL(/\/institution\?welcome=1/);
    await expect(page.getByText(/your institution workspace is ready/i)).toBeVisible();
    await expect(page.getByText(/set up your institution/i)).toBeVisible();
  });
});

test.describe("institution workspace", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_INSTITUTION_EMAIL / E2E_INSTITUTION_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, EMAIL!, PASSWORD!, "/institution");
  });

  test("dashboard shows live training and outcome figures", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Outcomes" })).toBeVisible();
    await expect(page.getByText("Attendance rate")).toBeVisible();
    await expect(page.getByText("Pass rate")).toBeVisible();
  });

  test("profile shows verification requirements and read-only issuer authorisation", async ({ page }) => {
    await page.goto("/institution/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Institution profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verification" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Certificate-issuer authorisation" })).toBeVisible();
    await expect(page.getByText(/you cannot change it here/i)).toBeVisible();
  });

  test("creates a draft course and adds a syllabus module", async ({ page }) => {
    await page.goto("/institution/courses/new");
    const title = `E2E Welding foundations ${unique()}`;
    await page.getByLabel("Course title").fill(title);
    await page.getByLabel("Category").click();
    await page.getByRole("option", { name: "Welding" }).click();
    await page.getByLabel("Duration (hours)").fill("120");
    await page.getByRole("button", { name: "Save draft" }).click();

    await page.waitForURL(/\/institution\/courses\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Draft").first()).toBeVisible();

    await page.getByRole("button", { name: "Add module" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Module title").fill("Safety and equipment");
    await dialog.getByRole("button", { name: "Add module" }).click();
    await expect(page.getByTestId("course-module")).toHaveCount(1);
  });

  test("certification rules are explained when choosing an accredited certificate", async ({ page }) => {
    await page.goto("/institution/courses/new");
    await page.getByLabel("What learners can earn").click();
    await page.getByRole("option", { name: /accredited certificate/i }).click();
    await expect(page.getByText(/only institutions that venkat sai has authorised as certificate issuers/i)).toBeVisible();
    await expect(page.getByLabel("External awarding body")).toBeVisible();
  });

  test("lists pages render with honest empty states or data", async ({ page }) => {
    for (const [path, heading] of [
      ["/institution/courses", "Courses"],
      ["/institution/batches", "Batches"],
      ["/institution/students", "Students"],
      ["/institution/assessments", "Assessments"],
      ["/institution/certificates", "Certificates"],
      ["/institution/placements", "Placements"],
      ["/institution/placements?tab=internships", "Placements"],
      ["/institution/placements?tab=outcomes", "Placements"],
      ["/institution/reports", "Reports"],
      ["/institution/team", "Team"],
      ["/institution/announcements", "Announcements"],
    ] as const) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("CSV export returns a file for report viewers", async ({ page }) => {
    const response = await page.request.get("/institution/reports/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toContain("Completion rate %");
  });

  test("students page honours ?batch= and attendance can be taken on a phone", async ({ page }) => {
    test.skip(!BATCH_ID, "E2E_INSTITUTION_BATCH_ID not set");
    await page.goto(`/institution/students?batch=${BATCH_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: /^Students:/ })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/institution/batches/${BATCH_ID}?tab=attendance`);
    const hasRows = (await page.getByTestId("attendance-row").count()) > 0;
    test.skip(!hasRows, "No confirmed learners in the seeded batch");
    if ((await page.getByLabel("Session").count()) === 0 || (await page.getByText(/no sessions yet/i).count()) > 0) {
      await page.getByRole("button", { name: "New session" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Add session" }).click();
    }
    await page.getByRole("button", { name: /mark unmarked as present/i }).click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText(/attendance saved/i).first()).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(360);
  });

  test("another organisation's batch is not found", async ({ page }) => {
    test.skip(!OTHER_BATCH_ID, "E2E_OTHER_BATCH_ID not set");
    const response = await page.goto(`/institution/batches/${OTHER_BATCH_ID}`);
    expect(response?.status()).toBe(404);
    const students = await page.goto(`/institution/students?batch=${OTHER_BATCH_ID}`);
    expect(students?.status()).toBe(404);
  });
});
