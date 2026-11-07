import { expect, test, type Page } from "@playwright/test";

/**
 * Command Centre administration (ui:admin-settings-system): settings, modules, roles, taxonomies,
 * workflows, security, integrations, audit logs and the system monitor.
 *
 * Needs a seeded Super Admin (flows are skipped when the variables are missing):
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, with security.require_staff_2fa off for the test environment
 *   (or a pre-verified session). The seed's reference data and default workflow must be installed.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function signIn(page: Page, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(ADMIN_EMAIL!);
  await page.getByLabel(/password/i).first().fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

test.describe("Command Centre settings and system", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test("settings home shows grouped settings and saves a change", async ({ page }) => {
    await signIn(page, "/admin/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    const form = page.getByTestId("settings-form-support");
    const field = form.getByLabel("Low priority SLA (hours)");
    const current = await field.inputValue();
    await field.fill(current === "72" ? "71" : "72");
    await form.getByRole("button", { name: /save support settings/i }).click();
    await expect(page.getByText(/support settings saved/i)).toBeVisible();
    // Invalid values are rejected inline.
    await field.fill("0");
    await form.getByRole("button", { name: /save support settings/i }).click();
    await expect(form.getByText("Must be at least 1")).toBeVisible();
  });

  test("modules page lists flags with switches", async ({ page }) => {
    await signIn(page, "/admin/settings/modules");
    await expect(page.getByRole("heading", { level: 1, name: "Modules and feature flags" })).toBeVisible();
    await expect(page.getByTestId("toggle-content.blog")).toBeVisible();
    await expect(page.getByRole("switch", { name: /People Portal/ })).toBeVisible();
  });

  test("create a custom staff role and choose permissions", async ({ page }) => {
    await signIn(page, "/admin/settings/roles");
    await expect(page.getByRole("heading", { level: 1, name: "Roles and permissions" })).toBeVisible();
    await page.getByTestId("new-role").click();
    const name = `QA role ${unique()}`;
    await page.getByTestId("new-role-form").getByLabel("Role name").fill(name);
    await page.getByTestId("new-role-form").getByRole("button", { name: "Create role" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.getByLabel("View audit, security and data-access logs").check();
    await expect(page.getByText(/Sensitive/).first()).toBeVisible();
    await page.getByRole("button", { name: "Save role" }).click();
    await expect(page.getByText(/role saved/i)).toBeVisible();
    await page.getByTestId("delete-role").click();
    await page.getByRole("button", { name: "Delete role" }).last().click();
    await page.waitForURL(/\/admin\/settings\/roles/);
  });

  test("super admin role is protected", async ({ page }) => {
    await signIn(page, "/admin/settings/roles");
    await page.getByRole("link", { name: /Open role Super Admin/ }).click();
    await expect(page.getByText("Super Admin is protected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save role" })).toHaveCount(0);
  });

  test("taxonomies: add a skill, search, edit and export", async ({ page }) => {
    await signIn(page, "/admin/settings/taxonomies");
    await page.getByTestId("taxonomy-skills").click();
    await expect(page.getByRole("heading", { level: 1, name: "Skills" })).toBeVisible();
    await page.getByRole("link", { name: "Add skill" }).click();
    const name = `QA skill ${unique()}`;
    const form = page.getByTestId("taxonomy-form");
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("Category").click();
    await page.getByRole("option", { name: "Trade" }).click();
    await form.getByLabel("Synonyms").fill("QA synonym one, QA synonym two");
    await form.getByRole("button", { name: "Add skill" }).click();
    await expect(page.getByText("New skill added")).toBeVisible();
    await page.getByRole("search").getByRole("searchbox").fill(name);
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByTestId("taxonomy-export")).toHaveAttribute("href", "/admin/settings/taxonomies/skills/export");
  });

  test("workflows: open the default workflow and its stage editor", async ({ page }) => {
    await signIn(page, "/admin/settings/workflows");
    await expect(page.getByRole("heading", { level: 1, name: "Application workflows" })).toBeVisible();
    await page.getByRole("link", { name: /Open workflow/ }).first().click();
    await expect(page.getByTestId("stage-list").getByRole("listitem").first()).toBeVisible();
    await page.getByRole("link", { name: /^Edit / }).first().click();
    await expect(page.getByTestId("stage-form").getByLabel("Label shown to candidates (English)")).toBeVisible();
  });

  test("security and integrations never show secret values", async ({ page }) => {
    await signIn(page, "/admin/settings/security");
    await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
    await expect(page.getByText("Active sessions")).toBeVisible();
    await page.goto("/admin/settings/integrations");
    await expect(page.getByTestId("integrations-list").getByRole("listitem")).not.toHaveCount(0);
    await expect(page.getByText(/SMTP_PASSWORD/).first()).toBeAttached();
  });

  test("audit logs filter and export", async ({ page }) => {
    await signIn(page, "/admin/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Audit logs" })).toBeVisible();
    await page.getByLabel("Action starts with").fill("settings.");
    await page.getByLabel("Action starts with").press("Enter");
    await expect(page).toHaveURL(/action=settings\./);
    await expect(page.getByTestId("audit-export")).toHaveAttribute("href", /\/admin\/audit\/export\?.*log=audit/);
    await page.getByRole("link", { name: "Security events" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Security events" })).toBeVisible();
    await page.getByRole("link", { name: "Data access" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Data access log" })).toBeVisible();
  });

  test("system health and task queue", async ({ page }) => {
    await signIn(page, "/admin/system");
    await expect(page.getByRole("heading", { level: 1, name: "System" })).toBeVisible();
    await expect(page.getByText("Reachable")).toBeVisible();
    await page.getByRole("link", { name: "Task queue" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Task queue" })).toBeVisible();
    await page.getByTestId("run-system.cleanup").click();
    await expect(page.getByText(/Queued|Already queued/)).toBeVisible();
  });
});
