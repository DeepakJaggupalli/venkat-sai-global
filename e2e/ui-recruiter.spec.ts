import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./support";

import {
  account,
  dismissConsentBanner,
  expectForbidden,
  expectHealthyPage,
  expectInternalLinksResolve,
  expectNotFound,
  focusIsVisible,
  mainNavigation,
  openDialog,
  missing,
  signInAs,
  unique,
  uploadPdf,
  watchServerErrors,
} from "./partner-institution-helpers";

/**
 * Recruitment Partner Portal (ui:recruiter): onboarding, dashboard, agency profile, licences and verification,
 * requirements and the submit-candidate flow, submissions, my candidates, interviews, documents,
 * performance, settlements (partner invoice), announcements and team; permission and organisation boundaries.
 *
 * Needs the accounts and ids written by `npm run db:seed:e2e` (flows are skipped when they are missing):
 * - E2E_PARTNER_*: owner of the verified "E2E Recruitment Partner" (E2E_PARTNER_VERIFIED=1, active assignment).
 * - E2E_PARTNER_FINANCE_*: member with a custom role holding only partner.dashboard + partner.settlements.view.
 * - E2E_PARTNER_RECRUITER_*: member with the template Recruiter role (no settlements, no team).
 * - E2E_NEW_PARTNER_*: verified user without an organisation (onboarding; single use per seed run).
 * - E2E_PARTNER_SETTLEMENT_ID (AED, pending approval), E2E_PARTNER_ASSIGNMENT_ID, and the other partner's
 *   E2E_OTHER_PARTNER_SUBMISSION_ID / E2E_OTHER_PARTNER_SETTLEMENT_ID (must 404).
 */

const OWNER = account("PARTNER");
const FINANCE = account("PARTNER_FINANCE");
const RECRUITER = account("PARTNER_RECRUITER");
const NEW_PARTNER = account("NEW_PARTNER");
const VERIFIED = process.env.E2E_PARTNER_VERIFIED === "1";
const ASSIGNMENT = process.env.E2E_PARTNER_ASSIGNMENT_ID;
const SETTLEMENT = process.env.E2E_PARTNER_SETTLEMENT_ID;
const OTHER_SUBMISSION = process.env.E2E_OTHER_PARTNER_SUBMISSION_ID;
const OTHER_SETTLEMENT = process.env.E2E_OTHER_PARTNER_SETTLEMENT_ID;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

test.describe("partner onboarding", () => {
  test.skip(!NEW_PARTNER, missing("NEW_PARTNER"));

  test("registers an agency, lands on the profile checklist and uploads a licence", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The fresh account is single use per seed run; the chromium run consumes it.");
    const serverErrors = watchServerErrors(page);
    await signInAs(page, NEW_PARTNER!, "/recruiter/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /become a venkat sai recruitment partner/i })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });

    // Required fields: errors are shown and what was typed is kept.
    const agency = `E2E Manpower ${unique()}`;
    await page.getByLabel("Agency name").fill(agency);
    await page.getByRole("button", { name: /create partner workspace/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    // The error summary takes focus (wait for it, or it closes the next popover) and speaks plain English.
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
    await expect(page.getByText(/invalid input|expected string/i)).toHaveCount(0);
    await expect(page.getByLabel("Agency name")).toHaveValue(agency);

    await page.getByLabel(/country of registration/i).click();
    await page.getByRole("option", { name: /india/i }).first().click();
    await page.getByLabel("City").fill("Visakhapatnam");
    await page.getByLabel(/official email/i).fill(`partner-${unique()}@example.com`);
    await page.getByLabel("Business type").click();
    await page.getByRole("option", { name: /recruitment agency/i }).click();
    await page.getByLabel("Your designation").fill("Proprietor");
    await page.getByLabel(/authorised to register this agency/i).check();
    await page.getByLabel(/never charge a candidate/i).check();
    await page.getByRole("button", { name: /create partner workspace/i }).click();

    await page.waitForURL(/\/recruiter\/profile\?welcome=1/);
    await expect(page.getByText(/your partner workspace is ready/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Licences" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Partner agreement" })).toBeVisible();

    // Licence with its scan: goes to Venkat Sai for verification.
    const number = `E2E-RC-${unique().toUpperCase()}`;
    const dialog = await openDialog(page.getByRole("button", { name: /add licence/i }), page.getByRole("dialog", { name: "Add a licence" }));
    await dialog.getByLabel(/registration certificate number/i).fill(number);
    await dialog.getByLabel("Valid until").fill("2030-12-31");
    await uploadPdf(dialog, "Licence scan", "rc-certificate.pdf");
    await dialog.getByRole("button", { name: /^add licence$/i }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByTestId("partner-licence").filter({ hasText: number });
    await expect(row).toBeVisible();
    await expect(row.getByText(/pending|awaiting|being checked/i).first()).toBeVisible();
    await expect(row.getByText("rc-certificate.pdf")).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });
});

test.describe("partner workspace (owner)", () => {
  test.skip(!OWNER, missing("PARTNER"));

  test.beforeEach(async ({ page }) => {
    await signInAs(page, OWNER!, "/recruiter");
  });

  test("dashboard shows live sections and no placeholder numbers", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    await expect(page.getByText(/open requirements/i).first()).toBeVisible();
    await expect(page.getByText(/lorem ipsum/i)).toHaveCount(0);
  });

  const pages: [string, RegExp][] = [
    ["/recruiter", /welcome/i],
    ["/recruiter/requirements", /assigned requirements/i],
    ["/recruiter/submissions", /^submissions$/i],
    ["/recruiter/candidates", /my candidates/i],
    ["/recruiter/interviews", /interviews/i],
    ["/recruiter/documents", /documents/i],
    ["/recruiter/performance", /performance/i],
    ["/recruiter/settlements", /settlements/i],
    ["/recruiter/profile", /agency profile/i],
    ["/recruiter/profile/verification", /agency verification/i],
    ["/recruiter/announcements", /announcements/i],
    ["/recruiter/team", /team/i],
    ["/recruiter/messages", /messages/i],
    ["/recruiter/support", /support/i],
    ["/recruiter/billing", /billing|plan/i],
  ];
  for (const [path, heading] of pages) {
    test(`renders ${path} accessibly`, async ({ page }) => {
      const serverErrors = watchServerErrors(page);
      await expectHealthyPage(page, path, heading);
      expect(serverErrors()).toEqual([]);
    });
  }

  test("detail pages render accessibly", async ({ page }) => {
    test.skip(!ASSIGNMENT || !SETTLEMENT, "E2E_PARTNER_ASSIGNMENT_ID / E2E_PARTNER_SETTLEMENT_ID not set");
    await expectHealthyPage(page, `/recruiter/requirements/${ASSIGNMENT}`);
    await expectHealthyPage(page, `/recruiter/requirements/${ASSIGNMENT}/submit`, /submit a candidate/i);
    await expectHealthyPage(page, `/recruiter/settlements/${SETTLEMENT}`);
    if (process.env.E2E_PARTNER_SUBMISSION_ID) await expectHealthyPage(page, `/recruiter/submissions/${process.env.E2E_PARTNER_SUBMISSION_ID}`);
  });

  test("pages fit a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/recruiter", "/recruiter/requirements", "/recruiter/submissions", "/recruiter/profile", "/recruiter/team"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test("unknown or foreign records return 404", async ({ page }) => {
    await expectNotFound(page, `/recruiter/requirements/${UNKNOWN}`);
    await expectNotFound(page, `/recruiter/requirements/${UNKNOWN}/submit`);
    await expectNotFound(page, "/recruiter/submissions/not-a-uuid");
    await expectNotFound(page, `/recruiter/submissions/${UNKNOWN}`);
    await expectNotFound(page, `/recruiter/settlements/${UNKNOWN}`);
    await expectNotFound(page, `/recruiter/documents/${UNKNOWN}`);
    if (OTHER_SUBMISSION) await expectNotFound(page, `/recruiter/submissions/${OTHER_SUBMISSION}`);
    if (OTHER_SETTLEMENT) await expectNotFound(page, `/recruiter/settlements/${OTHER_SETTLEMENT}`);
  });

  test("keyboard focus is visible on the skip link and navigation", async ({ page }) => {
    // Fresh load: answering the cookie banner leaves focus at the end of the page.
    await page.goto("/recruiter/requirements");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to main content/i })).toBeFocused();
    expect(await focusIsVisible(page)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await focusIsVisible(page)).toBe(true);
  });

  test("links inside the portal resolve", async ({ page }) => {
    test.setTimeout(300_000);
    for (const path of ["/recruiter", "/recruiter/profile", "/recruiter/requirements", "/recruiter/submissions", "/recruiter/settlements", "/recruiter/documents"]) {
      await expectInternalLinksResolve(page, path, "/recruiter");
    }
  });

  test("licence dialog is accessible", async ({ page }) => {
    await page.goto("/recruiter/profile#licences");
    await openDialog(page.getByRole("button", { name: /add licence/i }), page.getByRole("dialog", { name: "Add a licence" }));
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expectNoA11yViolations(page, { exclude: ["nextjs-portal"] });
  });

  test("licence form validates required fields and keeps input", async ({ page }) => {
    await page.goto("/recruiter/profile#licences");
    const dialog = await openDialog(page.getByRole("button", { name: /add licence/i }), page.getByRole("dialog", { name: "Add a licence" }));
    await dialog.getByLabel("Issuing authority").fill("Protector General of Emigrants");
    await dialog.getByRole("button", { name: /^add licence$/i }).click();
    await expect(dialog.getByRole("alert").first()).toBeVisible();
    await expect(dialog.getByText(/invalid input|expected string|invalid identifier/i)).toHaveCount(0);
    await expect(dialog.getByText(/licence number|certificate number/i).first()).toBeVisible();
    await expect(dialog.getByLabel("Issuing authority")).toHaveValue("Protector General of Emigrants");
  });

  test("adds a licence with its scan, then removes it", async ({ page }) => {
    const serverErrors = watchServerErrors(page);
    await page.goto("/recruiter/profile#licences");
    const number = `E2E-TL-${unique().toUpperCase()}`;
    const dialog = await openDialog(page.getByRole("button", { name: /add licence/i }), page.getByRole("dialog", { name: "Add a licence" }));
    await dialog.getByLabel("Licence type").click();
    await page.getByRole("option", { name: "Trade licence" }).click();
    await dialog.getByLabel("Licence number").fill(number);
    await dialog.getByLabel("Issuing country").click();
    await page.getByRole("option", { name: /^india$/i }).first().click();
    await uploadPdf(dialog, "Licence scan", "trade-licence.pdf");
    await dialog.getByRole("button", { name: /^add licence$/i }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("partner-licence").filter({ hasText: number });
    await expect(row).toBeVisible();
    await expect(row.getByText("trade-licence.pdf")).toBeVisible();
    // Clean up: pending licences can be removed (verified ones cannot).
    await row.getByRole("button", { name: new RegExp(`remove .*${number}`, "i") }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove licence" }).click();
    await expect(page.getByTestId("partner-licence").filter({ hasText: number })).toHaveCount(0);
    expect(serverErrors()).toEqual([]);
  });

  test.describe("verified partner", () => {
    test.skip(!VERIFIED, "E2E_PARTNER_VERIFIED not set");

    test("submits a new candidate with consent and sees the submission", async ({ page }) => {
      const serverErrors = watchServerErrors(page);
      await page.goto("/recruiter/requirements?status=active");
      await page.getByRole("link", { name: /^open /i }).first().click();
      await page.getByRole("link", { name: /submit a candidate/i }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: /submit a candidate/i })).toBeVisible();

      const form = page.getByTestId("submit-candidate-form");
      await form.getByLabel(/a new person/i).check();
      // Consent is mandatory: the form refuses and keeps what was typed.
      const name = `E2E Candidate ${unique()}`;
      await form.getByLabel("Full name").fill(name);
      await form.getByLabel(/^email/i).fill(`candidate-${unique()}@example.com`);
      await form.getByRole("button", { name: /submit candidate/i }).click();
      await expect(form.getByText(/not submitted/i)).toBeVisible();
      await expect(form.getByLabel("Full name")).toHaveValue(name);

      await form.getByLabel(/how the candidate agreed/i).click();
      await page.getByRole("option", { name: /written/i }).click();
      await uploadPdf(form, "Evidence of consent (optional)", "consent-form.pdf");
      await form.getByLabel(/i confirm/i).check();
      await form.getByRole("button", { name: /submit candidate/i }).click();

      await page.waitForURL(/\/recruiter\/submissions\/[0-9a-f-]+\?submitted=1/);
      await expect(page.getByText(/candidate submitted|held as a possible duplicate/i).first()).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(serverErrors()).toEqual([]);
    });
  });
});

test.describe("partner settlements member", () => {
  test.skip(!FINANCE || !SETTLEMENT, `${missing("PARTNER_FINANCE")} / E2E_PARTNER_SETTLEMENT_ID`);

  test.beforeEach(async ({ page }) => {
    await signInAs(page, FINANCE!, "/recruiter");
  });

  test("records the agency invoice with its file on a settlement in the settlement currency", async ({ page }) => {
    const serverErrors = watchServerErrors(page);
    await page.goto("/recruiter/settlements");
    await expect(page.getByRole("heading", { level: 1, name: "Settlements" })).toBeVisible();
    await page.getByRole("link", { name: /open settlement/i }).first().click();
    await page.waitForURL(new RegExp(`/recruiter/settlements/${SETTLEMENT}$`));
    // Multi-currency: the AED settlement is shown in AED, never as rupees.
    const totals = page.getByRole("complementary", { name: "Totals and payment" });
    await expect(totals.getByText(/AED/).first()).toBeVisible();
    await expect(totals.getByText("₹")).toHaveCount(0);

    const invoice = `E2E-INV-${unique().toUpperCase()}`;
    await page.getByLabel("Your invoice number").fill(invoice);
    await uploadPdf(page, "Invoice file (optional)", "agency-invoice.pdf");
    await page.getByRole("button", { name: "Save invoice details" }).click();
    await expect(page.getByText(/saved|recorded/i).first()).toBeVisible();
    await page.reload();
    await dismissConsentBanner(page);
    await expect(page.getByLabel("Your invoice number")).toHaveValue(invoice);
    await expect(page.getByText("agency-invoice.pdf").first()).toBeVisible();
    expect(serverErrors()).toEqual([]);
  });

  test("invoice number is required", async ({ page }) => {
    await page.goto(`/recruiter/settlements/${SETTLEMENT}`);
    await page.getByLabel("Your invoice number").fill("");
    await page.getByRole("button", { name: "Save invoice details" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText(/invalid input|expected string/i)).toHaveCount(0);
  });

  test("sees only what the role allows", async ({ page }) => {
    const nav = await mainNavigation(page);
    await expect(nav.getByRole("link", { name: "Settlements" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Assigned requirements" })).toHaveCount(0);
    await expectForbidden(page, "/recruiter/requirements");
    await expectForbidden(page, "/recruiter/team");
    if (ASSIGNMENT) await expectForbidden(page, `/recruiter/requirements/${ASSIGNMENT}`, { status: 403 });
  });
});

test.describe("partner recruiter member", () => {
  test.skip(!RECRUITER, missing("PARTNER_RECRUITER"));

  test("cannot open settlements or manage the team", async ({ page }) => {
    await signInAs(page, RECRUITER!, "/recruiter");
    const nav = await mainNavigation(page);
    await expect(nav.getByRole("link", { name: "Assigned requirements" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settlements" })).toHaveCount(0);
    await expectForbidden(page, "/recruiter/settlements");
    if (SETTLEMENT) await expectForbidden(page, `/recruiter/settlements/${SETTLEMENT}`, { status: 403 });
    await expectForbidden(page, "/recruiter/team");
  });
});
