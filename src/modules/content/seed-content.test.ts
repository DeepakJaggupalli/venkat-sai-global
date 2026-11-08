import { describe, expect, it, vi } from "vitest";

// The seed builders import reference data whose module creates the (lazy) database pool; nothing connects.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

const { validateCollectionData } = await import("./collections");
const { buildDestinationSeeds, buildFaqSeeds, buildIndustrySeeds } = await import("./seed-content/catalogue");
const { buildLegalPageSeeds, LEGAL_VERSION } = await import("./seed-content/legal");
const { buildServiceSeeds, FEATURED_SERVICE_SLUGS } = await import("./seed-content/services");
const { TRAINING_FAMILIES } = await import("./seed-content/training");
const { CONTACT } = await import("@/config/contact");
const { isAllowedMapEmbedUrl } = await import("./embeds");
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

  it("seeds the 18 services and the training families with the agreed publication split", () => {
    const services = buildServiceSeeds();
    expect(services).toHaveLength(18 + TRAINING_FAMILIES.length);
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
        ...TRAINING_FAMILIES.map((f) => f.slug),
      ].sort(),
    );
  });

  it("features exactly the three main services, first and in order", () => {
    const services = buildServiceSeeds();
    expect(services.filter((s) => s.isFeatured).map((s) => s.slug)).toEqual([...FEATURED_SERVICE_SLUGS]);
    expect(services.slice(0, 3).map((s) => s.slug)).toEqual([...FEATURED_SERVICE_SLUGS]);
    const orders = services.map((s) => s.sortOrder ?? 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("tags the training hub and course families, and keeps candidate copy free of guarantees and fees", () => {
    const services = buildServiceSeeds();
    expect(services.filter((s) => s.tags?.includes("training-hub")).map((s) => s.slug)).toEqual(["technical-training"]);
    expect(services.filter((s) => s.tags?.includes("training-course")).map((s) => s.slug)).toEqual(TRAINING_FAMILIES.map((f) => f.slug));
    const overseas = services.find((s) => s.slug === "overseas-employment")!;
    expect(JSON.stringify(overseas.data)).toMatch(/depend on the trade and the employer/i);
    expect(overseas.data.cta).toEqual({ label: "Send your CV and trade", href: "/send-cv" });
    const text = JSON.stringify(services.filter((s) => s.publish).map((s) => s.data));
    expect(text).not.toMatch(/\b(we|will) guarantee|guaranteed placement|100%/i);
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
    const header = PUBLIC_NAV.map((item) => {
      const children = (item as { children?: readonly { title: string; href: string }[] }).children;
      return { title: item.title, href: item.href, ...(children ? { children: children.map((child) => ({ title: child.title, href: child.href })) } : {}) };
    });
    expect(NAVIGATION_SEED.data.headerItems).toEqual(header);
    const footer = DEFAULT_FOOTER_COLUMNS.map((column) => ({ title: column.title, links: column.links.map((l) => ({ title: l.title, href: l.href })) }));
    expect(NAVIGATION_SEED.data.footerColumns).toEqual(footer);
  });

  it("seeds the business contact details and uses the specification's hero copy", () => {
    expect(SITE_SETTINGS_SEED.data.contact).toEqual({
      phone: "+919494263388",
      email: "vsweld@gmail.com",
      whatsappNumber: "+919494263388",
      address: "B-Block, Plot D-6, Autonagar, Gajuwaka, Visakhapatnam, Andhra Pradesh 530012",
      mapEmbedUrl: CONTACT.maps.embedUrl,
    });
    expect(isAllowedMapEmbedUrl(CONTACT.maps.embedUrl)).toBe(true);
    expect(SITE_SETTINGS_SEED.data).not.toHaveProperty("grievanceOfficer");
    const hero = HOMEPAGE_SEED.data.hero as Record<string, { label: string; href: string } | string>;
    expect(hero.heading).toBe("Skilled hands from Vizag to the world");
    expect(hero.primaryCta).toEqual({ label: "Explore jobs", href: "/jobs" });
    expect(hero.secondaryCta).toEqual({ label: "Send your CV", href: "/send-cv" });
    expect(hero).not.toHaveProperty("tertiaryCta");
  });

  it("contains no numbers that could read as statistics in published copy", () => {
    const published = all.filter((s) => s.publish && s.collection !== "pages");
    const text = JSON.stringify(published.map((s) => s.data));
    // Years, versions and the WCAG level aside, published marketing copy has no figures.
    expect(text.replace(/2026-11-01|WCAG 2\.2|1983|18|2023/g, "")).not.toMatch(/\b\d{2,}\+?\s*(candidates|placements|clients|employers|years|countries|workers|%)/i);
  });
});
