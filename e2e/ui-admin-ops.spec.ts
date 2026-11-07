import { expect as baseExpect, test } from "@playwright/test";

import { chooseOption, dismissConsentBanner, expectHealthyPage, expectVisibleKeyboardFocus, openDialog, signInAs, unique, watchServerErrors } from "./admin-ops-helpers";
import { hasCredentials, missingCredentials, signIn } from "./support";

/**
 * Command Centre operations (qa:admin-ops): executive dashboard, approval centre, users, organisations,
 * jobs, requirements, leads & enquiries, tasks.
 *
 * Accounts and ids come from the E2E seed (`npm run db:seed:e2e`, env file E:/VenkatSaiGlobal-work/e2e/e2e.env):
 * ADMIN (Super Admin), CONTENT (Content Manager, for permission boundaries), E2E_EMPLOYER_ORG_ID,
 * E2E_EMPLOYER_JOB_ID, and one pending organisation per project (E2E_ADMINOPS_PENDING_ORG_<PROJECT>_ID).
 * Every record a test creates carries a unique name, so the chromium and mobile runs never collide.
 */

// The dev server compiles routes and Server Actions on first use; give assertions room for that.
const expect = baseExpect.configure({ timeout: 30_000 });

const ZERO_UUID = "00000000-0000-4000-8000-000000000000";

test.describe("Command Centre operations", () => {
  test.skip(!hasCredentials("admin"), missingCredentials("admin"));

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", "/admin");
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

  test("every owned route renders cleanly (one h1, no sideways scroll, no serious axe issues)", async ({ page }) => {
    test.setTimeout(300_000);
    const serverErrors = watchServerErrors(page);
    const routes: [string, string | RegExp][] = [
      ["/admin", "Executive dashboard"],
      ["/admin/approvals", "Approval centre"],
      ["/admin/approvals?assignee=me", "Approval centre"],
      ["/admin/users", "Users"],
      ["/admin/users?kind=staff", "Users"],
      ["/admin/organizations", /Employers|Organisations/],
      ["/admin/organizations?type=recruitment_partner", "Recruitment partners"],
      ["/admin/organizations?type=institution", "Institutions"],
      ["/admin/jobs", "Jobs"],
      ["/admin/jobs/new", /job/i],
      ["/admin/requirements", /requirements/i],
      ["/admin/requirements?view=board", /requirements/i],
      ["/admin/leads", /Leads/],
      ["/admin/leads?tab=enquiries", /Leads/],
      ["/admin/tasks", "My tasks"],
      ["/admin/tasks?view=overdue", "My tasks"],
    ];
    if (process.env.E2E_EMPLOYER_ORG_ID) routes.push([`/admin/organizations/${process.env.E2E_EMPLOYER_ORG_ID}`, /E2E Employer Co/]);
    if (process.env.E2E_EMPLOYER_JOB_ID) routes.push([`/admin/jobs/${process.env.E2E_EMPLOYER_JOB_ID}`, /E2E Structural welder/]);
    for (const [path, h1] of routes) await expectHealthyPage(page, path, h1);
    expect(serverErrors()).toEqual([]);
  });

  test("keyboard focus is visible on the main pages", async ({ page }) => {
    for (const path of ["/admin/approvals", "/admin/jobs", "/admin/tasks"]) {
      await page.goto(path);
      await expectVisibleKeyboardFocus(page);
    }
  });

  test("unknown record ids show not found", async ({ page }) => {
    for (const path of [
      `/admin/approvals/${ZERO_UUID}`,
      "/admin/leads/not-a-uuid",
      `/admin/leads/enquiries/${ZERO_UUID}`,
      `/admin/jobs/${ZERO_UUID}`,
      "/admin/jobs/not-a-uuid",
      `/admin/users/${ZERO_UUID}`,
      `/admin/organizations/${ZERO_UUID}`,
      `/admin/requirements/${ZERO_UUID}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("approval centre filters are kept in the URL", async ({ page }) => {
    await page.goto("/admin/approvals");
    await page.getByRole("searchbox", { name: /Search by title or code/ }).fill("VSG-APR");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=VSG-APR/);
    // Desktop shows a table, phones a card list with the same caption.
    await expect(page.getByRole("table", { name: "Approval requests" }).or(page.getByRole("list", { name: "Approval requests" })).or(page.getByText(/No requests match|Nothing waiting/)).first()).toBeVisible();
  });

  test("create a task: field error first, the dialog closes on success, then start and complete it", async ({ page }) => {
    const title = `E2E follow-up ${unique()}`;
    await page.goto("/admin/tasks");
    await openDialog(page, page.getByTestId("new-task"));
    const form = page.getByTestId("new-task-form");
    await form.getByRole("button", { name: "Create task" }).click();
    await expect(form.getByLabel("Task")).toHaveAttribute("aria-invalid", "true");
    await form.getByLabel("Task").fill(title);
    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Task created")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    const row = page.getByRole("row", { name: new RegExp(title) }).or(page.locator("li", { hasText: title }));
    await row.getByRole("button", { name: /Start/ }).first().click();
    await expect(page.getByText("Task updated")).toBeVisible();
    await row.getByRole("button", { name: /Mark done/ }).first().click();
    await expect(page.getByText("Task completed")).toBeVisible();
  });

  test("create a lead, record a follow-up and add a note", async ({ page }) => {
    const name = `E2E Contact ${unique()}`;
    await page.goto("/admin/leads");
    await openDialog(page, page.getByTestId("new-lead"));
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
    await chooseOption(page, "Country", /India/, form);
    await form.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Confidential client").first()).toBeVisible();
  });

  test("jobs list supports selection for bulk actions", async ({ page }) => {
    await page.goto("/admin/jobs");
    // Row checkboxes are named "Select <title> (<code>)"; the header checkbox selects the whole page.
    const checkbox = page.getByRole("checkbox", { name: /^Select (?!all rows)/ }).first();
    await expect(checkbox).toBeVisible();
    // check() is idempotent, so retrying covers a click that lands before hydration.
    await expect(async () => {
      await checkbox.check({ timeout: 2_000 });
      await expect(page.getByRole("region", { name: "Bulk actions" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Bulk actions" })).toContainText("1 selected");
    await expect(page.getByRole("heading", { name: /More actions for 1 selected job/ })).toBeVisible();
  });

  test("organisation tabs switch by type", async ({ page }) => {
    await page.goto("/admin/organizations?type=recruitment_partner");
    await expect(page.getByRole("heading", { level: 1, name: "Recruitment partners" })).toBeVisible();
    await page.getByRole("link", { name: "Institutions" }).first().click();
    await expect(page).toHaveURL(/type=institution/);
  });

  test("verified organisation shows its verification history", async ({ page }) => {
    const orgId = process.env.E2E_EMPLOYER_ORG_ID;
    test.skip(!orgId, "E2E_EMPLOYER_ORG_ID not set");
    await page.goto(`/admin/organizations/${orgId}`);
    await expect(page.getByRole("heading", { level: 1, name: /E2E Employer Co/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Verification history" })).toBeVisible();
    await expect(page.getByText("Never submitted for verification")).toHaveCount(0);
  });

  test("users list masks contact details", async ({ page }) => {
    await page.goto("/admin/users?kind=staff");
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
    await expect(page.getByText(process.env.E2E_ADMIN_EMAIL!, { exact: true })).toHaveCount(0);
  });
});

test.describe("Command Centre operations: decisions and lifecycles", () => {
  test.skip(!hasCredentials("admin"), missingCredentials("admin"));

  test("organisation verification is decided in the approval centre", async ({ page }, testInfo) => {
    const orgId = process.env[`E2E_ADMINOPS_PENDING_ORG_${testInfo.project.name.toUpperCase()}_ID`];
    test.skip(!orgId, "Pending organisation for this project not seeded (npm run db:seed:e2e)");
    await signInAs(page, "admin", `/admin/organizations/${orgId}`);
    const review = page.getByRole("link", { name: "Review verification" });
    test.skip((await review.count()) === 0, "Already decided in this seed run; re-run npm run db:seed:e2e -- --keep-passwords");
    await review.click();
    await expect(page).toHaveURL(/\/admin\/approvals\/[0-9a-f-]{36}/);
    const decision = page.getByTestId("approval-decision-form");
    await chooseOption(page, "Decision", "Approve", decision);
    await decision.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByTestId("approval-decision-form")).toHaveCount(0);
    await page.goto(`/admin/organizations/${orgId}`);
    await expect(page.getByRole("link", { name: "Review verification" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Verification history" })).toContainText(/Approved|Verified/);
  });

  test("public requirement -> approval decision -> job created from the role -> publish and close", async ({ page }) => {
    test.setTimeout(300_000);
    const serverErrors = watchServerErrors(page);
    const title = `E2E Shutdown welders ${unique()}`;

    // 1. A client submits a workforce requirement on the public site.
    await page.goto("/employers/request");
    await dismissConsentBanner(page);
    const form = page.locator("form").filter({ has: page.getByTestId("requirement-submit") });
    await form.getByLabel("Requirement title").fill(title);
    await form.getByLabel("Role or trade").first().fill("TIG welder");
    await form.getByLabel("Number of positions").first().fill("4");
    await form.getByLabel("Company name").fill("E2E Refinery Services (test)");
    await form.getByRole("textbox", { name: "Contact person", exact: true }).fill("E2E Client Contact");
    await form.getByLabel("Email", { exact: true }).fill(`client-${unique()}@example.test`);
    await form.getByRole("checkbox", { name: /may contact me about this requirement/ }).check();
    await page.getByTestId("requirement-submit").click();
    const code = (await page.getByTestId("requirement-code").textContent())?.trim();
    expect(code).toMatch(/REQ/);

    // 2. Staff decide it in the approval centre: a reason is required to request changes.
    await signIn(page, "admin", { returnTo: "/admin/approvals" });
    await page.getByRole("searchbox", { name: /Search by title or code/ }).fill(code!);
    await page.keyboard.press("Enter");
    await page.getByRole("link", { name: new RegExp(title) }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
    const decision = page.getByTestId("approval-decision-form");
    await chooseOption(page, "Decision", "Request changes", decision);
    await decision.getByRole("button", { name: "Record decision" }).click();
    await expect(decision.getByLabel("Reason")).toHaveAttribute("aria-invalid", "true");
    await expect(decision.getByLabel("Decision")).toContainText("Request changes");
    await chooseOption(page, "Decision", "Approve", decision);
    await decision.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByTestId("approval-decision-form")).toHaveCount(0);

    // 3. The requirement is now being delivered: create a job from its role.
    await page.getByRole("link", { name: "Open the record" }).first().click();
    await expect(page).toHaveURL(/\/admin\/requirements\/[0-9a-f-]{36}/);
    const requirementUrl = page.url();
    await page.getByRole("link", { name: "Create job" }).first().click();
    const jobForm = page.getByTestId("admin-job-form");
    await expect(jobForm.getByLabel("Job title")).toHaveValue("TIG welder");
    await expect(jobForm.getByLabel("Openings")).toHaveValue("4");
    await chooseOption(page, "Country", /India/, jobForm);
    await jobForm.getByLabel("Working hours").fill("10 hours, 6 days");
    await jobForm.getByLabel("Summary").fill("TIG welders for a refinery shutdown (E2E test job).");
    // No employer organisation: the description shown to candidates is required. The error keeps the input.
    await jobForm.getByRole("button", { name: "Save draft" }).click();
    await expect(jobForm.getByLabel("Employer description shown to candidates")).toHaveAttribute("aria-invalid", "true");
    await expect(jobForm.getByLabel("Job title")).toHaveValue("TIG welder");
    await expect(jobForm.getByLabel("Working hours")).toHaveValue("10 hours, 6 days");
    await expect(jobForm.getByLabel("Country")).toContainText("India");
    await jobForm.getByLabel("Employer description shown to candidates").fill("Refinery services company, India");
    await jobForm.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: "TIG welder" })).toBeVisible();
    await expect(page.getByText("Draft saved and linked to the role").first()).toBeVisible();
    const jobUrl = page.url();

    await page.goto(requirementUrl);
    await expect(page.getByRole("link", { name: /VSG-JOB-\d+ \(Draft\)/ }).first()).toBeVisible();

    // 4. Job lifecycle: publish, then close as filled.
    await page.goto(jobUrl);
    await page.getByRole("button", { name: "Publish" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
    const actions = page.getByRole("complementary", { name: "Job actions" });
    await chooseOption(page, "Action", "Close", actions);
    await chooseOption(page, "Closing reason", "Filled", actions);
    await actions.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toHaveCount(0);
    await expect(page.getByText("Closed").first()).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test("staff member: create, suspend with a reason, reactivate; no self-suspension", async ({ page }) => {
    const email = `e2e-staff-${unique()}@example.test`;
    await signInAs(page, "admin", "/admin/users?kind=staff");
    await openDialog(page, page.getByTestId("new-staff"));
    const form = page.getByTestId("new-staff-form");
    await form.getByLabel("Full name").fill("E2E Temporary Staff");
    await form.getByLabel("Work e-mail").fill(email);
    await form.getByLabel("Roles").click();
    await page.getByRole("option", { name: /Content/ }).first().click();
    await page.keyboard.press("Escape");
    await form.getByRole("button", { name: "Create and send invite" }).click();
    await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Temporary Staff" })).toBeVisible();
    const userUrl = page.url();

    const status = page.getByRole("region", { name: "Account status" });
    await status.getByRole("button", { name: "Suspend account" }).click();
    await expect(status.getByLabel("Reason")).toHaveAttribute("aria-invalid", "true");
    await status.getByLabel("Reason").fill("E2E: access paused during a test.");
    await status.getByRole("button", { name: "Suspend account" }).click();
    await expect(page.getByText("Account suspended and signed out everywhere").first()).toBeVisible();
    await expect(page.getByText("E2E: access paused during a test.").first()).toBeVisible();
    await status.getByLabel("Reason").fill("E2E: test finished.");
    await status.getByRole("button", { name: "Reactivate account" }).click();
    await expect(page.getByText("Account reactivated").first()).toBeVisible();
    await expect(status.getByRole("button", { name: "Suspend account" })).toBeVisible();
    expect(page.url()).toBe(userUrl);

    // Own account: no status, role or session controls (the service refuses them too).
    await page.goto("/admin/users?kind=staff&q=E2E%20Super%20Admin");
    await page.getByRole("link", { name: /E2E Super Admin/ }).first().click();
    await expect(page.getByText("This is your account")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend account" })).toHaveCount(0);
  });
});

test.describe("Command Centre operations: permission boundaries", () => {
  test.skip(!hasCredentials("content"), missingCredentials("content"));

  test("a content manager gets the friendly 403 page for operations areas", async ({ page }) => {
    await signIn(page, "content", { returnTo: "/admin" });
    for (const path of ["/admin/users", "/admin/organizations", "/admin/leads", "/admin/commercial"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(/access/i);
    }
  });
});
