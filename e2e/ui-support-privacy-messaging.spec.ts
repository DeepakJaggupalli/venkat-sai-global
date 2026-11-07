import { expect, test, type Page } from "@playwright/test";

/**
 * Helpdesk, grievances, privacy requests, notification templates, notification centre, messaging and
 * account privacy (ui:support-privacy-messaging).
 *
 * Seeded accounts (each group is skipped when its variables are missing):
 * - E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD: candidate with a verified email
 * - E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD: active employer member
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD: Super Admin (2FA satisfied for the test environment)
 */

const CANDIDATE = { email: process.env.E2E_CANDIDATE_EMAIL, password: process.env.E2E_CANDIDATE_PASSWORD };
const EMPLOYER = { email: process.env.E2E_EMPLOYER_EMAIL, password: process.env.E2E_EMPLOYER_PASSWORD };
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };

async function signIn(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

async function chooseOption(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

const unique = () => Date.now().toString(36);

test.describe("People Portal support and messages", () => {
  test.skip(!CANDIDATE.email || !CANDIDATE.password, "E2E_CANDIDATE_* not set");
  test.beforeEach(async ({ page }) => signIn(page, CANDIDATE.email!, CANDIDATE.password!, "/talent/support"));

  test("raise a support request, reply and see it in the list", async ({ page }) => {
    const subject = `E2E help ${unique()}`;
    await page.goto("/talent/support/new");
    await expect(page.getByRole("heading", { level: 1, name: "New support request" })).toBeVisible();
    await chooseOption(page, "What do you need help with?", "Account or sign-in issue");
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Describe the issue").fill("I cannot update my phone number from the account page.");
    await page.getByRole("button", { name: "Send request" }).click();
    await page.waitForURL(/\/talent\/support\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
    await expect(page.getByTestId("ticket-message")).toHaveCount(1);

    await page.getByLabel("Your reply").fill("Adding a detail: the error appears after the code is sent.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByTestId("ticket-message")).toHaveCount(2);

    await page.goto("/talent/support");
    await expect(page.getByRole("link", { name: new RegExp(subject) })).toBeVisible();
  });

  test("grievance category asks for the grievance type and shows timelines from settings", async ({ page }) => {
    await page.goto("/talent/support/new");
    await expect(page.getByText(/acknowledged within \d+ hours/)).toBeVisible();
    await chooseOption(page, "What do you need help with?", "Grievance (formal)");
    await expect(page.getByLabel("Type of grievance")).toBeVisible();
  });

  test("application deep link opens a prefilled request", async ({ page }) => {
    await page.goto("/talent/support?application=VSG-APP-000001");
    await page.waitForURL(/\/talent\/support\/new\?application=/);
    await expect(page.getByLabel("Subject")).toHaveValue("Application VSG-APP-000001");
  });

  test("messages inbox renders (translated shell, honest empty state)", async ({ page }) => {
    await page.goto("/talent/messages");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /conversations|बातचीत|సంభాషణలు/i })).toBeVisible();
  });
});

test.describe("Account privacy", () => {
  test.skip(!CANDIDATE.email || !CANDIDATE.password, "E2E_CANDIDATE_* not set");
  test.beforeEach(async ({ page }) => signIn(page, CANDIDATE.email!, CANDIDATE.password!, "/account/privacy"));

  test("shows consents, requests and lets the person ask for an export", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Privacy and your data" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Cookies and analytics" })).toBeVisible();
    await expect(page.getByTestId("communication-consents-form")).toBeVisible();
    const form = page.getByTestId("data-request-form");
    const exportOption = form.getByLabel(/Copy of my data/);
    if (await exportOption.isDisabled()) test.skip(true, "An export request is already open for this account");
    await exportOption.check();
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("table", { name: "Your data requests" }).getByText(/Copy of my data/)).toBeVisible();
  });

  test("deletion requires explicit confirmation", async ({ page }) => {
    const form = page.getByTestId("data-request-form");
    const deletion = form.getByLabel(/Delete my data/);
    if (await deletion.isDisabled()) test.skip(true, "A deletion request is already open");
    await deletion.check();
    await form.getByRole("button", { name: "Request account deletion" }).click();
    await expect(page.getByText("Confirm that you understand your account will be closed").first()).toBeVisible();
  });
});

test.describe("Employer support and messages", () => {
  test.skip(!EMPLOYER.email || !EMPLOYER.password, "E2E_EMPLOYER_* not set");
  test.beforeEach(async ({ page }) => signIn(page, EMPLOYER.email!, EMPLOYER.password!, "/employer/messages"));

  test("start a conversation with the Venkat Sai team", async ({ page }) => {
    const subject = `E2E conversation ${unique()}`;
    await page.goto("/employer/messages/new");
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Message").fill("Hello, we would like to discuss a new requirement.");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await page.waitForURL(/\/employer\/messages\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
    await page.getByLabel("Write a message").fill("A follow-up message.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("thread-message")).toHaveCount(2);
  });

  test("support list has tabs and a new-request action", async ({ page }) => {
    await page.goto("/employer/support");
    await expect(page.getByRole("heading", { level: 1, name: "Support" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New request" }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Request status" })).toBeVisible();
  });
});

test.describe("Command Centre helpdesk, privacy and notifications", () => {
  test.skip(!ADMIN.email || !ADMIN.password, "E2E_ADMIN_* not set");
  test.beforeEach(async ({ page }) => signIn(page, ADMIN.email!, ADMIN.password!, "/admin/support"));

  test("support desk queues and filters", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Support desk" })).toBeVisible();
    await page.getByRole("link", { name: "Unassigned" }).first().click();
    await expect(page).toHaveURL(/queue=unassigned/);
    await page.goto("/admin/support/grievances");
    await expect(page.getByRole("heading", { level: 2, name: "Timelines in force" })).toBeVisible();
  });

  test("log a phone request and add an internal note", async ({ page }) => {
    const subject = `E2E phone ${unique()}`;
    await page.goto("/admin/support/new");
    await page.getByLabel("Email").fill(`caller-${unique()}@example.test`);
    await chooseOption(page, "Category", "Candidate support");
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("What the requester said").fill("Asked how to upload a passport copy.");
    await page.getByRole("button", { name: "Log request" }).click();
    await page.waitForURL(/\/admin\/support\/[0-9a-f-]{36}$/);
    await page.getByLabel("Internal note (not sent to the requester)").check();
    await page.getByLabel("Internal note", { exact: true }).fill("Called back, left a voicemail.");
    await page.getByRole("button", { name: "Add internal note" }).click();
    await expect(page.getByText("Called back, left a voicemail.")).toBeVisible();
  });

  test("privacy requests queue renders with deadlines", async ({ page }) => {
    await page.goto("/admin/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy requests" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Queues" })).toBeVisible();
  });

  test("template editor previews live and the delivery log filters", async ({ page }) => {
    await page.goto("/admin/notifications");
    await page.getByRole("link", { name: /Support request received/ }).first().click();
    await expect(page.getByTestId("template-editor")).toBeVisible();
    await page.getByLabel("Subject").fill("Preview check {{code}}");
    await expect(page.getByText(/Subject: Preview check/)).toBeVisible();
    await page.goto("/admin/notifications/deliveries?status=failed");
    await expect(page.getByRole("heading", { level: 1, name: "Delivery log" })).toBeVisible();
  });

  test("staff inbox and new conversation form", async ({ page }) => {
    await page.goto("/admin/messages");
    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
    await page.goto("/admin/messages/new");
    await expect(page.getByTestId("new-thread-form")).toBeVisible();
  });

  test("/notifications sends staff to the account notification centre", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/account\/notifications/);
  });
});
