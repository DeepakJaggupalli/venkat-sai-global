import { expect, test, type Page } from "@playwright/test";

/**
 * Command Centre recruitment (ui:admin-recruitment): candidates, pipeline, interviews, assessment
 * centre, mobilisation, partners and training oversight.
 *
 * Needs a seeded staff account (flows are skipped when the variables are missing):
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD: Super Admin (or a role with candidates.*, recruitment.*,
 *   partners.*, training.* permissions) with 2FA satisfied for the test environment.
 * Optional seeded ids enable the deeper flows:
 * - E2E_CANDIDATE_ID: a candidate profile with a phone or email on file.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const CANDIDATE_ID = process.env.E2E_CANDIDATE_ID;

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

async function chooseOption(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

test.describe("Command Centre recruitment", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, "/admin");
  });

  test("every owned list route resolves with a heading", async ({ page }) => {
    const routes: [string, string | RegExp][] = [
      ["/admin/candidates", "Candidates"],
      ["/admin/pipeline", "Pipeline"],
      ["/admin/pipeline?view=board", "Pipeline"],
      ["/admin/interviews", "Interviews"],
      ["/admin/interviews/new", "Schedule an interview"],
      ["/admin/assessments", "Assessment centre"],
      ["/admin/assessments/centres", "Assessment centres"],
      ["/admin/assessments/new", "Schedule assessments"],
      ["/admin/mobilisation", "Mobilisation"],
      ["/admin/mobilisation?view=table", "Mobilisation"],
      ["/admin/partners", "Partner assignments"],
      ["/admin/partners/new", "New partner assignment"],
      ["/admin/partners/submissions", "Submission review"],
      ["/admin/partners/performance", "Partner performance"],
      ["/admin/partners/agreements", "Partner agreements"],
      ["/admin/training", "Training"],
      ["/admin/training/courses", "Courses"],
      ["/admin/training/courses/new", "New Venkat Sai course"],
      ["/admin/training/batches", "Batches"],
      ["/admin/training/certificates", "Certificate registry"],
      ["/admin/training/institutions", "Institutions"],
    ];
    for (const [path, heading] of routes) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    }
  });

  test("detail routes linked from notifications return 404 for unknown ids, not errors", async ({ page }) => {
    const missing = "00000000-0000-4000-8000-000000000000";
    for (const path of [
      `/admin/candidates/${missing}`,
      `/admin/pipeline/${missing}`,
      `/admin/mobilisation/${missing}`,
      `/admin/partners/${missing}`,
      `/admin/partners/submissions/${missing}`,
      `/admin/training/batches/${missing}`,
      `/admin/training/courses/${missing}`,
      `/admin/interviews/${missing}`,
      `/admin/assessments/${missing}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("candidate search filters are reflected in the URL", async ({ page }) => {
    await page.goto("/admin/candidates");
    await page.getByRole("searchbox", { name: /search by role/i }).fill("welder");
    await page.getByRole("searchbox", { name: /search by role/i }).press("Enter");
    await expect(page).toHaveURL(/q=welder/);
    await expect(page.getByRole("table", { name: "Candidate search results" }).or(page.getByText("No candidates match"))).toBeVisible();
  });

  test("candidate contact is masked until revealed with a reason", async ({ page }) => {
    test.skip(!CANDIDATE_ID, "E2E_CANDIDATE_ID not set");
    await page.goto(`/admin/candidates/${CANDIDATE_ID}`);
    await expect(page.getByRole("heading", { level: 2, name: "Contact" })).toBeVisible();
    const reveal = page.getByTestId("reveal-contact");
    if (await reveal.isVisible()) {
      await reveal.click();
      await page.getByRole("dialog").getByLabel("Reason").fill("E2E check: arranging a trade test");
      await page.getByRole("dialog").getByRole("button", { name: "Reveal" }).click();
      await expect(page.getByRole("button", { name: "Hide" })).toBeVisible();
    }
  });

  test("create an assessment centre", async ({ page }) => {
    await page.goto("/admin/assessments/centres");
    const form = page.getByTestId("centre-form");
    test.skip(!(await form.isVisible()), "Needs training.manage");
    const name = `E2E Centre ${unique()}`;
    await form.getByLabel("Centre name").fill(name);
    await chooseOption(page, "Country", /India/);
    await form.getByLabel("City").fill("Visakhapatnam");
    await form.getByRole("button", { name: "Add centre" }).click();
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  });

  test("create a Venkat Sai course draft and add a module", async ({ page }) => {
    await page.goto("/admin/training/courses/new");
    const form = page.getByTestId("course-form");
    const title = `E2E Welding basics ${unique()}`;
    await form.getByLabel("Course title").fill(title);
    await chooseOption(page, "Category", "Welding");
    await chooseOption(page, "What learners can earn", /completion/i);
    await form.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.getByLabel("Module title").fill("Safety and PPE");
    await page.getByRole("button", { name: "Add module" }).click();
    await expect(page.getByText("1. Safety and PPE")).toBeVisible();
  });

  test("mobilisation uses PDOT wording", async ({ page }) => {
    await page.goto("/admin/mobilisation");
    await expect(page.getByText(/PDOT \(Pre-Departure Orientation Training\)/)).toBeVisible();
  });

  test("certificate registry states honest-credential wording", async ({ page }) => {
    await page.goto("/admin/training/certificates");
    await expect(page.getByText(/never presented as accredited qualifications/i)).toBeVisible();
  });
});
