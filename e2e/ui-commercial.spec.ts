import { expect as baseExpect, test, type Page } from "@playwright/test";

import { chooseOption, expectHealthyPage, expectVisibleKeyboardFocus, signInAs, unique, watchServerErrors } from "./admin-ops-helpers";
import { hasCredentials, missingCredentials } from "./support";

/**
 * Billing UI (qa:admin-ops-commercial): Command Centre revenue administration and portal billing.
 *
 * Accounts and ids come from the E2E seed (`npm run db:seed:e2e`, env file E:/VenkatSaiGlobal-work/e2e/e2e.env):
 * FINANCE (Finance role), ADMIN (Super Admin: the refund approval needs approvals.decide), EMPLOYER (owner of
 * E2E Employer Co), PARTNER, the public plans e2e_employer_inr (INR 4,999 / month) and e2e_employer_usd
 * (USD 79 / month), and one pending employer per project (E2E_ADMINOPS_PENDING_ORG_<PROJECT>_ID) used as the
 * buyer of the manual invoices, so the shared E2E Employer Co never gets test invoices.
 */

// The dev server compiles routes and Server Actions on first use; give assertions room for that.
const expect = baseExpect.configure({ timeout: 30_000 });

const ZERO_UUID = "00000000-0000-4000-8000-000000000000";

/** GST financial year label used in document numbers (April to March), e.g. "2627" for 2026-27. */
function financialYearLabel(date = new Date()): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

async function toastText(page: Page, pattern: RegExp): Promise<string> {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: pattern }).first();
  await expect(toast).toBeVisible();
  return (await toast.textContent()) ?? "";
}

test.describe("Command Centre revenue administration", () => {
  test.skip(!hasCredentials("finance"), missingCredentials("finance"));

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "finance", "/admin/commercial");
  });

  test("overview shows per-currency sections and setup status", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Revenue & billing" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Revenue and billing sections" })).toBeVisible();
    await expect(page.getByText(/tax rate|Tax rates confirmed/i).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Outstanding invoices" })).toBeVisible();
  });

  test("every Command Centre page renders cleanly and unknown ids are not found", async ({ page }) => {
    test.setTimeout(300_000);
    const serverErrors = watchServerErrors(page);
    for (const path of ["", "plans", "plans/new", "subscriptions", "subscriptions/new", "invoices", "invoices/new", "payments", "payments/new", "refunds", "disputes", "coupons", "coupons/new", "tax-rates", "tax-rates/new", "seller", "settlements"]) {
      await expectHealthyPage(page, `/admin/commercial${path ? `/${path}` : ""}`);
    }
    for (const kind of ["invoices", "refunds", "subscriptions", "settlements", "disputes", "plans", "coupons", "tax-rates"]) {
      const response = await page.goto(`/admin/commercial/${kind}/${ZERO_UUID}`);
      expect(response?.status(), kind).toBe(404);
    }
    expect(serverErrors()).toEqual([]);
  });

  test("keyboard focus is visible on the revenue pages", async ({ page }) => {
    for (const path of ["/admin/commercial/invoices", "/admin/commercial/plans/new", "/admin/commercial/seller"]) {
      await page.goto(path);
      await expectVisibleKeyboardFocus(page);
    }
  });

  test("creates a plan, adds a price and a limit", async ({ page }) => {
    const key = `e2e_plan_${unique()}`;
    await page.goto("/admin/commercial/plans/new");
    const form = page.getByRole("form", { name: "New plan" });
    // Required fields first: the errors keep what was typed.
    await form.getByRole("textbox", { name: "Name", exact: true }).fill("E2E Growth");
    await form.getByRole("button", { name: "Create plan" }).click();
    await expect(form.getByRole("textbox", { name: "Key", exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("E2E Growth");
    await form.getByRole("textbox", { name: "Key", exact: true }).fill(key);
    await chooseOption(page, "Audience", "Employers", form);
    await form.getByLabel("Active").check();
    await form.getByRole("button", { name: "Create plan" }).click();
    await page.waitForURL(/\/admin\/commercial\/plans\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Growth" })).toBeVisible();

    const prices = page.getByRole("form", { name: "Add a price" });
    await chooseOption(page, "Currency", /AED/, prices);
    await chooseOption(page, "Interval", "Monthly", prices);
    await prices.getByRole("textbox", { name: "Price", exact: true }).fill("375.50");
    await prices.getByRole("button", { name: "Add price" }).click();
    const priceTable = page.getByRole("table", { name: "Prices" });
    await expect(priceTable.getByText("Monthly")).toBeVisible();
    // The plan's currency is the price's own, never assumed to be INR.
    await expect(priceTable).toContainText("375.50");
    await expect(priceTable).toContainText(/AED/);
    await expect(priceTable).not.toContainText("₹");

    const limits = page.getByRole("form", { name: "Set a limit" });
    await chooseOption(page, "Feature", "Job posts", limits);
    await limits.getByRole("spinbutton", { name: "Limit", exact: true }).fill("5");
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

  test("tax rate: create one, then confirm it", async ({ page }) => {
    const name = `E2E VAT ${unique()}`;
    await page.goto("/admin/commercial/tax-rates/new");
    const form = page.getByRole("form", { name: "New tax rate" });
    await form.getByLabel("Name").fill(name);
    await chooseOption(page, "Kind", "VAT", form);
    await chooseOption(page, "Country", /Iceland/, form);
    await form.getByLabel("Rate (%)").fill("11");
    // A window in the past, so this test rate never applies to a real invoice.
    await form.getByLabel("Effective from").fill("2001-01-01");
    await form.getByLabel("Effective until").fill("2001-12-31");
    await form.getByRole("button", { name: "Create rate" }).click();
    await page.waitForURL(/\/admin\/commercial\/tax-rates$/);
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row.getByText("Unconfirmed – check with your tax adviser")).toBeVisible();
    await row.getByRole("button", { name: new RegExp(`^Confirm ${name}`) }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm rate" }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) }).getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("seller details explain the GSTIN rule, validate it and save", async ({ page }) => {
    await page.goto("/admin/commercial/seller");
    await expect(page.getByRole("heading", { level: 1, name: "Seller details" })).toBeVisible();
    await expect(page.getByText(/GST-registered|GST registered/).first()).toBeVisible();
    await expect(page.getByLabel("Payment instructions")).toBeVisible();
    const form = page.getByRole("form", { name: "Seller details" });
    const gstin = form.getByLabel("GSTIN");
    const original = await gstin.inputValue();
    await gstin.fill("NOT-A-GSTIN");
    await form.getByRole("button", { name: /^Save/ }).click();
    await expect(gstin).toHaveAttribute("aria-invalid", "true");
    await expect(gstin).toHaveValue("NOT-A-GSTIN");
    // Put the seeded value back and save: the same settings other specs rely on.
    await gstin.fill(original);
    await form.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
    await expect(gstin).not.toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("Invoice to credit note (GST numbering)", () => {
  test.skip(!hasCredentials("admin"), missingCredentials("admin"));

  test("draft -> issue (VSG/<FY>/n) -> offline payment -> refund approved -> credit note (VSGC/<FY>/n)", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const buyerId = process.env[`E2E_ADMINOPS_PENDING_ORG_${testInfo.project.name.toUpperCase()}_ID`];
    test.skip(!buyerId, "Buyer organisation for this project not seeded (npm run db:seed:e2e)");
    const buyerName = `E2E Pending Employer (${testInfo.project.name}, test)`;
    const fy = financialYearLabel();
    const serverErrors = watchServerErrors(page);
    await signInAs(page, "admin", "/admin/commercial/invoices/new");

    // 1. Draft: buyer, currency, one line; the live preview shows the total before saving.
    const editor = page.getByRole("form", { name: "New invoice" });
    await chooseOption(page, "Buyer", buyerName, editor);
    await chooseOption(page, "Currency", /INR/, editor);
    await editor.getByLabel("Description").first().fill(`Weld procedure qualification support (E2E ${unique()})`);
    await editor.getByLabel("Unit price").first().fill("10000");
    await expect(page.getByRole("region", { name: "Tax preview" })).toContainText("Total");
    await editor.getByRole("button", { name: "Save as draft" }).click();
    await page.waitForURL(/\/admin\/commercial\/invoices\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Draft invoice" })).toBeVisible();
    const invoiceUrl = page.url();

    // The buyer needs billing details before an invoice can be issued (first run per seed).
    const billing = page.getByRole("form", { name: "Billing details" });
    if ((await billing.getByLabel("Legal name").inputValue()) === "") {
      await billing.getByLabel("Legal name").fill(`${buyerName} Pvt Ltd`);
      await billing.getByLabel("Billing email").fill(`billing-${unique()}@example.test`);
      await billing.getByLabel("Address").first().fill("Plot 7, Auto Nagar");
      await billing.getByLabel("City").fill("Visakhapatnam");
      await chooseOption(page, "Country", /India/, billing);
      await chooseOption(page, "GST state code", /^37 /, billing);
      await chooseOption(page, "Billing currency", /INR/, billing);
      await billing.getByRole("button", { name: "Save billing details" }).click();
      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /saved/i }).first()).toBeVisible();
    }

    // 2. Issue: the GST invoice number is assigned only now.
    await page.getByRole("button", { name: "Issue invoice" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Issue invoice" }).click();
    const invoiceHeading = page.getByRole("heading", { level: 1, name: new RegExp(`^Invoice VSG/${fy}/\\d{6}$`) });
    await expect(invoiceHeading).toBeVisible();
    const invoiceNumber = ((await invoiceHeading.textContent()) ?? "").replace("Invoice ", "").trim();
    expect(invoiceNumber.length).toBeLessThanOrEqual(16);

    // 3. Record the bank transfer for the full balance.
    const payment = page.getByRole("form", { name: "Record a payment" });
    await payment.getByLabel("UTR number").fill(`E2EUTR${unique().toUpperCase()}`);
    await payment.getByRole("button", { name: "Record payment" }).click();
    const refundButton = page.getByRole("button", { name: /^Request a refund of / }).first();
    await expect(refundButton).toBeVisible();

    // 4. Refund request -> approval centre -> completed with the payout reference.
    await refundButton.click();
    const refundDialog = page.getByRole("alertdialog");
    await refundDialog.getByLabel("Reason").fill("E2E: the buyer cancelled the qualification support.");
    await refundDialog.getByRole("button", { name: "Send for approval" }).click();
    const refundCode = (await toastText(page, /sent for approval/)).match(/Refund (\S+) sent for approval/)?.[1];
    expect(refundCode).toBeTruthy();
    await page.goto("/admin/commercial/refunds");
    await page.getByRole("link", { name: `Open refund ${refundCode}` }).first().click();
    await page.waitForURL(/\/admin\/commercial\/refunds\/[0-9a-f-]{36}$/);
    const refundUrl = page.url();
    await page.getByRole("link", { name: "Open approval" }).click();
    const decision = page.getByTestId("approval-decision-form");
    await chooseOption(page, "Decision", "Approve", decision);
    await decision.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByTestId("approval-decision-form")).toHaveCount(0);
    await page.goto(refundUrl);
    const complete = page.getByRole("form", { name: "Complete refund" });
    await complete.getByLabel("Payout reference").fill(`E2EPAYOUT${unique().toUpperCase()}`);
    await complete.getByRole("button", { name: "Mark refund completed" }).click();
    await page.getByRole("link", { name: "Open credit note" }).click();

    // 5. The credit note has its own series and points back to the invoice.
    const noteHeading = page.getByRole("heading", { level: 1, name: new RegExp(`^Credit note VSGC/${fy}/\\d{6}$`) });
    await expect(noteHeading).toBeVisible();
    expect(((await noteHeading.textContent()) ?? "").replace("Credit note ", "").trim().length).toBeLessThanOrEqual(16);
    await expect(page.getByRole("link", { name: invoiceNumber })).toBeVisible();
    await page.goto(invoiceUrl);
    await expect(page.getByRole("table", { name: "Credit notes" })).toContainText(`VSGC/${fy}/`);
    expect(serverErrors()).toEqual([]);
  });
});

test.describe("employer billing", () => {
  test.skip(!hasCredentials("employer"), missingCredentials("employer"));

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "employer", "/employer/billing");
  });

  test("billing pages render cleanly", async ({ page }) => {
    for (const [path, h1] of [
      ["/employer/billing", "Billing"],
      ["/employer/billing/invoices", "Invoices"],
      ["/employer/billing/payments", "Payments"],
      ["/employer/billing/details", "Billing details"],
    ] as const) {
      await expectHealthyPage(page, path, h1);
    }
  });

  test("shows plan, usage and plans or an honest talk-to-us state", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Usage" })).toBeVisible();
    const talk = page.getByRole("link", { name: "Talk to our team" });
    const choose = page.getByRole("button", { name: /^(Choose|Switch to) / });
    expect((await talk.count()) + (await choose.count())).toBeGreaterThan(0);
  });

  test("plan purchase quotes in the plan's own currency (INR and USD) before creating an invoice", async ({ page }) => {
    const plans = page.getByRole("region", { name: /^(Plans|Change plan)$/ });
    const currencySelect = plans.getByLabel("Show prices in");
    test.skip((await currencySelect.count()) === 0, "The seeded INR and USD plans are not both offered");

    for (const [currency, planName, notSymbol] of [
      ["INR", "E2E Employer Plan (INR, test)", "$"],
      ["USD", "E2E Employer Plan (USD, test)", "₹"],
    ] as const) {
      await currencySelect.click();
      await page.getByRole("option", { name: currency, exact: true }).click();
      const choose = plans.getByRole("button", { name: new RegExp(`^(Choose|Switch to) ${planName.replace(/[()]/g, "\\$&")}`) });
      test.skip(!(await choose.isEnabled()), "Plan changes are blocked (pending invoice or self-serve off)");
      await choose.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Total", { exact: true })).toBeVisible();
      const total = dialog.locator("dt", { hasText: /^Total$/ }).locator("xpath=following-sibling::dd[1]");
      await expect(total).toContainText(currency === "INR" ? "₹" : /\$|USD/);
      await expect(total).not.toContainText(notSymbol);
      await expect(dialog.getByRole("button", { name: /Request invoice|Continue to invoice/ })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    }
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

  test("billing details validate the GSTIN against the state code and keep the input", async ({ page }) => {
    await page.goto("/employer/billing/details");
    const form = page.getByRole("form", { name: "Billing details" });
    await form.getByLabel("Legal name").fill("E2E Fabrication Private Limited");
    await form.getByLabel("Billing email").fill(`billing-${unique()}@example.com`);
    await form.getByLabel("Address").first().fill("Plot 12, Auto Nagar");
    await form.getByLabel("City").fill("Visakhapatnam");
    await chooseOption(page, "Country", /India/, form);
    await chooseOption(page, "GST state code", /^37 /, form);
    await form.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
    await chooseOption(page, "Billing currency", /INR/, form);
    await form.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.getByText("The GSTIN does not match the state code", { exact: true })).toBeVisible();
    await expect(form.getByLabel("GSTIN")).toHaveValue("29ABCDE1234F1Z5");
    await expect(form.getByLabel("City")).toHaveValue("Visakhapatnam");
  });

  test("another organisation's invoice is not found", async ({ page }) => {
    const response = await page.goto(`/billing/invoices/${ZERO_UUID}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("recruitment partner billing", () => {
  test.skip(!hasCredentials("partner"), missingCredentials("partner"));

  test("partner billing pages render cleanly", async ({ page }) => {
    await signInAs(page, "partner", "/recruiter/billing");
    for (const path of ["/recruiter/billing", "/recruiter/billing/invoices", "/recruiter/billing/payments", "/recruiter/billing/details"]) {
      await expectHealthyPage(page, path);
    }
  });
});
