import { expect, test, type Page } from "@playwright/test";

/**
 * Public content, trust, support and legal pages (ui:public-content).
 * Runs against a seeded database: the content seed publishes the legal pages and site settings but no
 * news, events, stories or FAQs, so listing pages are expected to show honest empty states unless QA
 * data adds entries. Form tests submit real requests (rate limits allow a handful per hour per IP).
 */

const uniqueEmail = () => `qa+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;

async function expectNoCspOrHydrationErrors(page: Page, path: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors.filter((e) => /Content Security Policy|Refused to|Hydration/i.test(e))).toEqual([]);
}

test.describe("content listings render", () => {
  for (const path of ["/news", "/blog", "/events", "/events?when=past", "/gallery", "/videos", "/success-stories", "/faqs", "/careers", "/search"]) {
    test(`${path} renders with a heading and breadcrumbs`, async ({ page }) => {
      await expectNoCspOrHydrationErrors(page, path);
      await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();
    });
  }

  test("news category tabs mark the current category", async ({ page }) => {
    await page.goto("/news?category=hiring_drive");
    const tabs = page.getByRole("navigation", { name: "News categories" });
    await expect(tabs.getByRole("link", { name: "Hiring drive" })).toHaveAttribute("aria-current", "page");
  });

  test("unknown entries return 404", async ({ page }) => {
    for (const path of ["/news/does-not-exist-qa", "/blog/does-not-exist-qa", "/events/does-not-exist-qa", "/legal/not-a-policy", "/employers/no-such-company-qa", "/institutions/no-such-institute-qa"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });
});

test.describe("legal pages", () => {
  for (const slug of ["privacy-policy", "terms", "cookie-policy", "data-rights", "accessibility", "disclaimers"]) {
    test(`/legal/${slug} shows version and effective date`, async ({ page }) => {
      await expectNoCspOrHydrationErrors(page, `/legal/${slug}`);
      await expect(page.getByText(/Effective from/)).toBeVisible();
      await expect(page.getByText(/Version /).first()).toBeVisible();
    });
  }

  test("data rights shows the response time and grievance officer", async ({ page }) => {
    await page.goto("/legal/data-rights");
    await expect(page.getByTestId("data-request-sla")).toContainText(/respond to data requests/);
    await expect(page.getByTestId("grievance-officer")).toBeVisible();
  });

  test("cookie preferences page offers the consent controls", async ({ page }) => {
    await expectNoCspOrHydrationErrors(page, "/cookie-preferences");
    await expect(page.getByRole("link", { name: "cookie policy" })).toHaveAttribute("href", "/legal/cookie-policy");
  });
});

test.describe("safe recruitment", () => {
  test("states that candidates are never charged and links official sources", async ({ page }) => {
    await expectNoCspOrHydrationErrors(page, "/safe-recruitment");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("never charges candidates");
    await expect(page.getByRole("link", { name: /eMigrate/ }).first()).toHaveAttribute("href", "https://emigrate.gov.in/");
    await expect(page.getByRole("link", { name: /Report a suspicious offer/ })).toHaveAttribute("href", "/grievance#raise");
  });

  test("is available in Hindi and Telugu", async ({ page }) => {
    await page.goto("/safe-recruitment?lang=hi");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("शुल्क");
    await page.goto("/safe-recruitment?lang=te");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("రుసుము");
  });
});

test.describe("contact form", () => {
  test("shows inline errors when required fields are missing", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByLabel(/Your name/)).toHaveAttribute("aria-invalid", "true");
  });

  test("submits an enquiry and shows a reference code", async ({ page }) => {
    await page.goto("/contact?type=employer");
    const form = page.locator('form[data-analytics-form="contact"]');
    await expect(form.locator('input[name="website"]')).toHaveAttribute("tabindex", "-1");
    await expect(page.getByLabel(/What is it about/)).toHaveValue("employer");
    await page.getByLabel(/Your name/).fill("QA Tester");
    await page.getByLabel(/^Email/).fill(uniqueEmail());
    await page.getByLabel(/^Organisation/).fill("QA Manufacturing");
    await page.getByLabel(/Your message/).fill("We would like to discuss hiring welders for a project.");
    await page.getByLabel(/I agree that Venkat Sai Global may contact me/).check();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByTestId("form-confirmation")).toBeVisible();
    await expect(page.getByTestId("reference-code")).toHaveText(/\S+/);
  });
});

test.describe("grievance and support", () => {
  test("grievance page shows the officer card, settings-driven timelines and the form", async ({ page }) => {
    await expectNoCspOrHydrationErrors(page, "/grievance");
    await expect(page.getByTestId("grievance-officer")).toBeVisible();
    await expect(page.getByTestId("grievance-timelines")).toContainText(/Within/);
    await expect(page.locator('form[data-analytics-form="grievance"] input[name="website"]')).toHaveCount(1);
  });

  test("a guest can raise a grievance and receives a reference", async ({ page }) => {
    await page.goto("/grievance");
    const form = page.locator('form[data-analytics-form="grievance"]');
    await form.getByLabel(/Your name/).fill("QA Guest");
    await form.getByLabel(/^Email/).fill(uniqueEmail());
    await form.getByLabel(/Subject/).fill("Someone asked me to pay for a job");
    await form.getByLabel(/What happened/).fill("A caller asked for a registration fee in the name of Venkat Sai Global.");
    await form.getByLabel(/I agree that Venkat Sai Global may contact me/).check();
    await form.getByRole("button", { name: "Submit grievance" }).click();
    await expect(page.getByTestId("form-confirmation")).toBeVisible();
    await expect(page.getByTestId("reference-code")).toHaveText(/\S+/);
  });

  test("support form requires a topic", async ({ page }) => {
    await page.goto("/support");
    const form = page.locator('form[data-analytics-form="support"]');
    await form.getByLabel(/Your name/).fill("QA Guest");
    await form.getByLabel(/^Email/).fill(uniqueEmail());
    await form.getByLabel(/Subject/).fill("Cannot sign in");
    await form.getByLabel(/Describe the issue/).fill("I do not receive the sign-in code by SMS.");
    await form.getByLabel(/I agree that Venkat Sai Global may contact me/).check();
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(form.getByLabel(/What is it about/)).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("search", () => {
  test("search form is a GET search landmark", async ({ page }) => {
    await page.goto("/search?q=welding");
    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("welding");
  });

  test("layout has no horizontal scroll at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ["/contact", "/grievance", "/safe-recruitment", "/legal/privacy-policy"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
