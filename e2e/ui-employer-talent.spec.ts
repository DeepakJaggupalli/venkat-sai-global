import { expect, test, type Page } from "@playwright/test";

/**
 * Employer talent screens (ui:employer-talent): candidate search and profile, talent lists, pipeline
 * (overview, per-job board, application drawer deep link), interviews, offers and placements, reports.
 *
 * Needs a seeded employer owner (flows are skipped when the variables are missing):
 * - E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD: owner of an employer organisation.
 * Optional, for deeper flows on seeded data:
 * - E2E_EMPLOYER_JOB_ID: a published job of that organisation with at least one shared application.
 * - E2E_EMPLOYER_APPLICATION_ID: a shared application on that job (drawer deep link).
 */

const EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const PASSWORD = process.env.E2E_EMPLOYER_PASSWORD;
const JOB_ID = process.env.E2E_EMPLOYER_JOB_ID;
const APPLICATION_ID = process.env.E2E_EMPLOYER_APPLICATION_ID;

async function signIn(page: Page, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(EMAIL!);
  await page.getByLabel(/password/i).first().fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

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

  test("compare selection is capped and opens the comparison", async ({ page }) => {
    await signIn(page, "/employer/candidates");
    const toggles = page.getByTestId("compare-toggle");
    test.skip((await toggles.count()) < 2, "needs at least two discoverable candidates");
    await toggles.nth(0).check();
    await toggles.nth(1).check();
    await expect(page.getByRole("region", { name: "Selected candidates" })).toContainText("2 of 4 selected");
    await page.getByRole("link", { name: "Compare" }).click();
    await expect(page).toHaveURL(/\/employer\/candidates\/compare\?ids=/);
    await expect(page.getByRole("table", { name: /candidate comparison/i })).toBeVisible();
  });

  test("candidate profile keeps contact masked until unlock", async ({ page }) => {
    await signIn(page, "/employer/candidates");
    const card = page.getByTestId("candidate-card").first();
    test.skip((await card.count()) === 0, "no discoverable candidates in the seed");
    await card.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/employer\/candidates\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Venkat Sai assessments" })).toBeVisible();
    await expect(page.getByText(/not accredited certifications/i)).toBeVisible();
    const unlock = page.getByTestId("unlock-contact");
    if (await unlock.isVisible()) {
      await unlock.click();
      await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toContainText(/credit/i);
      await page.getByRole("button", { name: /cancel/i }).click();
    }
  });

  test("talent list lifecycle: create, open, archive", async ({ page }) => {
    await signIn(page, "/employer/lists");
    await expect(page.getByRole("heading", { level: 1, name: "Talent lists" })).toBeVisible();
    await page.getByRole("button", { name: "New list" }).click();
    const name = `E2E list ${unique()}`;
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create list" }).click();
    await expect(page).toHaveURL(/\/employer\/lists\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("This list is empty")).toBeVisible();
    await page.getByRole("button", { name: "Archive list" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  });

  test("pipeline overview and the jobs redirect", async ({ page }) => {
    await signIn(page, "/employer/pipeline");
    await expect(page.getByRole("heading", { level: 1, name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("table", { name: /candidates per job/i }).or(page.getByText("No published jobs yet"))).toBeVisible();
    test.skip(!JOB_ID, "E2E_EMPLOYER_JOB_ID not set");
    await page.goto(`/employer/jobs/${JOB_ID}/pipeline`);
    await expect(page).toHaveURL(new RegExp(`/employer/pipeline/${JOB_ID}$`));
  });

  test("application deep link opens the drawer and closing removes it", async ({ page }) => {
    test.skip(!JOB_ID || !APPLICATION_ID, "E2E_EMPLOYER_JOB_ID / E2E_EMPLOYER_APPLICATION_ID not set");
    await signIn(page, `/employer/pipeline/${JOB_ID}?application=${APPLICATION_ID}`);
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("tab", { name: /overview/i })).toBeVisible();
    await drawer.getByRole("tab", { name: /activity/i }).click();
    await expect(drawer.getByText(/candidate saw/i).first()).toBeVisible();
    await drawer.getByRole("tab", { name: /notes/i }).click();
    await drawer.getByLabel("Add a note").fill(`E2E internal note ${unique()}`);
    await drawer.getByRole("button", { name: "Add note" }).click();
    await expect(drawer.getByText(/e2e internal note/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`/employer/pipeline/${JOB_ID}$`));
  });

  test("board cards offer an accessible Move to menu", async ({ page }) => {
    test.skip(!JOB_ID, "E2E_EMPLOYER_JOB_ID not set");
    await signIn(page, `/employer/pipeline/${JOB_ID}`);
    const card = page.getByTestId("pipeline-card").first();
    test.skip((await card.count()) === 0, "no applications on the seeded job");
    await expect(page.getByRole("button", { name: /move/i }).first()).toBeVisible();
  });

  test("interviews list and week views", async ({ page }) => {
    await signIn(page, "/employer/interviews");
    await expect(page.getByRole("heading", { level: 1, name: "Interviews" })).toBeVisible();
    await page.getByRole("link", { name: "Week" }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByRole("link", { name: /next week/i })).toBeVisible();
  });

  test("offers and placements tabs", async ({ page }) => {
    await signIn(page, "/employer/offers");
    await expect(page.getByRole("heading", { level: 1, name: "Offers and placements" })).toBeVisible();
    await page.getByRole("link", { name: "Placements" }).click();
    await expect(page).toHaveURL(/tab=placements/);
  });

  test("reports render live figures and export CSV", async ({ page }) => {
    await signIn(page, "/employer/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Recruitment reports" })).toBeVisible();
    const response = await page.request.get("/employer/reports/export?report=jobs");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toContain("Job code");
  });
});

test("report export refuses anonymous requests", async ({ request }) => {
  const response = await request.get("/employer/reports/export?report=jobs", { maxRedirects: 0 });
  expect([401, 302, 303, 307, 308]).toContain(response.status());
});
