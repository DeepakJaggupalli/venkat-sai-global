import { expect, test, type Page } from "@playwright/test";

/**
 * Billing UI (ui:commercial): Command Centre revenue administration and portal billing.
 *
 * Needs seeded accounts (flows are skipped when the variables are missing):
 * - E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD: staff with the Finance Admin role (commercial.* + partners.settlements).
 * - E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD: owner of an employer organisation (billing view + manage).
 * The database starts with no plans: portals must show the honest "Talk to our team" state until a plan is priced.
 */

const FINANCE_EMAIL = process.env.E2E_FINANCE_EMAIL;
const FINANCE_PASSWORD = process.env.E2E_FINANCE_PASSWORD;
const EMPLOYER_EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const EMPLOYER_PASSWORD = process.env.E2E_EMPLOYER_PASSWORD;

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

test.describe("Command Centre revenue administration", () => {
  test.skip(!FINANCE_EMAIL || !FINANCE_PASSWORD, "E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, FINANCE_EMAIL!, FINANCE_PASSWORD!, "/admin/commercial");
  });

  test("overview shows per-currency sections and setup status", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Revenue & billing" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Revenue and billing sections" })).toBeVisible();
    await expect(page.getByText(/tax rate|Tax rates confirmed/i).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Outstanding invoices" })).toBeVisible();
  });

  test("every Command Centre link target resolves", async ({ page }) => {
    for (const path of ["plans", "plans/new", "subscriptions", "subscriptions/new", "invoices", "invoices/new", "payments", "payments/new", "refunds", "disputes", "coupons", "coupons/new", "tax-rates", "tax-rates/new", "seller", "settlements"]) {
      const response = await page.goto(`/admin/commercial/${path}`);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    for (const kind of ["invoices", "refunds", "subscriptions", "settlements", "disputes"]) {
      const response = await page.goto(`/admin/commercial/${kind}/00000000-0000-4000-8000-000000000000`);
      expect(response?.status(), kind).toBe(404);
    }
  });

  test("creates a plan, adds a price and a limit", async ({ page }) => {
    const key = `e2e_plan_${unique()}`;
    await page.goto("/admin/commercial/plans/new");
    await page.getByLabel("Name").fill("E2E Growth");
    await page.getByLabel("Key").fill(key);
    await chooseOption(page, "Audience", "Employers");
    await page.getByLabel("Active").check();
    await page.getByRole("button", { name: "Create plan" }).click();
    await page.waitForURL(/\/admin\/commercial\/plans\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Growth" })).toBeVisible();

    const prices = page.getByRole("form", { name: "Add a price" });
    await prices.getByLabel("Currency").click();
    await page.getByRole("option", { name: /INR/ }).first().click();
    await chooseOption(page, "Interval", "Monthly");
    await prices.getByLabel("Price").fill("4999");
    await prices.getByRole("button", { name: "Add price" }).click();
    await expect(page.getByRole("table", { name: "Prices" }).getByText("Monthly")).toBeVisible();

    const limits = page.getByRole("form", { name: "Set a limit" });
    await limits.getByLabel("Feature").click();
    await page.getByRole("option", { name: "Job posts" }).click();
    await limits.getByLabel("Limit").fill("5");
    await limits.getByRole("button", { name: "Save limit" }).click();
    await expect(page.getByRole("table", { name: "Feature limits" }).getByText("Job posts")).toBeVisible();
  });

  test("manual invoice shows a live tax preview and validates lines", async ({ page }) => {
    await page.goto("/admin/commercial/invoices/new");
    await page.getByRole("button", { name: /save as draft/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText("Choose the buyer and currency to see the tax.")).toBeVisible();
    await page.getByLabel("Description").first().fill("Weld procedure qualification support");
    await page.getByLabel("Unit price").first().fill("1.005");
    await expect(page.getByText(/decimal places|Choose a currency/).first()).toBeVisible();
  });

  test("tax rates show the unconfirmed badge for seeded defaults", async ({ page }) => {
    await page.goto("/admin/commercial/tax-rates");
    const unconfirmed = page.getByText("Unconfirmed – check with your tax adviser");
    if ((await unconfirmed.count()) > 0) {
      await expect(page.getByRole("button", { name: /^Confirm / }).first()).toBeVisible();
    } else {
      await expect(page.getByText(/Confirmed|No tax rates/).first()).toBeVisible();
    }
  });

  test("seller details explain the GSTIN rule", async ({ page }) => {
    await page.goto("/admin/commercial/seller");
    await expect(page.getByRole("heading", { level: 1, name: "Seller details" })).toBeVisible();
    await expect(page.getByText(/GST-registered|GST registered/).first()).toBeVisible();
    await expect(page.getByLabel("Payment instructions")).toBeVisible();
  });
});

test.describe("employer billing", () => {
  test.skip(!EMPLOYER_EMAIL || !EMPLOYER_PASSWORD, "E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!, "/employer/billing");
  });

  test("shows plan, usage and plans or an honest talk-to-us state", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Usage" })).toBeVisible();
    const talk = page.getByRole("link", { name: "Talk to our team" });
    const choose = page.getByRole("button", { name: /^(Choose|Switch to) / });
    expect((await talk.count()) + (await choose.count())).toBeGreaterThan(0);
  });

  test("plan purchase shows the tax-inclusive quote before creating an invoice", async ({ page }) => {
    const choose = page.getByRole("button", { name: /^(Choose|Switch to) / }).first();
    test.skip((await choose.count()) === 0 || !(await choose.isEnabled()), "No purchasable public plan in the seeded data");
    await choose.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Total")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Request invoice|Continue to invoice/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("tabs reach invoices, payments and billing details", async ({ page }) => {
    const tabs = page.getByRole("navigation", { name: "Billing sections" });
    await tabs.getByRole("link", { name: "Invoices" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Invoices" })).toBeVisible();
    await page.goto("/employer/billing/invoices?status=open");
    await expect(page.getByRole("heading", { level: 1, name: "Invoices" })).toBeVisible();
    await tabs.getByRole("link", { name: "Payments" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
    await tabs.getByRole("link", { name: "Billing details" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Billing details" })).toBeVisible();
  });

  test("billing details validate the GSTIN against the state code", async ({ page }) => {
    await page.goto("/employer/billing/details");
    const form = page.getByRole("form", { name: "Billing details" });
    await form.getByLabel("Legal name").fill("E2E Fabrication Private Limited");
    await form.getByLabel("Billing email").fill(`billing-${unique()}@example.com`);
    await form.getByLabel("Address").first().fill("Plot 12, Auto Nagar");
    await form.getByLabel("City").fill("Visakhapatnam");
    await form.getByLabel("Country").click();
    await page.getByRole("option", { name: /India/ }).first().click();
    await form.getByLabel("GST state code").click();
    await page.getByRole("option", { name: /^37 / }).click();
    await form.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
    await form.getByLabel("Billing currency").click();
    await page.getByRole("option", { name: /INR/ }).first().click();
    await form.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.getByText("The GSTIN does not match the state code")).toBeVisible();
  });
});
