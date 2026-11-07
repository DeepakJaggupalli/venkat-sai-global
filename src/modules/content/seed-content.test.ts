import { describe, expect, it, vi } from "vitest";

// The seed builders import reference data whose module creates the (lazy) database pool; nothing connects.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

const { validateCollectionData } = await import("./collections");
const { buildDestinationSeeds, buildFaqSeeds, buildIndustrySeeds } = await import("./seed-content/catalogue");
const { buildLegalPageSeeds, LEGAL_VERSION } = await import("./seed-content/legal");
const { buildServiceSeeds } = await import("./seed-content/services");
const { ABOUT_SEED, HOMEPAGE_SEED, NAVIGATION_SEED, SITE_SETTINGS_SEED } = await import("./seed-content/site");
const { PUBLIC_NAV } = await import("@/config/navigation");
const { DEFAULT_FOOTER_COLUMNS } = await import("@/components/layout/public-nav");
type SeedEntrySpec = import("./seed-content/types").SeedEntrySpec;

const lookups = {
  industryIdBySlug: new Map([["construction", "6c1f6f1e-0f4e-4f0e-9a8e-1b2c3d4e5f60"]]),
  languageCodes: new Set(["ar", "en"]),
  serviceIdBySlug: new Map([["overseas-employment", "0b6b3c66-8f5a-4b7e-9c61-1f2e3d4c5b6a"]]),
};

const all: SeedEntrySpec[] = [
  SITE_SETTINGS_SEED,
  HOMEPAGE_SEED,
  NAVIGATION_SEED,
  ABOUT_SEED,
  ...buildServiceSeeds(),
  ...buildLegalPageSeeds(),
  ...buildFaqSeeds(),
  ...buildIndustrySeeds(lookups),
  ...buildDestinationSeeds(lookups),
];

describe("content seed", () => {
  it("validates every seeded entry (publish rules for published ones)", () => {
    for (const spec of all) {
      const result = validateCollectionData(spec.collection, spec.data, spec.publish ? "publish" : "draft");
      expect(result, `${spec.collection}/${spec.slug}`).toMatchObject({ ok: true });
      for (const draft of spec.draftVersions ?? []) expect(validateCollectionData(spec.collection, draft.data, "draft").ok).toBe(true);
    }
  });

  it("has unique slugs per collection", () => {
    const keys = all.map((s) => `${s.collection}/${s.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("seeds the 18 services with the agreed publication split", () => {
    const services = buildServiceSeeds();
    expect(services).toHaveLength(18);
    expect(services.filter((s) => s.publish).map((s) => s.slug).sort()).toEqual(
      [
        "recruitment-and-placements",
        "overseas-employment",
        "domestic-hiring",
        "bulk-manpower-supply",
        "internships",
        "apprenticeships",
        "professional-training",
        "technical-training",
        "welding-and-industrial-testing",
        "skill-assessment",
        "career-development",
      ].sort(),
    );
  });

  it("keeps industries, destinations and FAQs as drafts and legal pages published with the policy version", () => {
    expect(buildIndustrySeeds(lookups)).toHaveLength(20);
    expect(buildIndustrySeeds(lookups).every((s) => !s.publish)).toBe(true);
    expect(buildDestinationSeeds(lookups).map((s) => s.data.countryCode)).toEqual(["AE", "SA", "QA", "KW", "OM", "BH"]);
    expect(buildDestinationSeeds(lookups).every((s) => !s.publish)).toBe(true);
    expect(buildFaqSeeds().every((s) => !s.publish)).toBe(true);
    const legal = buildLegalPageSeeds();
    expect(legal.map((s) => s.slug).sort()).toEqual(["accessibility", "cookie-policy", "data-rights", "disclaimers", "grievance-redressal", "privacy-policy", "terms"]);
    for (const page of legal) {
      expect(page.publish).toBe(true);
      expect(page.data).toMatchObject({ version: LEGAL_VERSION, effectiveDate: LEGAL_VERSION, pageType: "legal" });
      expect(String(page.data.internalNote)).toMatch(/legal counsel must review/i);
    }
  });

  it("publishes the About page with facts only; mission, vision and values wait in a draft version", () => {
    expect(ABOUT_SEED.publish).toBe(true);
    expect(ABOUT_SEED.data).not.toHaveProperty("mission");
    expect(ABOUT_SEED.data).not.toHaveProperty("values");
    expect(ABOUT_SEED.draftVersions?.[0]?.data).toHaveProperty("mission");
  });

  it("keeps the navigation defaults identical to PUBLIC_NAV and the default footer columns", () => {
    const header = PUBLIC_NAV.map((item) => ({
      title: item.title,
      href: item.href,
      ...("children" in item ? { children: item.children.map((child) => ({ title: child.title, href: child.href })) } : {}),
    }));
    expect(NAVIGATION_SEED.data.headerItems).toEqual(header);
    const footer = DEFAULT_FOOTER_COLUMNS.map((column) => ({ title: column.title, links: column.links.map((l) => ({ title: l.title, href: l.href })) }));
    expect(NAVIGATION_SEED.data.footerColumns).toEqual(footer);
  });

  it("leaves contact details empty and uses the specification's hero copy", () => {
    expect(SITE_SETTINGS_SEED.data).not.toHaveProperty("contact");
    expect(SITE_SETTINGS_SEED.data).not.toHaveProperty("grievanceOfficer");
    const hero = HOMEPAGE_SEED.data.hero as Record<string, { label: string; href: string } | string>;
    expect(hero.heading).toBe("Connecting Global Talent With Limitless Opportunities.");
    expect(hero.primaryCta).toEqual({ label: "Explore Opportunities", href: "/jobs" });
    expect(hero.secondaryCta).toEqual({ label: "Hire Through Venkat Sai", href: "/employers" });
    expect(hero.tertiaryCta).toEqual({ label: "Become a Partner", href: "/partners" });
  });

  it("contains no numbers that could read as statistics in published copy", () => {
    const published = all.filter((s) => s.publish && s.collection !== "pages");
    const text = JSON.stringify(published.map((s) => s.data));
    // Years, versions and the WCAG level aside, published marketing copy has no figures.
    expect(text.replace(/2026-11-01|WCAG 2\.2|1983|18|2023/g, "")).not.toMatch(/\b\d{2,}\+?\s*(candidates|placements|clients|employers|years|countries|workers|%)/i);
  });
});
