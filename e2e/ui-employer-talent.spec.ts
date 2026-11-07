import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { expectHealthyPage, expectNotFound, signInAs } from "./employer-helpers";
import { expectNoA11yViolations } from "./support";

/**
 * Employer talent screens (ui:employer-talent): candidate search and profile (masked contact until unlock),
 * talent lists, pipeline (overview, per-job board, application drawer deep link), interview scheduling, offer
 * drafting, placements, reports and CSV export, permission boundaries and page health.
 *
 * Needs a seeded employer owner (flows are skipped when the variables are missing; `npm run db:seed:e2e`):
 * - E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD: owner of the verified "E2E Employer Co".
 * - E2E_EMPLOYER_JOB_ID / E2E_EMPLOYER_APPLICATION_ID: the published domestic job and the application shared
 *   by the adult candidate (drawer deep link; read and notes only, other specs rely on it).
 * - E2E_EMPLOYER_QA_JOB_ID / E2E_EMPLOYER_QA_APPLICATION_ID: a published QA job and its application, used for
 *   interview scheduling and offer drafting (seed block in src/server/seed/e2e-employer.ts).
 * - E2E_DISCOVERABLE_CANDIDATE_IDS: two discoverable adult candidates (comma separated) whose unlocks by
 *   E2E Employer Co are revoked on every seed run. The chromium run unlocks the first, mobile the second.
 * - E2E_OTHER_EMPLOYER_JOB_ID: a draft job of another organisation (isolation).
 */

const EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const PASSWORD = process.env.E2E_EMPLOYER_PASSWORD;
const JOB_ID = process.env.E2E_EMPLOYER_JOB_ID;
const APPLICATION_ID = process.env.E2E_EMPLOYER_APPLICATION_ID;
const QA_JOB_ID = process.env.E2E_EMPLOYER_QA_JOB_ID;
const QA_APPLICATION_ID = process.env.E2E_EMPLOYER_QA_APPLICATION_ID;
const DISCOVERABLE = (process.env.E2E_DISCOVERABLE_CANDIDATE_IDS ?? "").split(",").filter(Boolean);
const OTHER_JOB_ID = process.env.E2E_OTHER_EMPLOYER_JOB_ID;
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** First compile of a route in dev mode can take several seconds. */
const NAV = { timeout: 45_000 };

async function signIn(page: Page, returnTo: string) {
  await signInAs(page, { email: EMAIL!, password: PASSWORD! }, returnTo);
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** `yyyy-MM-ddTHH:mm` for a datetime-local input, `days` from now at 10:30. */
function localDateTime(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:30`;
}

async function openDrawer(page: Page, jobId: string, applicationId: string) {
  await signIn(page, `/employer/pipeline/${jobId}?application=${applicationId}`);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible(NAV);
  return drawer;
}

test.describe("employer talent", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD not set");

  test("candidate search shows filters and an honest result state", async ({ page }) => {
    await signIn(page, "/employer/candidates");
    await expect(page.getByRole("heading", { level: 1, name: "Find candidates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /candidates?$|results/i }).first()).toBeVisible();
    const filters = page.getByRole("search", { name: "Candidate search filters" });
    // On narrow screens the panel is collapsed behind a toggle.
    if (!(await filters.isVisible())) await page.getByRole("button", { name: /show filters/i }).click();
    await filters.getByLabel("Trade, role or keyword").fill("welder");
    await filters.getByLabel("Open to working overseas").check();
    await filters.getByRole("button", { name: "Search candidates" }).click();
    await expect(page).toHaveURL(/q=welder/);
    await expect(page).toHaveURL(/openToOverseas=true/);
    // Either cards, an empty state or a plan notice — never placeholder people.
    await expect(page.getByTestId("candidate-card").first().or(page.getByText(/no candidates match|no discoverable candidates|not included in your plan|not available|paused/i).first())).toBeVisible();
  });

  test("search results never show contact details", async ({ page }) => {
    test.skip(DISCOVERABLE.length === 0, "E2E_DISCOVERABLE_CANDIDATE_IDS not set");
    await signIn(page, "/employer/candidates");
    await expect(page.getByTestId("candidate-card").first()).toBeVisible();
    await expect(page.getByTestId("candidate-card").filter({ hasText: /@e2e\.venkatsai\.test/ })).toHaveCount(0);
  });

  test("compare selection is capped and opens the comparison", async ({ page }) => {
    await signIn(page, "/employer/candidates");
    const toggles = page.getByTestId("compare-toggle");
    await expect(page.getByTestId("candidate-card").first().or(page.getByText(/no candidates match|no discoverable candidates/i).first())).toBeVisible();
    test.skip((await toggles.count()) < 2, "needs at least two discoverable candidates");
    await toggles.nth(0).check();
    await toggles.nth(1).check();
    await expect(page.getByRole("region", { name: "Selected candidates" })).toContainText("2 of 4 selected");
    await page.getByRole("link", { name: "Compare" }).click();
    await expect(page).toHaveURL(/\/employer\/candidates\/compare\?ids=/, NAV);
    await expect(page.getByRole("table", { name: /candidate comparison/i })).toBeVisible();
  });

  test("candidate profile keeps contact masked until unlock", async ({ page }, testInfo) => {
    test.skip(DISCOVERABLE.length < 2, "E2E_DISCOVERABLE_CANDIDATE_IDS needs two candidates");
    // One candidate per project, so the chromium and mobile runs each start from a hidden profile.
    const candidateId = DISCOVERABLE[testInfo.project.name === "mobile" ? 1 : 0]!;
    await signIn(page, `/employer/candidates/${candidateId}`);
    await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Venkat Sai assessments" })).toBeVisible();
    await expect(page.getByText(/not accredited certifications/i)).toBeVisible();

    const fullEmail = /employer-qa-discoverable-\d@e2e\.venkatsai\.test/;
    await expect(page.getByText(fullEmail)).toHaveCount(0);
    const unlock = page.getByTestId("unlock-contact");
    if (await unlock.isVisible()) {
      await expect(page.getByText(/hidden until the candidate applies/i)).toBeVisible();
      // Cancelling uses nothing and keeps the details hidden.
      await unlock.click();
      const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
      await expect(dialog).toContainText(/credit/i);
      await dialog.getByRole("button", { name: /cancel/i }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(fullEmail)).toHaveCount(0);

      await unlock.click();
      await dialog.getByRole("button", { name: "Unlock", exact: true }).click();
      await expect(page.getByText(/contact details unlocked/i).first()).toBeVisible();
    } else {
      // Unlocked earlier in this seed run: masked until revealed, and the reveal is logged.
      await expect(page.getByText(/e\*\*\*@e2e\.venkatsai\.test/)).toBeVisible();
      await page.getByRole("button", { name: "Show contact details" }).click();
    }
    await expect(page.getByRole("link", { name: fullEmail })).toBeVisible();
    await expect(page.getByText(/recorded in the candidate.s access history/i)).toBeVisible();
    await page.getByRole("button", { name: "Hide contact details" }).click();
    await expect(page.getByText(fullEmail)).toHaveCount(0);
  });

  test("talent list lifecycle: create, open, archive", async ({ page }) => {
    await signIn(page, "/employer/lists");
    await expect(page.getByRole("heading", { level: 1, name: "Talent lists" })).toBeVisible();
    await page.getByRole("button", { name: "New list" }).click();
    // An empty name is explained inline.
    await page.getByRole("button", { name: "Create list" }).click();
    await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
    const name = `E2E list ${unique()}`;
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create list" }).click();
    await expect(page).toHaveURL(/\/employer\/lists\/[0-9a-f-]{36}/, NAV);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("This list is empty")).toBeVisible();
    await page.getByRole("button", { name: "Archive list" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  });

  test("pipeline overview and the jobs redirect", async ({ page }) => {
    await signIn(page, "/employer/pipeline");
    await expect(page.getByRole("heading", { level: 1, name: "Pipeline" })).toBeVisible();
    // A table on wide screens; on phones the same rows collapse to cards with an "Open pipeline" link each.
    await expect(page.getByRole("table", { name: /candidates per job/i }).or(page.getByRole("link", { name: /^open pipeline for /i }).first()).or(page.getByText("No published jobs yet")).first()).toBeVisible();
    test.skip(!JOB_ID, "E2E_EMPLOYER_JOB_ID not set");
    await page.goto(`/employer/jobs/${JOB_ID}/pipeline`);
    await expect(page).toHaveURL(new RegExp(`/employer/pipeline/${JOB_ID}$`), NAV);
  });

  test("application deep link opens the drawer and closing removes it", async ({ page }) => {
    test.skip(!JOB_ID || !APPLICATION_ID, "E2E_EMPLOYER_JOB_ID / E2E_EMPLOYER_APPLICATION_ID not set");
    const drawer = await openDrawer(page, JOB_ID!, APPLICATION_ID!);
    await expect(drawer.getByRole("tab", { name: /overview/i })).toBeVisible();
    await drawer.getByRole("tab", { name: /activity/i }).click();
    await expect(drawer.getByText(/candidate saw/i).first()).toBeVisible();
    await drawer.getByRole("tab", { name: /notes/i }).click();
    await drawer.getByLabel("Add a note").fill(`E2E internal note ${unique()}`);
    await drawer.getByRole("button", { name: "Add note" }).click();
    await expect(drawer.getByText(/e2e internal note/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`/employer/pipeline/${JOB_ID}$`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("board cards offer an accessible Move to menu", async ({ page }) => {
    test.skip(!JOB_ID, "E2E_EMPLOYER_JOB_ID not set");
    await signIn(page, `/employer/pipeline/${JOB_ID}`);
    await expect(page.getByTestId("pipeline-card").first()).toBeVisible(NAV);
    await expect(page.getByRole("button", { name: /move/i }).first()).toBeVisible();
  });

  test("schedules an interview from the drawer and lists it", async ({ page }) => {
    test.skip(!QA_JOB_ID || !QA_APPLICATION_ID, "E2E_EMPLOYER_QA_JOB_ID / E2E_EMPLOYER_QA_APPLICATION_ID not set");
    const drawer = await openDrawer(page, QA_JOB_ID!, QA_APPLICATION_ID!);
    await drawer.getByRole("tab", { name: /interviews/i }).click();
    await drawer.getByRole("button", { name: "Schedule interview" }).first().click();
    const dialog = page.getByRole("dialog", { name: /schedule an interview with/i });
    await expect(dialog).toBeVisible();

    // A missing time is explained inline and the round name typed so far is kept.
    const round = `E2E round ${unique()}`;
    await dialog.getByLabel("Round name").fill(round);
    await dialog.getByRole("button", { name: "Schedule interview" }).click();
    await expect(dialog.getByLabel("Date and time")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Round name")).toHaveValue(round);

    await dialog.getByLabel("Date and time").fill(localDateTime(3));
    await dialog.getByLabel("Location").fill("Venkat Sai test bay, Auto Nagar (E2E)");
    await dialog.getByRole("button", { name: "Schedule interview" }).click();
    await expect(dialog).toBeHidden();
    await expect(drawer.getByText(round).first()).toBeVisible();

    await page.goto("/employer/interviews");
    await expect(page.getByRole("heading", { level: 1, name: "Interviews" })).toBeVisible(NAV);
    await expect(page.getByText(round).first()).toBeVisible();
  });

  test("drafts an offer in the job's currency and keeps it a draft", async ({ page }) => {
    test.skip(!QA_JOB_ID || !QA_APPLICATION_ID, "E2E_EMPLOYER_QA_JOB_ID / E2E_EMPLOYER_QA_APPLICATION_ID not set");
    const drawer = await openDrawer(page, QA_JOB_ID!, QA_APPLICATION_ID!);
    await drawer.getByRole("tab", { name: /offers/i }).click();
    // The first run makes the offer; later runs edit the open draft (one open offer per application).
    const make = drawer.getByRole("button", { name: "Make an offer" });
    const edit = drawer.getByRole("button", { name: "Edit offer draft" });
    await expect(make.or(edit).first()).toBeVisible();
    const creating = await make.first().isVisible();
    await (creating ? make : edit).first().click();
    const dialog = page.getByRole("dialog", { name: creating ? "Make an offer" : "Edit offer draft" });
    await expect(dialog).toBeVisible();

    // A negative salary is refused with a field error, keeping what was typed.
    const notes = `E2E offer note ${unique()}`;
    await dialog.getByLabel("Internal notes").fill(notes);
    await dialog.getByLabel("Salary").fill("-5");
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(dialog.getByLabel("Salary")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Internal notes")).toHaveValue(notes);

    await dialog.getByLabel("Salary").fill("32000");
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(dialog).toBeHidden();
    const card = drawer.getByTestId("offer-card").filter({ hasText: notes });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Draft");
    // The job pays in INR, so the offer defaults to the job's currency (never a hardcoded one).
    await expect(card).toContainText(/₹\s?32,000|INR\s?32,000/);

    await page.goto("/employer/offers");
    await expect(page.getByTestId("offer-card").filter({ hasText: notes })).toBeVisible(NAV);
  });

  test("interviews list and week views", async ({ page }) => {
    await signIn(page, "/employer/interviews");
    await expect(page.getByRole("heading", { level: 1, name: "Interviews" })).toBeVisible();
    await page.getByRole("link", { name: "Week", exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByRole("link", { name: /next week/i })).toBeVisible();
  });

  test("offers and placements tabs", async ({ page }) => {
    await signIn(page, "/employer/offers");
    await expect(page.getByRole("heading", { level: 1, name: "Offers and placements" })).toBeVisible();
    await page.getByRole("link", { name: "Placements", exact: true }).click();
    await expect(page).toHaveURL(/tab=placements/);
  });

  test("reports render live figures and download CSV", async ({ page }) => {
    await signIn(page, "/employer/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Recruitment reports" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download", NAV);
    await page.getByRole("link", { name: "Export jobs CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^recruitment-jobs-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain("Job code");
    // Aggregate figures only: no candidate contact details in the export.
    expect(csv).not.toMatch(/@e2e\.venkatsai\.test/);

    const response = await page.request.get("/employer/reports/export?report=interviews");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("other organisations' and unknown records are not found", async ({ page }) => {
    await signIn(page, "/employer/pipeline");
    await expectNotFound(page, `/employer/candidates/${MISSING_ID}`);
    await expectNotFound(page, `/employer/lists/${MISSING_ID}`);
    await expectNotFound(page, `/employer/pipeline/${MISSING_ID}`);
    if (OTHER_JOB_ID) await expectNotFound(page, `/employer/pipeline/${OTHER_JOB_ID}`);
    if (JOB_ID) {
      // An application that is not shared with this organisation opens no drawer.
      await page.goto(`/employer/pipeline/${JOB_ID}?application=${MISSING_ID}`);
      await expect(page.getByText("That application is not available")).toBeVisible(NAV);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("talent pages render cleanly: one h1, no sideways scroll, no serious accessibility violations", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, "/employer/candidates");
    const pages: [string, string | RegExp][] = [
      ["/employer/candidates", "Find candidates"],
      ["/employer/lists", "Talent lists"],
      ["/employer/lists?tab=archived", "Talent lists"],
      ["/employer/pipeline", "Pipeline"],
      ["/employer/interviews", "Interviews"],
      ["/employer/interviews?view=week", "Interviews"],
      ["/employer/offers", "Offers and placements"],
      ["/employer/offers?tab=placements", "Offers and placements"],
      ["/employer/reports", "Recruitment reports"],
    ];
    if (DISCOVERABLE.length) {
      pages.push([`/employer/candidates/${DISCOVERABLE[0]}`, /.+/]);
      if (DISCOVERABLE.length > 1) pages.push([`/employer/candidates/compare?ids=${DISCOVERABLE.join(",")}`, /compar/i]);
    }
    if (JOB_ID) pages.push([`/employer/pipeline/${JOB_ID}`, /E2E Structural welder/]);
    for (const [path, h1] of pages) {
      await test.step(path, async () => {
        await expectHealthyPage(page, path, h1);
      });
    }
    if (JOB_ID && APPLICATION_ID) {
      await test.step("application drawer", async () => {
        await page.goto(`/employer/pipeline/${JOB_ID}?application=${APPLICATION_ID}`);
        await expect(page.getByRole("dialog")).toBeVisible(NAV);
        await expectNoA11yViolations(page);
      });
    }
  });
});

test("report export refuses anonymous requests", async ({ request }) => {
  const response = await request.get("/employer/reports/export?report=jobs", { maxRedirects: 0 });
  expect([401, 302, 303, 307, 308]).toContain(response.status());
});
