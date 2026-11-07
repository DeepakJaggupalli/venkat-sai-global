import { expect, test, type Page } from "@playwright/test";

/**
 * Public marketing site: homepage, brand/discovery pages, the workforce requirement form and SEO routes.
 * Runs against a seeded database (content seed: homepage, navigation, about, published services).
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const cspOrHydration = (errors: string[]) => errors.filter((e) => /Content Security Policy|Refused to|Hydration/i.test(e));

test.describe("homepage", () => {
  test("renders the brand hero with the three calls to action", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    const hero = page.getByTestId("home-hero");
    await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(hero.getByRole("link", { name: /explore opportunities/i })).toBeVisible();
    await expect(hero.getByRole("link", { name: /hire through venkat sai/i })).toBeVisible();
    await expect(hero.getByRole("link", { name: /become a partner/i })).toBeVisible();
    await expect(page.getByTestId("home-opportunities")).toBeVisible();
    expect(cspOrHydration(errors)).toEqual([]);
  });

  test("never shows a metrics section without approved figures", async ({ page }) => {
    await page.goto("/");
    const metrics = page.getByTestId("home-metrics");
    if (await metrics.count()) {
      // Every figure must carry its "as of" date.
      await expect(metrics.getByText(/as of/i).first()).toBeVisible();
    }
  });

  test("includes Organization structured data", async ({ page }) => {
    await page.goto("/");
    const json = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(json).toContain('"@type":"Organization"');
  });
});

test.describe("discovery pages", () => {
  for (const path of ["/about", "/services", "/industries", "/global-reach", "/employers", "/candidates", "/partners", "/institutions"]) {
    test(`${path} renders with one h1 and breadcrumbs`, async ({ page }) => {
      const errors = collectErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
      expect(cspOrHydration(errors)).toEqual([]);
    });
  }

  test("a published service page shows its enquiry form", async ({ page }) => {
    await page.goto("/services");
    const first = page.getByTestId("services-list").getByRole("link").first();
    test.skip((await first.count()) === 0, "No published services in this database");
    await first.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("enquiry-form").or(page.getByText(/not currently offered/i))).toBeVisible();
  });

  test("unknown CMS slugs return 404", async ({ page }) => {
    const service = await page.goto("/services/this-service-does-not-exist");
    expect(service?.status()).toBe(404);
    const destination = await page.goto("/global-reach/atlantis");
    expect(destination?.status()).toBe(404);
  });

  test("an invalid preview token never reveals a draft", async ({ page }) => {
    const response = await page.goto("/services/this-service-does-not-exist?preview=v1.invalid.l.0.sig");
    expect(response?.status()).toBe(404);
    await page.goto("/?preview=v1.invalid.l.0.sig");
    await expect(page.getByTestId("preview-ribbon")).toHaveCount(0);
  });

  test("candidates page states that candidates are never charged", async ({ page }) => {
    await page.goto("/candidates");
    await expect(page.getByTestId("never-charge-notice")).toContainText(/never charge candidates/i);
  });

  test("partners page links to partner sign-up", async ({ page }) => {
    await page.goto("/partners");
    await expect(page.getByTestId("landing-primary-cta")).toHaveAttribute("href", "/sign-up?intent=partner");
  });

  test("institutions page links to institution sign-up", async ({ page }) => {
    await page.goto("/institutions");
    await expect(page.getByTestId("landing-primary-cta")).toHaveAttribute("href", "/sign-up?intent=institution");
  });
});

test.describe("workforce requirement form", () => {
  test("shows inline errors when required fields are missing", async ({ page }) => {
    await page.goto("/employers/request");
    await page.getByTestId("requirement-submit").click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByLabel(/requirement title/i)).toHaveAttribute("aria-invalid", "true");
  });

  test("adds and removes role lines", async ({ page }) => {
    await page.goto("/employers/request");
    await expect(page.getByTestId("requirement-line")).toHaveCount(1);
    await page.getByRole("button", { name: /add another role/i }).click();
    await expect(page.getByTestId("requirement-line")).toHaveCount(2);
    await page.getByRole("button", { name: /remove role 2/i }).click();
    await expect(page.getByTestId("requirement-line")).toHaveCount(1);
  });

  test("submits a requirement and shows the reference code", async ({ page }) => {
    await page.goto("/employers/request");
    await page.getByLabel(/requirement title/i).fill("Welders for a fabrication project (E2E)");
    await page.getByLabel(/role or trade/i).fill("TIG welder");
    await page.getByLabel(/number of positions/i).fill("4");
    await page.getByLabel(/company name/i).fill("E2E Fabrication Test Co");
    await page.getByLabel(/^contact person/i).fill("Test Contact");
    await page.getByLabel(/^email/i).fill(`e2e-requirement-${Date.now()}@example.com`);
    await page.getByRole("checkbox", { name: /may contact me about this requirement/i }).check();
    await page.getByTestId("requirement-submit").click();
    await expect(page.getByTestId("requirement-success")).toBeVisible();
    await expect(page.getByTestId("requirement-code")).toHaveText(/\S+/);
  });
});

test.describe("SEO routes", () => {
  test("robots.txt blocks portals and points to the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    for (const path of ["/talent", "/admin", "/account", "/api/"]) expect(body).toContain(`Disallow: ${path}`);
    expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/);
    expect(body).not.toContain("Disallow: /employers");
  });

  test("sitemap.xml lists the static public routes", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain("/employers/request</loc>");
    expect(xml).toContain("/global-reach</loc>");
  });

  test("manifest and icons are served", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    expect((await manifest.json()).name).toBe("Venkat Sai Global");
    expect((await request.get("/icon")).headers()["content-type"]).toContain("image/png");
    expect((await request.get("/opengraph-image")).headers()["content-type"]).toContain("image/png");
  });
});
