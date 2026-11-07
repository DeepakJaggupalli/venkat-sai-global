import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { collectErrors, focusIsVisible, settleForScan } from "./public-helpers";
import { expectNoA11yViolations, expectNoHorizontalScroll, hasCredentials, missingCredentials, signIn } from "./support";

/**
 * Public marketing site: homepage, brand/discovery pages, the workforce requirement form and SEO routes.
 * Runs against a seeded database (content seed: homepage, navigation, about, published services).
 */

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
    await page.getByRole("textbox", { name: /^contact person/i }).fill("Test Contact");
    await page.getByRole("textbox", { name: /^email/i }).fill(`e2e-requirement-${Date.now()}@example.com`);
    await page.getByRole("checkbox", { name: /may contact me about this requirement/i }).check();
    await page.getByTestId("requirement-submit").click();
    await expect(page.getByTestId("requirement-success")).toBeVisible();
    await expect(page.getByTestId("requirement-code")).toHaveText(/\S+/);
  });

  test("keeps what was typed when other fields are missing", async ({ page }) => {
    await page.goto("/employers/request");
    await page.getByLabel(/requirement title/i).fill("Fitters for a plant shutdown (E2E)");
    await page.getByLabel(/company name/i).fill("E2E Retained Input Co");
    await page.getByTestId("requirement-submit").click();
    await expect(page.getByRole("textbox", { name: /^contact person/i })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/requirement title/i)).toHaveValue("Fitters for a plant shutdown (E2E)");
    await expect(page.getByLabel(/company name/i)).toHaveValue("E2E Retained Input Co");
  });

  test("a submitted requirement reaches the Command Centre queue", async ({ page }) => {
    test.skip(!hasCredentials("ops"), missingCredentials("ops"));
    const title = `Riggers for a crane lift (E2E ${Date.now().toString(36)})`;
    await page.goto("/employers/request");
    await page.getByLabel(/requirement title/i).fill(title);
    await page.getByLabel(/role or trade/i).fill("Rigger");
    await page.getByLabel(/number of positions/i).fill("2");
    await page.getByLabel(/company name/i).fill("E2E Lift Test Co");
    await page.getByRole("textbox", { name: /^contact person/i }).fill("Test Contact");
    await page.getByRole("textbox", { name: /^email/i }).fill(`e2e-requirement-${Date.now()}@example.com`);
    await page.getByRole("checkbox", { name: /may contact me about this requirement/i }).check();
    await page.getByTestId("requirement-submit").click();
    const code = (await page.getByTestId("requirement-code").textContent())?.trim() ?? "";
    expect(code).toMatch(/REQ/);

    await signIn(page, "ops", { returnTo: `/admin/requirements?q=${encodeURIComponent(code)}` });
    // Desktop shows a table row, mobile a card (with a screen-reader-only link label first): match the visible one.
    await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();
  });
});

/**
 * CMS preview links: `?preview=v1.<entryId>.<version|l>.<exp>.<HMAC>` signed with SESSION_SECRET (see
 * src/modules/content/preview.ts). The spec signs its own tokens with the local server's secret from
 * .env.local (local servers only, never printed) for the draft industry the E2E seed keeps unpublished.
 */
function localSessionSecret(): string | null {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) return null;
  const file = resolvePath(__dirname, "..", ".env.local");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*SESSION_SECRET\s*=/.test(l));
  return line?.replace(/^\s*SESSION_SECRET\s*=\s*/, "").trim().replace(/^(['"])(.*)\1$/, "$2") || null;
}

function previewToken(secret: string, entryId: string, opts: { version?: string; expiresInSeconds?: number } = {}): string {
  const version = opts.version ?? "l";
  const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 600);
  const sig = createHmac("sha256", secret).update(`cms-preview:${entryId}.${version}.${exp}`).digest("base64url");
  return `v1.${entryId}.${version}.${exp}.${sig}`;
}

test.describe("CMS preview links", () => {
  const entryId = process.env.E2E_DRAFT_INDUSTRY_ID ?? "";
  const slug = process.env.E2E_DRAFT_INDUSTRY_SLUG ?? "e2e-draft-industry";
  const secret = localSessionSecret();
  test.skip(!entryId || !secret, "Needs E2E_DRAFT_INDUSTRY_ID (npm run db:seed:e2e) and a local server with .env.local");

  test("a draft is not public", async ({ page }) => {
    const response = await page.goto(`/industries/${slug}`);
    expect(response?.status()).toBe(404);
  });

  test("a valid preview link shows the draft with the ribbon and noindex", async ({ page }) => {
    const response = await page.goto(`/industries/${slug}?preview=${previewToken(secret!, entryId)}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("preview-ribbon")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E draft industry");
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("tampered, expired, over-long and other-entry tokens never reveal the draft", async ({ page }) => {
    const valid = previewToken(secret!, entryId);
    const tampered = `${valid.slice(0, -2)}${valid.endsWith("AA") ? "BB" : "AA"}`;
    const expired = previewToken(secret!, entryId, { expiresInSeconds: -60 });
    const tooLong = previewToken(secret!, entryId, { expiresInSeconds: 3 * 24 * 3600 });
    const otherEntry = previewToken(secret!, "00000000-0000-4000-8000-000000000000");
    for (const token of [tampered, expired, tooLong, otherEntry]) {
      const response = await page.goto(`/industries/${slug}?preview=${encodeURIComponent(token)}`);
      expect(response?.status(), token.split(".").slice(0, 4).join(".")).toBe(404);
    }
  });

  test("a preview token for one entry does not mark another page as a preview", async ({ page }) => {
    const response = await page.goto(`/industries/e2e-test-industry?preview=${previewToken(secret!, entryId)}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("preview-ribbon")).toHaveCount(0);
  });
});

test.describe("structured data", () => {
  async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    return blocks.flatMap((text) => {
      const parsed = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[];
      return Array.isArray(parsed) ? parsed : [parsed];
    });
  }

  test("service pages describe a Service provided by Venkat Sai Global", async ({ page }) => {
    await page.goto("/services/welding-and-industrial-testing");
    const service = (await jsonLd(page)).find((d) => d["@type"] === "Service");
    expect(service?.name).toBeTruthy();
    expect((service?.provider as Record<string, unknown>)?.name).toBe("Venkat Sai Global");
  });

  test("job pages carry a JobPosting with the job's own currency", async ({ page }) => {
    const slug = process.env.E2E_EMPLOYER_OVERSEAS_JOB_SLUG;
    test.skip(!slug, "Needs E2E_EMPLOYER_OVERSEAS_JOB_SLUG (npm run db:seed:e2e)");
    await page.goto(`/jobs/${slug}`);
    const posting = (await jsonLd(page)).find((d) => d["@type"] === "JobPosting");
    expect(posting?.title).toBeTruthy();
    expect(posting?.datePosted).toBeTruthy();
    expect((posting?.hiringOrganization as Record<string, unknown>)?.name).toBeTruthy();
    // The seeded overseas job pays in AED: structured data must not assume INR.
    expect((posting?.baseSalary as Record<string, unknown>)?.currency).toBe("AED");
  });

  test("course pages describe a Course with its real provider", async ({ page }) => {
    await page.goto("/training/e2e-welding-basics-test-course");
    const course = (await jsonLd(page)).find((d) => d["@type"] === "Course");
    expect(course?.name).toBe("E2E Welding basics (test course)");
    expect((course?.provider as Record<string, unknown>)?.name).toBe("E2E Training Institute");
    // Only facts the page shows: no ratings or offers invented for rich results.
    expect(course).not.toHaveProperty("aggregateRating");
    expect(course).not.toHaveProperty("offers");
  });

  test("public organisation pages describe the organisation and their breadcrumbs", async ({ page }) => {
    const employer = process.env.E2E_PUBLIC_EMPLOYER_SLUG;
    const institution = process.env.E2E_PUBLIC_INSTITUTION_SLUG;
    test.skip(!employer || !institution, "Needs E2E_PUBLIC_EMPLOYER_SLUG / E2E_PUBLIC_INSTITUTION_SLUG (npm run db:seed:e2e)");
    await page.goto(`/employers/${employer}`);
    let data = await jsonLd(page);
    expect(data.find((d) => d["@type"] === "Organization")?.name).toBe("E2E Employer Co");
    expect(data.some((d) => d["@type"] === "BreadcrumbList")).toBe(true);
    await page.goto(`/institutions/${institution}`);
    data = await jsonLd(page);
    expect(data.find((d) => d["@type"] === "EducationalOrganization")?.name).toBe("E2E Training Institute");
  });

  test("structured data never contains raw markup that could close the script element", async ({ page }) => {
    for (const path of ["/", "/faqs", "/news/e2e-test-news", "/services/welding-and-industrial-testing"]) {
      await page.goto(path);
      const raw = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((el) => el.innerHTML));
      for (const block of raw) expect(block, path).not.toMatch(/<\/?script/i);
    }
  });

  test("the FAQ page publishes FAQPage data for its questions", async ({ page }) => {
    await page.goto("/faqs");
    const faq = (await jsonLd(page)).find((d) => d["@type"] === "FAQPage");
    test.skip(!faq, "No published FAQs in this database");
    expect(Array.isArray(faq?.mainEntity) && (faq?.mainEntity as unknown[]).length).toBeGreaterThan(0);
  });
});

test.describe("public organisation pages", () => {
  const employer = process.env.E2E_PUBLIC_EMPLOYER_SLUG;
  const institution = process.env.E2E_PUBLIC_INSTITUTION_SLUG;
  test.skip(!employer || !institution, "Needs E2E_PUBLIC_EMPLOYER_SLUG / E2E_PUBLIC_INSTITUTION_SLUG (npm run db:seed:e2e)");

  test("a verified employer with its public page on is listed by name", async ({ page }) => {
    const response = await page.goto(`/employers/${employer}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Employer Co");
  });

  test("a verified institution with its public page on is listed by name", async ({ page }) => {
    const response = await page.goto(`/institutions/${institution}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Training Institute");
  });

  test("private, unverified and wrong-type organisations return 404", async ({ page }) => {
    for (const path of [
      "/employers/e2e-other-employer-co", // draft (unverified)
      "/institutions/e2e-other-training-institute", // verified, public page off
      "/employers/e2e-recruitment-partner", // a recruitment partner is not an employer page
      `/employers/${institution}`, // an institution slug under /employers
      `/institutions/${employer}`, // an employer slug under /institutions
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });
});

test.describe("keyboard", () => {
  test("the skip link is the first stop, is visible on focus and moves focus to the main content", async ({ page }) => {
    await page.goto("/");
    await settleForScan(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /skip to (main )?content/i });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await page.keyboard.press("Tab");
    // The next stop is inside the main content, not back in the header.
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#main-content")))).toBe(true);
  });

  test("header and form controls show a visible focus indicator", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop header; mobile uses the menu button");
    await page.goto("/employers/request");
    await settleForScan(page);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await focusIsVisible(page), `tab stop ${i + 1}`).toBe(true);
    }
    await page.getByLabel(/requirement title/i).focus();
    expect(await focusIsVisible(page), "requirement title input").toBe(true);
  });
});

test.describe("internal links", () => {
  test("every same-site link on the main public pages resolves", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Same links as desktop");
    test.setTimeout(300_000);
    const pages = ["/", "/about", "/services", "/industries", "/global-reach", "/employers", "/candidates", "/partners", "/institutions", "/jobs", "/training", "/contact", "/safe-recruitment", "/legal/privacy-policy"];
    const links = new Set<string>();
    for (const path of pages) {
      await page.goto(path);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        if (!href.startsWith("/") || href.startsWith("//")) continue;
        const clean = href.split("#")[0]!;
        if (clean && clean !== "/sign-out") links.add(clean);
      }
    }
    const broken: string[] = [];
    for (const href of links) {
      const response = await request.get(href, { maxRedirects: 5 });
      if (response.status() >= 400) broken.push(`${response.status()} ${href}`);
    }
    expect(broken, `checked ${links.size} links`).toEqual([]);
  });
});

test.describe("honest numbers", () => {
  // Public figures may only come from approved public metrics with an "as of" date (CONVENTIONS rule 1).
  for (const path of ["/", "/about", "/employers", "/candidates", "/partners", "/institutions", "/global-reach", "/industries", "/services"]) {
    test(`${path} makes no unattributed numeric claims`, async ({ page }) => {
      await page.goto(path);
      const text = await page.locator("main#main-content").evaluate((main) => {
        const clone = main.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-testid="home-metrics"], script, style').forEach((el) => el.remove());
        return clone.innerText;
      });
      expect(text).not.toMatch(/\b\d[\d,.]*\s*(\+|%|k\+|lakh|crore)(?=\s|$)/i);
    });
  }
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

/**
 * QA walk (Stage 3): every marketing / discovery route renders without errors, has exactly one h1, passes the
 * automated WCAG A/AA scan (serious + critical) and has no horizontal scroll at 360px. Detail pages use the
 * entries the E2E seed publishes (`npm run db:seed:e2e`).
 */
const MARKETING_ROUTES: (string | undefined)[] = [
  "/",
  "/about",
  "/services",
  "/services/welding-and-industrial-testing",
  "/industries",
  "/industries/e2e-test-industry",
  "/global-reach",
  "/global-reach/e2e-test-destination",
  "/employers",
  "/employers/request",
  "/candidates",
  "/partners",
  "/institutions",
  "/jobs",
  process.env.E2E_EMPLOYER_JOB_SLUG && `/jobs/${process.env.E2E_EMPLOYER_JOB_SLUG}`,
  process.env.E2E_EMPLOYER_OVERSEAS_JOB_SLUG && `/jobs/${process.env.E2E_EMPLOYER_OVERSEAS_JOB_SLUG}`,
  "/training",
  "/training/e2e-welding-basics-test-course",
  "/verify-certificate",
  process.env.E2E_PUBLIC_EMPLOYER_SLUG && `/employers/${process.env.E2E_PUBLIC_EMPLOYER_SLUG}`,
  process.env.E2E_PUBLIC_INSTITUTION_SLUG && `/institutions/${process.env.E2E_PUBLIC_INSTITUTION_SLUG}`,
];

test.describe("marketing route quality", () => {
  for (const path of MARKETING_ROUTES.filter((p): p is string => Boolean(p))) {
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
