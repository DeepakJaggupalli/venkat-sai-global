import { expect, test, type Page } from "@playwright/test";

import { collectErrors, settleForScan } from "./public-helpers";
import { expectNoA11yViolations, expectNoHorizontalScroll, latestOtpCode } from "./support";

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

  test("the language switcher changes the content and marks the language", async ({ page }) => {
    await page.goto("/safe-recruitment");
    // The switcher is labelled in the page's own language ("Read this page in" in English).
    const languages = () => page.locator("main nav").filter({ has: page.locator("a[hreflang]") });
    await expect(languages()).toHaveAttribute("aria-label", "Read this page in");
    await expect(languages().getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "true");
    await languages().getByRole("link", { name: "हिन्दी" }).click();
    await expect(page).toHaveURL(/lang=hi/);
    await expect(page.locator('main [lang="hi"]').first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("शुल्क");
    await expect(languages().getByRole("link", { name: "हिन्दी" })).toHaveAttribute("aria-current", "true");
    await languages().getByRole("link", { name: "తెలుగు" }).click();
    await expect(page).toHaveURL(/lang=te/);
    await expect(page.locator('main [lang="te"]').first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("రుసుము");
    // Every language keeps the official eMigrate link and the report route.
    await expect(page.locator('a[href="https://emigrate.gov.in/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/grievance#raise"]').first()).toBeVisible();
  });

  test("an unsupported language falls back to English", async ({ page }) => {
    const response = await page.goto("/safe-recruitment?lang=xx");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("never charges candidates");
  });
});

test.describe("guest data request", () => {
  test("shows field errors and keeps what was typed", async ({ page }) => {
    await page.goto("/legal/data-rights");
    const form = page.getByTestId("guest-data-request");
    await form.getByLabel(/Your name/).fill("QA Guest");
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(form.getByRole("textbox", { name: /^Email/ })).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel(/Your name/)).toHaveValue("QA Guest");
  });

  test("request, code from the outbox, confirm", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/legal/data-rights");
    const form = page.getByTestId("guest-data-request");
    await form.getByLabel(/Your name/).fill("QA Guest");
    await form.getByRole("textbox", { name: /^Email/ }).fill(email);
    await form.getByLabel(/Request type/).selectOption({ index: 1 });
    await form.getByLabel(/Details/).fill("Please send me a copy of the personal data you hold about me.");
    const since = new Date(Date.now() - 2000);
    await form.getByRole("button", { name: "Send request" }).click();

    const verify = page.getByTestId("guest-data-request-verify");
    await expect(verify).toBeVisible();
    await expect(verify).toContainText(email);
    const code = await latestOtpCode(email, { channel: "email", since });

    // A wrong code is refused with a field error, and the form stays usable.
    await verify.getByLabel(/6-digit code/).fill(code === "000000" ? "111111" : "000000");
    await verify.getByRole("button", { name: "Confirm request" }).click();
    await expect(verify.getByLabel(/6-digit code/)).toHaveAttribute("aria-invalid", "true");

    await verify.getByLabel(/6-digit code/).fill(code);
    await verify.getByRole("button", { name: "Confirm request" }).click();
    await expect(page.getByTestId("form-confirmation")).toContainText("Your request is confirmed");
    await expect(page.getByTestId("reference-code")).toHaveText(/DSR/);
  });
});

test.describe("contact form", () => {
  test("shows inline errors when required fields are missing", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByLabel(/Your name/)).toHaveAttribute("aria-invalid", "true");
  });

  test("keeps what was typed when the message is missing", async ({ page }) => {
    await page.goto("/contact?type=employer");
    await page.getByLabel(/Your name/).fill("QA Tester");
    await page.getByLabel(/^Organisation/).fill("QA Retained Input Co");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByLabel(/Your message/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/Your name/)).toHaveValue("QA Tester");
    await expect(page.getByLabel(/^Organisation/)).toHaveValue("QA Retained Input Co");
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

  test("grievance form shows field errors and keeps what was typed", async ({ page }) => {
    await page.goto("/grievance");
    const form = page.locator('form[data-analytics-form="grievance"]');
    await form.getByLabel(/Your name/).fill("QA Guest");
    await form.getByLabel(/Subject/).fill("Retained subject");
    await form.getByRole("button", { name: "Submit grievance" }).click();
    await expect(form.getByLabel(/What happened/)).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel(/Your name/)).toHaveValue("QA Guest");
    await expect(form.getByLabel(/Subject/)).toHaveValue("Retained subject");
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

/**
 * QA walk (Stage 3): every content, trust, support and legal route renders without console errors, has exactly
 * one h1, passes the automated WCAG A/AA scan (serious + critical) and has no horizontal scroll at 360px.
 */
const CONTENT_ROUTES = [
  "/news",
  "/news/e2e-test-news",
  "/blog",
  "/events",
  "/gallery",
  "/videos",
  "/success-stories",
  "/faqs",
  "/careers",
  "/search?q=welding",
  "/contact",
  "/grievance",
  "/support",
  "/safe-recruitment",
  "/safe-recruitment?lang=hi",
  "/safe-recruitment?lang=te",
  "/legal/privacy-policy",
  "/legal/terms",
  "/legal/cookie-policy",
  "/legal/data-rights",
  "/legal/accessibility",
  "/legal/disclaimers",
  "/cookie-preferences",
];

test.describe("content route quality", () => {
  for (const path of CONTENT_ROUTES) {
    test(`${path} renders cleanly, accessibly and fits 360px`, async ({ page }) => {
      const errors = collectErrors(page);
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await settleForScan(page);
      await expectNoA11yViolations(page);
      await page.setViewportSize({ width: 360, height: 800 });
      await expectNoHorizontalScroll(page);
      expect(errors, path).toEqual([]);
    });
  }
});

test.describe("honest content pages", () => {
  // Public figures may only come from approved public metrics with an "as of" date (CONVENTIONS rule 1).
  for (const path of ["/careers", "/success-stories", "/training", "/safe-recruitment", "/grievance", "/contact"]) {
    test(`${path} makes no unattributed numeric claims`, async ({ page }) => {
      await page.goto(path);
      const text = await page.locator("main#main-content").evaluate((main) => {
        const clone = main.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script, style").forEach((el) => el.remove());
        return clone.innerText;
      });
      expect(text).not.toMatch(/\b\d[\d,.]*\s*(\+|%|k\+|lakh|crore)(?=\s|$)/i);
    });
  }

  test("empty listings say so plainly instead of showing placeholders", async ({ page }) => {
    for (const path of ["/events?when=past", "/videos", "/gallery"]) {
      await page.goto(path);
      const main = page.locator("main#main-content");
      const cards = await main.locator("article, [data-testid='entry-card']").count();
      if (cards === 0) await expect(main.getByText(/^no .*(to show|yet|right now|at the moment|published|found)/i).first(), path).toBeVisible();
      await expect(main.getByText(/lorem ipsum|coming soon!|placeholder/i), path).toHaveCount(0);
    }
  });
});
