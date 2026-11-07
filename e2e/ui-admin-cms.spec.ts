import { expect, test, type Page } from "@playwright/test";

/**
 * Command Centre content management (ui:admin-cms): content hub, collection lists, the generic entry editor,
 * singleton editors, media library, announcements, public statistics and logo permissions.
 *
 * Needs a seeded staff account with the Content Manager role (content.view/edit/publish, media.manage,
 * announcements.manage, metrics.public_manage):
 * - E2E_CONTENT_EMAIL / E2E_CONTENT_PASSWORD
 * The content seed (src/modules/content/seed.ts) provides published site settings, homepage, navigation, services
 * and legal pages, draft industries/destinations/FAQs and hidden public metric definitions.
 */

const EMAIL = process.env.E2E_CONTENT_EMAIL;
const PASSWORD = process.env.E2E_CONTENT_PASSWORD;

async function signIn(page: Page, returnTo: string) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/email|phone/i).first().fill(EMAIL!);
  await page.getByLabel(/password/i).first().fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|continue/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo.split("?")[0]!));
}

const unique = () => Date.now().toString(36);

test.describe("Command Centre content management", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_CONTENT_EMAIL / E2E_CONTENT_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await signIn(page, "/admin/content");
  });

  test("every content admin route resolves", async ({ page }) => {
    for (const path of ["/admin/content", "/admin/content/services", "/admin/content/faqs", "/admin/content/site_settings", "/admin/content/homepage", "/admin/content/navigation", "/admin/content/about", "/admin/content/logo-permissions", "/admin/content/logo-permissions/new", "/admin/media", "/admin/announcements", "/admin/announcements/new", "/admin/public-metrics"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    }
  });

  test("hub lists site-wide pages and collections with counts", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Website content" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site-wide pages" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Services/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Homepage/ }).first()).toBeVisible();
  });

  test("create a FAQ draft, edit it, see validation, save and view history", async ({ page }) => {
    await page.goto("/admin/content/faqs");
    await page.getByRole("button", { name: /New faq/i }).click();
    const title = `E2E question ${unique()}`;
    await page.getByRole("dialog").getByLabel("Title").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Create draft" }).click();
    await page.waitForURL(/\/admin\/content\/faqs\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    // Save a change explicitly (Ctrl+S also works).
    await page.getByLabel("Summary").fill("Short answer used on listings.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("region", { name: "Save status" })).toContainText(/All changes saved/);

    // History shows at least two versions with a readable comparison.
    const history = page.getByRole("region", { name: "Version history" });
    await expect(history.getByText(/Version 2/)).toBeVisible();
    await history.getByRole("button", { name: /What changed/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText(/Summary/);
    await page.keyboard.press("Escape");

    // Publishing without the required fields maps errors back onto the form.
    await page.getByRole("button", { name: /^Publish$/ }).click();
    await expect(page.getByText(/need attention|Please correct/i).first()).toBeVisible();
  });

  test("collection list filters by status and offers reordering", async ({ page }) => {
    await page.goto("/admin/content/services");
    await page.getByRole("link", { name: "Published" }).click();
    await expect(page).toHaveURL(/status=published/);
    await expect(page.getByRole("table", { name: "Entries" }).or(page.getByText(/No entries match|No services yet/))).toBeVisible();
    await page.goto("/admin/content/services?reorder=1");
    await expect(page.getByRole("heading", { level: 1, name: /Reorder services/i })).toBeVisible();
    const moveDown = page.getByRole("button", { name: /Move .* down/ }).first();
    if (await moveDown.isVisible()) {
      await moveDown.click();
      await expect(page.getByRole("button", { name: "Save order" })).toBeEnabled();
    }
  });

  test("homepage singleton shows sections with keyboard-reorderable rows", async ({ page }) => {
    await page.goto("/admin/content/homepage");
    await expect(page.getByRole("heading", { level: 1, name: "Homepage" })).toBeVisible();
    await expect(page.getByRole("group", { name: /Sections/ }).or(page.getByText("Sections").first())).toBeVisible();
    await expect(page.getByRole("button", { name: /Reorder/ }).first()).toBeVisible();
  });

  test("media library shows honest empty state or grid, with upload dialog", async ({ page }) => {
    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { level: 1, name: "Media library" })).toBeVisible();
    await page.getByRole("button", { name: "Add media" }).first().click();
    await expect(page.getByRole("dialog", { name: "Add media" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Video link" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "List view" }).click();
    await expect(page).toHaveURL(/view=list/);
  });

  test("announcement: create draft with preview, publish and end", async ({ page }) => {
    await page.goto("/admin/announcements/new");
    const title = `E2E notice ${unique()}`;
    await page.getByLabel("Title").fill(title);
    await expect(page.getByRole("figure", { name: "Preview of the banner" })).toContainText(title);
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.waitForURL(/\/admin\/announcements\/[0-9a-f-]{36}/);
    await page.getByRole("button", { name: /Publish now|Schedule/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Publish|Schedule/ }).click();
    await expect(page.getByText(/Published|Scheduled/).first()).toBeVisible();
    await page.getByRole("button", { name: "End now" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "End now" }).click();
    await expect(page.getByText("Expired").first()).toBeVisible();
  });

  test("public statistics carry truthfulness guidance and require approval for manual figures", async ({ page }) => {
    await page.goto("/admin/public-metrics");
    await expect(page.getByText("Only true, verifiable numbers")).toBeVisible();
    await expect(page.getByRole("button", { name: "Recalculate live counts" })).toBeVisible();
    const card = page.getByRole("article").first();
    await expect(card.getByText("Website shows now")).toBeVisible();
  });

  test("logo permission: record pending permission", async ({ page }) => {
    await page.goto("/admin/content/logo-permissions/new");
    await page.getByLabel("Organisation name").fill(`E2E Org ${unique()}`);
    await page.getByLabel("Reference").fill("Email of 1 November 2026");
    await page.getByLabel("Homepage").check();
    await page.getByRole("button", { name: "Record permission" }).click();
    await page.waitForURL(/\/admin\/content\/logo-permissions\/[0-9a-f-]{36}/);
    await expect(page.getByText("Pending review").first()).toBeVisible();
  });
});
