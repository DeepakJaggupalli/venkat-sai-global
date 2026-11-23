import { describe, expect, it } from "vitest";

import { buildRequirementJobPosting, parseSalary, posterBaseSalary, type JobPostingPoster } from "./job-posting";

const site = { name: "Venkat Sai Welding Works and Testing Center", url: "https://example.org/", logo: "https://example.org/icon" };
const now = new Date("2026-11-20T10:00:00Z");
const base: JobPostingPoster = {
  title: "Welders for Riyadh",
  summary: null,
  description: "Shutdown project.\nTwo-year contract.",
  countryCode: "SA",
  companyName: null,
  trades: [
    { trade: "TIG Welder", pay: "1500 SAR" },
    { trade: "Helper <b>", pay: "900 SAR" },
  ],
  benefits: ["Free accommodation"],
  applyBy: null,
  publishedAt: new Date("2026-11-15T08:00:00Z"),
};

describe("requirement JobPosting JSON-LD", () => {
  it("has the fields Google requires", () => {
    const ld = buildRequirementJobPosting(base, { url: "https://example.org/requirements/x", site, now })!;
    expect(ld).toMatchObject({
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: "Welders for Riyadh",
      url: "https://example.org/requirements/x",
      datePosted: "2026-11-15T08:00:00.000Z",
      validThrough: "2026-12-15T08:00:00.000Z",
      employmentType: "FULL_TIME",
      directApply: false,
      hiringOrganization: { "@type": "Organization", name: site.name, sameAs: site.url, logo: site.logo },
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "SA" } },
      baseSalary: { "@type": "MonetaryAmount", currency: "SAR", value: { "@type": "QuantitativeValue", unitText: "MONTH", minValue: 900, maxValue: 1500 } },
    });
    expect(ld.description).toContain("<li>TIG Welder - 1500 SAR</li>");
    expect(ld.description).toContain("Helper &lt;b&gt;");
    expect(ld.description).toContain("Shutdown project.<br>Two-year contract.");
  });

  it("uses the company and apply-by date when given, and is omitted once expired", () => {
    const ld = buildRequirementJobPosting({ ...base, companyName: "Acme Contracting", applyBy: "2026-12-01" }, { url: "u", site, now })!;
    expect(ld.hiringOrganization).toEqual({ "@type": "Organization", name: "Acme Contracting" });
    expect(ld.validThrough).toBe("2026-12-01");
    expect(buildRequirementJobPosting({ ...base, applyBy: "2026-11-01" }, { url: "u", site, now })).toBeNull();
    expect(buildRequirementJobPosting({ ...base, publishedAt: new Date("2026-10-01T00:00:00Z") }, { url: "u", site, now })).toBeNull();
    expect(buildRequirementJobPosting({ ...base, description: "Part-time driver" }, { url: "u", site, now })?.employmentType).toBe("PART_TIME");
  });

  it("adds baseSalary only when every salary is a clear amount with one currency", () => {
    expect(parseSalary("AED 900 - 1,200")).toEqual({ min: 900, max: 1200, currency: "AED", unit: "MONTH" });
    expect(parseSalary("45 QAR per day")).toEqual({ min: 45, max: 45, currency: "QAR", unit: "DAY" });
    expect(parseSalary("900 + food allowance 350 AED")).toBeNull();
    expect(parseSalary("1500")).toBeNull();
    expect(parseSalary("1500 XYZ")).toBeNull();
    expect(posterBaseSalary([{ trade: "A", pay: "1500 SAR" }, { trade: "B", pay: "900 AED" }])).toBeNull();
    expect(posterBaseSalary([{ trade: "A", pay: "1500 SAR" }, { trade: "B", pay: "900 + food SAR" }])).toBeNull();
    expect(posterBaseSalary([{ trade: "A", pay: "1500 SAR" }, { trade: "B", pay: null }])).toEqual({
      "@type": "MonetaryAmount",
      currency: "SAR",
      value: { "@type": "QuantitativeValue", unitText: "MONTH", value: 1500 },
    });
    const noCountry = buildRequirementJobPosting({ ...base, countryCode: null, trades: [{ trade: "Cook", pay: "900 + tips" }] }, { url: "u", site, now })!;
    expect(noCountry.baseSalary).toBeUndefined();
    expect(noCountry.jobLocation).toBeUndefined();
  });
});
