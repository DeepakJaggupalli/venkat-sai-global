import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES } from "@/config/permissions";
import { MARKET_REGIONS, SKILL_CATEGORIES } from "@/db/schema/_constants";
import { currencyMinorUnits } from "@/lib/format";

// The seed modules import the shared pool; creating a Pool does not connect, but it needs a URL.
process.env.DATABASE_URL ??= "postgres://unit:unit@127.0.0.1:1/unit_tests_no_connection";
const { countrySeedData, DEFAULT_DESTINATIONS, marketRegionFor } = await import("./countries");
const { currencySeedData } = await import("./currencies");
const { EDUCATION_LEVELS, QUALIFICATION_TYPES } = await import("./education");
const { INDIA_STATES } = await import("./india-states");
const { INDUSTRIES } = await import("./industries");
const { JOB_CATEGORIES } = await import("./job-categories");
const { languageSeedData } = await import("./languages");
const { skillSeedData } = await import("./skills");

describe("reference seed data", () => {
  const currencies = currencySeedData();
  const currencyCodes = new Set(currencies.map((c) => c.code));
  const countries = countrySeedData(currencyCodes);

  it("includes active ISO 4217 currencies only, with minor units consistent with formatMoney", () => {
    expect(currencies.length).toBeGreaterThan(140);
    for (const code of ["INR", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "USD", "EUR", "GBP", "JPY", "SGD", "MYR"]) expect(currencyCodes.has(code)).toBe(true);
    for (const code of ["XAU", "XXX", "XTS", "SLL", "USS", "CHE"]) expect(currencyCodes.has(code)).toBe(false);
    for (const c of currencies) expect(c.minorUnits).toBe(currencyMinorUnits(c.code));
    expect(currencies.find((c) => c.code === "KWD")?.minorUnits).toBe(3);
    expect(currencies.find((c) => c.code === "JPY")?.minorUnits).toBe(0);
  });

  it("covers every ISO 3166-1 country with a valid currency reference and market region", () => {
    expect(countries.length).toBeGreaterThanOrEqual(249);
    expect(new Set(countries.map((c) => c.code)).size).toBe(countries.length);
    for (const c of countries) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      if (c.currencyCode) expect(currencyCodes.has(c.currencyCode)).toBe(true);
      if (c.marketRegion) expect(MARKET_REGIONS).toContain(c.marketRegion);
    }
    const byCode = new Map(countries.map((c) => [c.code, c]));
    expect(byCode.get("IN")).toMatchObject({ marketRegion: "india", currencyCode: "INR", iso3: "IND", phoneCode: "+91" });
    for (const gcc of ["AE", "SA", "QA", "KW", "BH", "OM"]) expect(byCode.get(gcc)).toMatchObject({ marketRegion: "gcc", isDestination: true });
    expect(byCode.get("XK")?.phoneCode).toBe("+383");
    expect(marketRegionFor({ iso2: "MX", continent: "NA" })).toBe("latin_america");
    expect(marketRegionFor({ iso2: "CA", continent: "NA" })).toBe("north_america");
    expect(marketRegionFor({ iso2: "JO", continent: "AS" })).toBe("middle_east");
    expect(marketRegionFor({ iso2: "AQ", continent: "AN" })).toBeNull();
    for (const code of DEFAULT_DESTINATIONS) expect(byCode.has(code)).toBe(true);
  });

  it("lists India's 28 states and 8 union territories", () => {
    expect(INDIA_STATES).toHaveLength(36);
    expect(INDIA_STATES.filter((s) => s.kind === "state")).toHaveLength(28);
    expect(INDIA_STATES.filter((s) => s.kind === "union_territory")).toHaveLength(8);
    expect(INDIA_STATES.map((s) => s.name)).toEqual(expect.arrayContaining(["Andhra Pradesh", "Telangana", "Odisha", "Puducherry", "Ladakh", "Dadra and Nagar Haveli and Daman and Diu"]));
  });

  it("includes the required languages with English, Hindi and Telugu as UI locales", () => {
    const langs = languageSeedData();
    const codes = langs.map((l) => l.code);
    for (const code of ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "or", "ur", "as", "ar", "fr", "de", "es", "pt", "ru", "ja", "zh", "ko", "it", "nl", "pl", "ro", "tl", "ne", "si", "ms", "id", "th", "vi", "tr"]) {
      expect(codes).toContain(code);
    }
    expect(langs.filter((l) => l.isUiLocale).map((l) => l.code).sort()).toEqual(["en", "hi", "te"]);
  });

  it("has the 20 industries and job categories that reference them", () => {
    expect(INDUSTRIES).toHaveLength(20);
    const slugs = new Set(INDUSTRIES.map((i) => i.slug));
    expect(JOB_CATEGORIES.length).toBeGreaterThanOrEqual(70);
    for (const c of JOB_CATEGORIES) expect(slugs.has(c.industry)).toBe(true);
    expect(new Set(JOB_CATEGORIES.map((c) => c.slug)).size).toBe(JOB_CATEGORIES.length);
  });

  it("has unique, slugged skills across every category", () => {
    const skills = skillSeedData();
    expect(skills.length).toBeGreaterThanOrEqual(250);
    for (const category of SKILL_CATEGORIES) expect(skills.some((s) => s.category === category)).toBe(true);
    for (const s of skills) expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const names = skills.map((s) => s.name);
    for (const required of ["6G pipe welding", "6GR pipe welding (restricted access)", "Ultrasonic testing (UT)", "Permit to work", "AutoCAD", "Primavera P6", "Tally", "Python"]) {
      expect(names).toContain(required);
    }
  });

  it("orders education levels by rank and covers the qualification types", () => {
    const ranks = EDUCATION_LEVELS.map((l) => l.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(EDUCATION_LEVELS).toHaveLength(9);
    expect(QUALIFICATION_TYPES.map((q) => q.name)).toEqual(expect.arrayContaining(["ITI (NCVT)", "ITI (SCVT)", "NDT certification", "Other"]));
  });

  it("seeds a Super Admin role among the default roles", () => {
    expect(DEFAULT_ROLES.some((r) => r.scope === "platform" && r.key === "super_admin")).toBe(true);
  });
});
