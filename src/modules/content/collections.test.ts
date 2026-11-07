import { describe, expect, it } from "vitest";

import { CMS_CONSENT_REQUIRED_COLLECTIONS } from "@/db/schema";

import {
  COLLECTIONS,
  collectionDataSchema,
  describeAllCollections,
  describeCollection,
  fixedSlugFor,
  ICON_NAMES,
  publicPathFor,
  validateCollectionData,
} from "./collections";
import { CMS_COLLECTION_VALUES } from "./constants";

const service = {
  overview: "<p>What the service is.</p>",
  enquiryType: "employer",
};

const destinationGuidance = {
  reviewedAt: "2026-10-01",
  reviewedBy: "Operations manager",
  sources: [{ title: "Ministry of Human Resources", url: "https://www.example.gov.ae/guidance" }],
  disclaimer: "General information only.",
};

describe("collection registry", () => {
  it("defines every CMS collection with a matching key and a serialisable descriptor", () => {
    expect(Object.keys(COLLECTIONS).sort()).toEqual([...CMS_COLLECTION_VALUES].sort());
    for (const key of CMS_COLLECTION_VALUES) {
      expect(COLLECTIONS[key].key).toBe(key);
      const descriptor = describeCollection(key);
      expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
      expect(descriptor.fields.length).toBeGreaterThan(0);
      for (const f of descriptor.fields) expect(f.name).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
    }
    expect(describeAllCollections().at(-1)?.singleton).toBe(true);
  });

  it("marks exactly the schema's consent-required collections and gives them approval types where expected", () => {
    const consent = CMS_COLLECTION_VALUES.filter((key) => COLLECTIONS[key].consentRequired);
    expect(consent.sort()).toEqual([...CMS_CONSENT_REQUIRED_COLLECTIONS].sort());
    expect(COLLECTIONS.testimonials.approvalType).toBe("testimonial");
    expect(COLLECTIONS.case_studies.approvalType).toBe("case_study");
  });

  it("knows the fixed singleton slugs and public paths", () => {
    expect(fixedSlugFor("site_settings")).toBe("site-settings");
    expect(fixedSlugFor("about")).toBe("about");
    expect(fixedSlugFor("services")).toBeNull();
    expect(publicPathFor("services", "overseas-employment")).toBe("/services/overseas-employment");
    expect(publicPathFor("pages", "privacy-policy")).toBe("/legal/privacy-policy");
    expect(publicPathFor("pages", "grievance-redressal")).toBe("/grievance");
    expect(publicPathFor("pages", "how-it-works")).toBe("/how-it-works");
    expect(publicPathFor("testimonials", "x")).toBeNull();
    expect(publicPathFor("destinations", "qatar")).toBe("/global-reach/qatar");
  });

  it("only offers icon names in kebab-case", () => {
    for (const icon of ICON_NAMES) expect(icon).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("draft vs publish validation", () => {
  it("lets incomplete drafts be saved but blocks publishing until required fields are filled", () => {
    expect(validateCollectionData("services", {}, "draft").ok).toBe(true);
    const result = validateCollectionData("services", { benefits: ["Fast"] }, "publish");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["data.overview"]?.[0]).toMatch(/required to publish/);
      expect(result.fieldErrors["data.enquiryType"]).toBeDefined();
    }
    expect(validateCollectionData("services", service, "publish").ok).toBe(true);
  });

  it("treats empty rich text as missing when publishing", () => {
    const result = validateCollectionData("services", { ...service, overview: "<p> </p>" }, "publish");
    expect(result.ok).toBe(false);
  });

  it("strips unknown keys and blank values, and ignores untouched optional fieldsets", () => {
    const result = validateCollectionData(
      "services",
      { ...service, unknown: "x", iconName: "", cta: { label: "", href: "" }, benefits: ["  Clear terms ", ""] },
      "publish",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).not.toHaveProperty("unknown");
      expect(result.data).not.toHaveProperty("iconName");
      expect(result.data).not.toHaveProperty("cta");
      expect(result.data.benefits).toEqual(["Clear terms"]);
    }
  });

  it("validates nested list items and reports their paths", () => {
    const result = validateCollectionData("services", { ...service, faqs: [{ question: "Is it free?" }] }, "publish");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors)).toContain("data.faqs.0.answer");
    expect(validateCollectionData("services", { faqs: [{ question: "Is it free?" }] }, "draft").ok).toBe(true);
  });

  it("checks selects, numbers and dates", () => {
    expect(validateCollectionData("services", { ...service, enquiryType: "sales" }, "draft").ok).toBe(false);
    expect(validateCollectionData("case_studies", { positions: [{ role: "Welder", count: "12" }] }, "draft")).toMatchObject({
      ok: true,
      data: { positions: [{ role: "Welder", count: 12 }] },
    });
    expect(validateCollectionData("case_studies", { positions: [{ role: "Welder", count: 0 }] }, "draft").ok).toBe(false);
    expect(validateCollectionData("pages", { effectiveDate: "2026-02-30" }, "draft").ok).toBe(false);
  });
});

describe("links and embeds in data", () => {
  it("normalises YouTube / Vimeo links and rejects other video hosts", () => {
    const yt = validateCollectionData("videos", { embedUrl: "https://youtu.be/dQw4w9WgXcQ" }, "publish");
    expect(yt).toMatchObject({ ok: true, data: { embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" } });
    const vimeo = validateCollectionData("videos", { embedUrl: "https://vimeo.com/123456789" }, "publish");
    expect(vimeo).toMatchObject({ ok: true, data: { embedUrl: "https://player.vimeo.com/video/123456789" } });
    expect(validateCollectionData("videos", { embedUrl: "https://example.com/video.mp4" }, "publish").ok).toBe(false);
  });

  it("accepts site paths only where allowed and never script URLs", () => {
    const cta = (href: string) => validateCollectionData("services", { ...service, cta: { label: "Go", href } }, "publish").ok;
    expect(cta("/jobs?overseas=1")).toBe(true);
    expect(cta("https://example.com/page")).toBe(true);
    expect(cta("javascript:alert(1)")).toBe(false);
    expect(cta("//evil.example")).toBe(false);
    expect(validateCollectionData("team_members", { linkedinUrl: "/relative" }, "draft").ok).toBe(false);
  });

  it("accepts only Google Maps / OpenStreetMap embeds for the map", () => {
    const ok = validateCollectionData("site_settings", { contact: { mapEmbedUrl: "https://www.google.com/maps/embed?pb=abc" } }, "draft");
    expect(ok.ok).toBe(true);
    const bad = validateCollectionData("site_settings", { contact: { mapEmbedUrl: "https://maps.example.com/embed" } }, "draft");
    expect(bad.ok).toBe(false);
  });

  it("validates emails and phone numbers but keeps the phone format as typed", () => {
    const result = validateCollectionData("site_settings", { contact: { email: " Hello@Example.com ", phone: "+91 891 255 5555" } }, "draft");
    expect(result).toMatchObject({ ok: true, data: { contact: { email: "hello@example.com", phone: "+91 891 255 5555" } } });
    expect(validateCollectionData("site_settings", { contact: { phone: "12" } }, "draft").ok).toBe(false);
  });
});

describe("collection rules", () => {
  it("requires reviewed, sourced guidance before a destination is published", () => {
    const base = { countryCode: "ae", region: "gcc" };
    const draft = validateCollectionData("destinations", { ...base, guidance: { sources: [], disclaimer: "General information only." } }, "draft");
    expect(draft).toMatchObject({ ok: true, data: { countryCode: "AE" } });
    const unreviewed = validateCollectionData("destinations", { ...base, guidance: { sources: [], disclaimer: "General information only." } }, "publish");
    expect(unreviewed.ok).toBe(false);
    if (!unreviewed.ok) {
      expect(Object.keys(unreviewed.fieldErrors)).toEqual(expect.arrayContaining(["data.guidance.reviewedAt", "data.guidance.reviewedBy", "data.guidance.sources"]));
    }
    expect(validateCollectionData("destinations", { ...base, guidance: destinationGuidance }, "publish").ok).toBe(true);
    const future = validateCollectionData("destinations", { ...base, guidance: { ...destinationGuidance, reviewedAt: "2999-01-01" } }, "publish");
    expect(future.ok).toBe(false);
  });

  it("checks event schedules and venue / joining details", () => {
    const event = { eventType: "job_fair", description: "<p>Hiring event.</p>", startsAt: "2027-01-10T10:00:00+05:30", format: "in_person" };
    expect(validateCollectionData("events", { ...event, endsAt: "2027-01-10T09:00:00+05:30" }, "draft").ok).toBe(false);
    expect(validateCollectionData("events", event, "publish").ok).toBe(false);
    expect(validateCollectionData("events", { ...event, venue: { name: "Hall A", city: "Visakhapatnam" } }, "publish").ok).toBe(true);
    expect(validateCollectionData("events", { ...event, format: "online" }, "publish").ok).toBe(false);
    expect(validateCollectionData("events", { ...event, format: "online", onlineUrl: "https://meet.example.com/x" }, "publish").ok).toBe(true);
    expect(validateCollectionData("events", { ...event, timezone: "Mars/Olympus" }, "draft").ok).toBe(false);
  });

  it("requires internal evidence for placement announcements", () => {
    const news = { category: "placement_announcement", body: "<p>Placed.</p>" };
    expect(validateCollectionData("news", news, "draft").ok).toBe(true);
    expect(validateCollectionData("news", news, "publish").ok).toBe(false);
    expect(validateCollectionData("news", { ...news, evidenceNote: "Placement records in the ops folder." }, "publish").ok).toBe(true);
  });

  it("rejects duplicate homepage sections", () => {
    const hero = { heading: "Hello" };
    const result = validateCollectionData("homepage", { hero, sections: [{ key: "services", visible: true }, { key: "services", visible: false }] }, "publish");
    expect(result.ok).toBe(false);
  });

  it("drops internal fields from the public schema", () => {
    const parsed = collectionDataSchema("pages", "publish", { omitInternal: true }).parse({
      pageType: "legal",
      body: "<p>Text</p>",
      version: "2026-11-01",
      effectiveDate: "2026-11-01",
      internalNote: "Legal review required",
    });
    expect(parsed).not.toHaveProperty("internalNote");
  });
});
