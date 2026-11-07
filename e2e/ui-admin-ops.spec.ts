import { expect, test, type Page } from "@playwright/test";

/**
 * Command Centre operations (ui:admin-ops): executive dashboard, approval centre, users,
 * organisations, jobs, requirements, leads & enquiries, tasks.
 *
 * Needs a seeded staff account (flows are skipped when the variables are missing):
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD: staff with the Super Admin (or Operations Admin) role and 2FA
 *   satisfied for the test environment (security.require_staff_2fa off, or a pre-verified session).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

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

test.describe("Command Centre operations", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, "/admin");
  });

  test("executive dashboard shows live sections with links", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Executive dashboard" })).toBeVisible();
    for (const name of ["Work queue", "People and organisations", "Hiring and training"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await page.getByRole("link", { name: /Pending approvals/ }).click();
    await expect(page).toHaveURL(/\/admin\/approvals/);
    await expect(page.getByRole("heading", { level: 1, name: "Approval centre" })).toBeVisible();
  });

  test("every owned route resolves", async ({ page }) => {
    for (const path of [
      "/admin",
      "/admin/approvals",
      "/admin/approvals?assignee=me",
      "/admin/users",
      "/admin/organizations",
      "/admin/organizations?type=employer",
      "/admin/organizations?type=recruitment_partner",
      "/admin/organizations?type=institution",
      "/admin/jobs",
      "/admin/jobs/new",
      "/admin/requirements",
      "/admin/requirements?view=board",
      "/admin/leads",
      "/admin/leads?tab=enquiries",
      "/admin/tasks",
      "/admin/tasks?view=overdue",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    }
  });

  test("unknown record ids show not found", async ({ page }) => {
    for (const path of ["/admin/approvals/00000000-0000-4000-8000-000000000000", "/admin/leads/not-a-uuid", "/admin/leads/enquiries/00000000-0000-4000-8000-000000000000"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("approval centre filters are kept in the URL", async ({ page }) => {
    await page.goto("/admin/approvals");
    await page.getByRole("searchbox", { name: /Search by title or code/ }).fill("VSG-APR");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=VSG-APR/);
    await expect(page.getByRole("table", { name: "Approval requests" }).or(page.getByText(/No requests match|Nothing waiting/))).toBeVisible();
  });

  test("create a task, start and complete it", async ({ page }) => {
    const title = `E2E follow-up ${unique()}`;
    await page.goto("/admin/tasks");
    await page.getByTestId("new-task").click();
    const form = page.getByTestId("new-task-form");
    await form.getByLabel("Task").fill(title);
    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Task created")).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(title) }).or(page.locator("li", { hasText: title }));
    await row.getByRole("button", { name: /Start/ }).first().click();
    await expect(page.getByText("Task updated")).toBeVisible();
    await row.getByRole("button", { name: /Mark done/ }).first().click();
    await expect(page.getByText("Task completed")).toBeVisible();
  });

  test("create a lead, record a follow-up and add a note", async ({ page }) => {
    const name = `E2E Contact ${unique()}`;
    await page.goto("/admin/leads");
    await page.getByTestId("new-lead").click();
    const form = page.getByTestId("new-lead-form");
    await form.getByLabel("Contact name").fill(name);
    await form.getByLabel("Organisation").fill("E2E Fabrication Pvt Ltd");
    await form.getByLabel("Email").fill(`lead-${unique()}@example.test`);
    await form.getByRole("button", { name: "Create lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Fabrication Pvt Ltd" })).toBeVisible();

    await page.getByLabel("What was discussed").fill("Called; needs 20 welders for Oman.");
    await page.getByRole("button", { name: "Save follow-up" }).click();
    await expect(page.getByText("Follow-up recorded")).toBeVisible();

    const notes = page.getByTestId("internal-note-form");
    await notes.getByLabel("Add a note").fill("Prefers WhatsApp after 6 pm.");
    await notes.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Prefers WhatsApp after 6 pm.")).toBeVisible();
  });

  test("create a confidential-client job draft", async ({ page }) => {
    const title = `E2E Pipe Fitter ${unique()}`;
    await page.goto("/admin/jobs/new");
    const form = page.getByTestId("admin-job-form");
    await form.getByLabel("Job title").fill(title);
    await form.getByLabel(/Confidential client/).check();
    await form.getByLabel("Employer description shown to candidates").fill("EPC contractor, Qatar");
    await chooseOption(page, "Country", /India/);
    await form.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Confidential client").first()).toBeVisible();
  });

  test("jobs list supports selection for bulk actions", async ({ page }) => {
    await page.goto("/admin/jobs");
    const checkbox = page.getByRole("checkbox", { name: /^Select / }).first();
    if (await checkbox.count()) {
      await checkbox.check();
      await expect(page.getByRole("region", { name: "Bulk actions" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /More actions for 1 selected job/ })).toBeVisible();
    }
  });

  test("organisation tabs switch by type", async ({ page }) => {
    await page.goto("/admin/organizations?type=recruitment_partner");
    await expect(page.getByRole("heading", { level: 1, name: "Recruitment partners" })).toBeVisible();
    await page.getByRole("link", { name: "Institutions" }).first().click();
    await expect(page).toHaveURL(/type=institution/);
  });

  test("users list masks contact details", async ({ page }) => {
    await page.goto("/admin/users?kind=staff");
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
    await expect(page.getByText(ADMIN_EMAIL!, { exact: true })).toHaveCount(0);
  });
});
