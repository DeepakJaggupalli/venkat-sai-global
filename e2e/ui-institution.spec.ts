import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "./support";

import {
  account,
  expectForbidden,
  expectHealthyPage,
  expectInternalLinksResolve,
  expectNotFound,
  focusIsVisible,
  missing,
  signInAs,
  unique,
  uploadPdf,
  watchServerErrors,
} from "./partner-institution-helpers";

/**
 * Institution & Training Portal (ui:institution): onboarding, dashboard, profile and verification, courses,
 * batches (attendance and assessments), students (?batch=), certificates, placements (outcomes with evidence),
 * reports, team, announcements; permission and organisation boundaries.
 *
 * Needs the accounts and ids written by `npm run db:seed:e2e` (flows are skipped when they are missing):
 * - E2E_INSTITUTION_*: owner of the verified "E2E Training Institute" (authorised certificate issuer).
 * - E2E_INSTITUTION_PLACEMENTS_*: member with a custom role holding only institution.dashboard +
 *   institution.placements.manage.
 * - E2E_NEW_USER_*: verified user without an institution (onboarding; single use per seed run).
 * - E2E_INSTITUTION_COURSE_ID (published), E2E_INSTITUTION_BATCH_ID (shared, one confirmed learner),
 *   E2E_INSTITUTION_QA_BATCH_ID (four confirmed QA learners; each run completes and certifies one),
 *   E2E_OTHER_BATCH_ID / E2E_OTHER_INSTITUTION_COURSE_ID (another institution: must 404).
 */

const OWNER = account("INSTITUTION");
const PLACEMENTS = account("INSTITUTION_PLACEMENTS");
const NEW_USER = account("NEW_USER");
const COURSE_ID = process.env.E2E_INSTITUTION_COURSE_ID;
const BATCH_ID = process.env.E2E_INSTITUTION_BATCH_ID;
const QA_BATCH_ID = process.env.E2E_INSTITUTION_QA_BATCH_ID;
const OTHER_BATCH_ID = process.env.E2E_OTHER_BATCH_ID;
const OTHER_COURSE_ID = process.env.E2E_OTHER_INSTITUTION_COURSE_ID;
const QA_LEARNERS = ["E2E QA Learner One", "E2E QA Learner Two", "E2E QA Learner Three", "E2E QA Learner Four"];

test.describe("institution onboarding", () => {
  test.skip(!NEW_USER, missing("NEW_USER"));

  test("creates an institution workspace and lands on the setup checklist", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The fresh account is single use per seed run; the chromium run consumes it.");
    const serverErrors = watchServerErrors(page);
    await signInAs(page, NEW_USER!, "/institution/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /set up your institution workspace/i })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });

    const name = `E2E Technical Institute ${unique()}`;
    await page.getByLabel("Institution name").fill(name);
    await page.getByRole("button", { name: /create institution workspace/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    // The error summary takes focus (wait for it, or it closes the next popover) and speaks plain English.
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
    await expect(page.getByText(/invalid input|expected string/i)).toHaveCount(0);
    await expect(page.getByLabel("Institution name")).toHaveValue(name);

    await page.getByLabel("Kind of institution").click();
    await page.getByRole("option", { name: /industrial training institute/i }).click();
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
    await expect(page.getByText(/set up your institution/i).first()).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });
});

test.describe("institution workspace (owner)", () => {
  test.skip(!OWNER, missing("INSTITUTION"));

  test.beforeEach(async ({ page }) => {
    await signInAs(page, OWNER!, "/institution");
  });

  test("dashboard shows live training and outcome figures", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Outcomes" })).toBeVisible();
    await expect(page.getByText("Attendance rate")).toBeVisible();
    await expect(page.getByText("Pass rate")).toBeVisible();
    await expect(page.getByText(/lorem ipsum/i)).toHaveCount(0);
  });

  const pages: [string, string | RegExp][] = [
    ["/institution", /welcome/i],
    ["/institution/profile", "Institution profile"],
    ["/institution/courses", "Courses"],
    ["/institution/courses/new", /course/i],
    ["/institution/batches", "Batches"],
    ["/institution/batches/new", "Schedule a batch"],
    ["/institution/students", "Students"],
    ["/institution/assessments", "Assessments"],
    ["/institution/certificates", "Certificates"],
    ["/institution/placements", "Placements"],
    ["/institution/placements?tab=internships", "Placements"],
    ["/institution/placements?tab=outcomes", "Placements"],
    ["/institution/reports", "Reports"],
    ["/institution/team", "Team"],
    ["/institution/announcements", "Announcements"],
    ["/institution/messages", /messages/i],
    ["/institution/support", /support/i],
    ["/institution/billing", /billing|plan/i],
  ];
  for (const [path, heading] of pages) {
    test(`renders ${path} accessibly`, async ({ page }) => {
      const serverErrors = watchServerErrors(page);
      await expectHealthyPage(page, path, heading);
      expect(serverErrors()).toEqual([]);
    });
  }

  test("course and batch pages render accessibly", async ({ page }) => {
    test.skip(!COURSE_ID || !BATCH_ID, "E2E_INSTITUTION_COURSE_ID / E2E_INSTITUTION_BATCH_ID not set");
    await expectHealthyPage(page, `/institution/courses/${COURSE_ID}`);
    for (const tab of ["", "?tab=learners", "?tab=attendance", "?tab=assessments"]) await expectHealthyPage(page, `/institution/batches/${BATCH_ID}${tab}`);
    await expectHealthyPage(page, `/institution/students?batch=${BATCH_ID}`, /^Students:/);
  });

  test("pages fit a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const paths = ["/institution", "/institution/courses", "/institution/batches", "/institution/students", "/institution/certificates", "/institution/placements?tab=outcomes", "/institution/reports", "/institution/team"];
    if (BATCH_ID) paths.push(`/institution/batches/${BATCH_ID}?tab=learners`, `/institution/batches/${BATCH_ID}?tab=assessments`);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test("keyboard focus is visible", async ({ page }) => {
    await page.goto("/institution/courses");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await focusIsVisible(page)).toBe(true);
  });

  test("links inside the portal resolve", async ({ page }) => {
    test.setTimeout(300_000);
    for (const path of ["/institution", "/institution/courses", "/institution/batches", "/institution/students", "/institution/certificates", "/institution/placements", "/institution/reports", "/institution/profile"]) {
      await expectInternalLinksResolve(page, path, "/institution");
    }
  });

  test("batch dialogs are accessible", async ({ page }) => {
    test.skip(!BATCH_ID, "E2E_INSTITUTION_BATCH_ID not set");
    await page.goto(`/institution/batches/${BATCH_ID}?tab=assessments`);
    await page.getByRole("button", { name: "Add assessment" }).click();
    await expect(page.getByRole("dialog", { name: "Add an assessment" })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });
    await page.keyboard.press("Escape");
    await page.goto(`/institution/batches/${BATCH_ID}?tab=attendance`);
    await page.getByRole("button", { name: "New session" }).click();
    await expect(page.getByRole("dialog", { name: "New session" })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });
  });

  test("profile shows verification requirements and read-only issuer authorisation", async ({ page }) => {
    await page.goto("/institution/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Institution profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verification" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Certificate-issuer authorisation" })).toBeVisible();
    await expect(page.getByText(/you cannot change it here/i)).toBeVisible();
  });

  test("course form shows field errors and keeps input", async ({ page }) => {
    await page.goto("/institution/courses/new");
    await page.getByLabel("Course title").fill("E2E incomplete course");
    await page.getByLabel("Category").click();
    await page.getByRole("option", { name: "Welding" }).click();
    await page.getByLabel("Duration (hours)").fill("-5");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText(/invalid input|expected string/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/institution\/courses\/new/);
    await expect(page.getByLabel("Course title")).toHaveValue("E2E incomplete course");
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
    await expect(page.getByRole("textbox", { name: "External awarding body" })).toBeVisible();
  });

  test("schedules a batch for a published course", async ({ page }) => {
    test.skip(!COURSE_ID, "E2E_INSTITUTION_COURSE_ID not set");
    const serverErrors = watchServerErrors(page);
    await page.goto(`/institution/batches/new?course=${COURSE_ID}`);
    // Required title: error shown, other input kept.
    await page.getByLabel("Venue").fill("Workshop 2");
    await page.getByRole("button", { name: "Schedule batch" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText(/invalid input|expected string|invalid identifier/i)).toHaveCount(0);
    await expect(page.getByLabel("Venue")).toHaveValue("Workshop 2");

    const title = `E2E Evening batch ${unique()}`;
    await page.getByLabel("Batch title").fill(title);
    await page.getByRole("button", { name: "Schedule batch" }).click();
    await page.waitForURL(/\/institution\/batches\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Planned").first()).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test("lists pages render with honest empty states or data", async ({ page }) => {
    for (const [path, heading] of [
      ["/institution/courses", "Courses"],
      ["/institution/batches", "Batches"],
      ["/institution/students", "Students"],
      ["/institution/assessments", "Assessments"],
      ["/institution/certificates", "Certificates"],
      ["/institution/placements", "Placements"],
      ["/institution/reports", "Reports"],
      ["/institution/team", "Team"],
      ["/institution/announcements", "Announcements"],
    ] as const) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText(/lorem ipsum|placeholder/i)).toHaveCount(0);
    }
  });

  test("CSV export returns a file for report viewers", async ({ page }) => {
    const response = await page.request.get("/institution/reports/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toContain("Completion rate %");
  });

  test("students page honours ?batch=", async ({ page }) => {
    test.skip(!BATCH_ID, "E2E_INSTITUTION_BATCH_ID not set");
    await page.goto(`/institution/students?batch=${BATCH_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: /^Students:/ })).toBeVisible();
  });

  test("attendance, scores, completion and a certificate for a QA learner", async ({ page }) => {
    test.skip(!QA_BATCH_ID, "E2E_INSTITUTION_QA_BATCH_ID not set");
    test.setTimeout(240_000);
    const serverErrors = watchServerErrors(page);
    const base = `/institution/batches/${QA_BATCH_ID}`;

    // Attendance, taken on a phone-sized screen.
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${base}?tab=attendance`);
    await expect(page.getByRole("heading", { level: 2, name: "Attendance" })).toBeVisible();
    test.skip(await page.getByText("No learners to mark yet").isVisible(), "Every QA learner of this batch is already completed: re-run npm run db:seed:e2e -- --keep-passwords.");
    await page.getByRole("button", { name: "New session" }).click();
    const session = page.getByRole("dialog", { name: "New session" });
    await session.getByLabel("Topic").fill(`E2E practical ${unique()}`);
    await session.getByRole("button", { name: "Add session" }).click();
    await expect(session).toBeHidden();
    await expect(page.getByTestId("attendance-row").first()).toBeVisible();
    await page.getByRole("button", { name: /mark unmarked as present/i }).click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText(/attendance saved/i).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.setViewportSize(test.info().project.use.viewport ?? { width: 1280, height: 720 });

    // An assessment with scores for every learner, then published.
    const assessment = `E2E practical test ${unique()}`;
    await page.goto(`${base}?tab=assessments`);
    await page.getByRole("button", { name: "Add assessment" }).click();
    const add = page.getByRole("dialog", { name: "Add an assessment" });
    await add.getByLabel("Title").fill(assessment);
    await add.getByLabel("Maximum score").fill("100");
    await add.getByLabel("Pass mark").fill("40");
    await add.getByRole("button", { name: /save|add assessment/i }).last().click();
    await expect(add).toBeHidden();
    const row = page.getByTestId("assessment-row").filter({ hasText: assessment });
    await row.getByRole("button", { name: "Enter scores" }).click();
    const sheet = page.getByRole("dialog", { name: `Scores: ${assessment}` });
    const inputs = sheet.getByRole("spinbutton", { name: /^Score for / });
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await inputs.nth(i).fill(String(60 + i));
    await sheet.getByRole("button", { name: "Save scores" }).click();
    await expect(sheet).toBeHidden();
    await expect(row.getByText(`${count} of ${count} marked`)).toBeVisible();
    await row.getByRole("button", { name: "Publish results" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish results" }).click();
    await expect(row.getByText("Results published")).toBeVisible();

    // Complete one learner who is still confirmed.
    await page.goto(`${base}?tab=learners`);
    const batchCode = (await page.getByText(/[A-Z]+-BAT-\d+/).first().textContent())?.match(/[A-Z]+-BAT-\d+/)?.[0];
    expect(batchCode).toBeTruthy();
    let learner: string | null = null;
    for (const name of QA_LEARNERS) {
      const menu = page.getByRole("button", { name: `Actions for ${name}` });
      if (!(await menu.count())) continue;
      await menu.click();
      const complete = page.getByRole("menuitem", { name: "Mark completed" });
      if (await complete.isVisible()) {
        await complete.click();
        learner = name;
        break;
      }
      await page.keyboard.press("Escape");
    }
    test.skip(!learner, "Every QA learner of this batch is already completed: re-run npm run db:seed:e2e -- --keep-passwords.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark completed" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();

    // Certificate of completion for that learner.
    await page.goto("/institution/certificates");
    await page.getByRole("button", { name: "Issue certificate" }).click();
    const issue = page.getByRole("dialog", { name: "Issue a certificate" });
    await issue.getByLabel("Learner and course").click();
    await page.getByRole("option").filter({ hasText: learner! }).filter({ hasText: batchCode! }).click();
    await issue.getByRole("button", { name: "Issue certificate" }).click();
    await expect(issue).toBeHidden();
    const certificates = page.getByRole("table", { name: "Issued certificates" }).or(page.getByRole("list", { name: "Issued certificates" }));
    await expect(page.getByText(learner!).and(page.locator(":visible")).first()).toBeVisible();
    await expect(page.getByText(/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/).and(page.locator(":visible")).first()).toBeVisible();
    expect(await certificates.count()).toBeGreaterThan(0);
    expect(serverErrors()).toEqual([]);
  });

  test("another organisation's records are not found", async ({ page }) => {
    test.skip(!OTHER_BATCH_ID, "E2E_OTHER_BATCH_ID not set");
    await expectNotFound(page, `/institution/batches/${OTHER_BATCH_ID}`);
    await expectNotFound(page, `/institution/batches/${OTHER_BATCH_ID}/edit`);
    await expectNotFound(page, `/institution/students?batch=${OTHER_BATCH_ID}`);
    await expectNotFound(page, "/institution/batches/not-a-uuid");
    await expectNotFound(page, "/institution/placements/drives/00000000-0000-4000-8000-000000000000");
    if (OTHER_COURSE_ID) {
      await expectNotFound(page, `/institution/courses/${OTHER_COURSE_ID}`);
      await expectNotFound(page, `/institution/courses/${OTHER_COURSE_ID}/edit`);
    }
  });
});

async function recordOutcome(page: Page, learnerHint: string): Promise<string> {
  const employer = `E2E Fabrication Works ${unique()}`;
  await page.getByRole("button", { name: "Record a placement" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a placement outcome" });
  await dialog.getByLabel("Learner").click();
  await page.getByRole("option").filter({ hasText: learnerHint }).first().click();
  await dialog.getByLabel("Employer").fill(employer);
  await dialog.getByLabel("Job title").fill("Welder (test)");
  await dialog.getByLabel("Placement date").fill("2026-10-01");
  await uploadPdf(dialog, "Evidence", "offer-letter.pdf");
  await dialog.getByRole("button", { name: "Record outcome" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0, { timeout: 5_000 });
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  return employer;
}

test.describe("institution placements member", () => {
  test.skip(!PLACEMENTS, missing("INSTITUTION_PLACEMENTS"));

  test.beforeEach(async ({ page }) => {
    await signInAs(page, PLACEMENTS!, "/institution");
  });

  test("records a placement outcome with evidence", async ({ page }) => {
    const serverErrors = watchServerErrors(page);
    await page.goto("/institution/placements?tab=outcomes");
    await expect(page.getByRole("heading", { level: 1, name: "Placements" })).toBeVisible();

    // Required fields: the form refuses and stays open with the employer kept.
    await page.getByRole("button", { name: "Record a placement" }).click();
    const dialog = page.getByRole("dialog", { name: "Record a placement outcome" });
    await dialog.getByLabel("Employer").fill("E2E Kept Employer");
    await dialog.getByRole("button", { name: "Record outcome" }).click();
    await expect(dialog.getByRole("alert").first()).toBeVisible();
    await expect(dialog.getByText(/invalid input|expected string|invalid identifier/i)).toHaveCount(0);
    await expect(dialog.getByLabel("Employer")).toHaveValue("E2E Kept Employer");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const employer = await recordOutcome(page, "E2E");
    const row = page.getByRole("row").filter({ hasText: employer }).or(page.getByRole("listitem").filter({ hasText: employer })).and(page.locator(":visible"));
    await expect(row.first()).toBeVisible();
    await expect(row.first().getByText(/self-reported/i)).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test("outcome dialog is accessible", async ({ page }) => {
    await page.goto("/institution/placements?tab=outcomes");
    await page.getByRole("button", { name: "Record a placement" }).click();
    await expect(page.getByRole("dialog", { name: "Record a placement outcome" })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });
  });

  test("sees only placements", async ({ page }) => {
    await expectForbidden(page, "/institution/courses");
    await expectForbidden(page, "/institution/certificates");
    if (BATCH_ID) await expectForbidden(page, `/institution/batches/${BATCH_ID}`, { status: 403 });
    const csv = await page.request.get("/institution/reports/export");
    expect(csv.status()).toBe(403);
  });
});
