import { describe, expect, it } from "vitest";

import { buildJobPostingJsonLd, serializeJsonLd } from "./structured-data";
import type { PublicJobDetail } from "./types";

function detail(overrides: Partial<PublicJobDetail> = {}): PublicJobDetail {
  return {
    id: "job-1",
    code: "VSG-JOB-000123",
    slug: "pipe-welder-doha-000123",
    title: "Pipe welder (6G)",
    summary: "Shop and site welding for a refinery project.",
    employer: {
      confidential: false,
      name: "Gulf Fabrication LLC",
      organizationId: "org-1",
      slug: "gulf-fabrication",
      logoUrl: "/media/logo-1/logo.png",
      logoThumbnailUrl: null,
      verified: true,
      managedByVenkatSai: false,
      hasPublicPage: true,
    },
    category: { id: "cat", name: "Welding" },
    location: { countryCode: "QA", countryName: "Qatar", stateRegion: null, city: "Doha", extraLocations: 0 },
    isOverseas: true,
    employmentType: "full_time",
    workMode: "on_site",
    experienceLevel: "mid",
    experienceMinYears: 3,
    experienceMaxYears: 8,
    salary: { minMinor: 250_000, maxMinor: 320_000, currency: "QAR", period: "month" },
    benefits: ["Accommodation"],
    accommodationProvided: true,
    foodProvided: null,
    transportProvided: true,
    visaSponsorship: "provided",
    openings: 12,
    skills: ["GTAW", "SMAW"],
    publishedAt: new Date("2026-11-01T06:00:00Z"),
    applicationDeadline: new Date("2026-12-31T18:29:59.999Z"),
    expiresAt: new Date("2027-01-15T18:29:59.999Z"),
    closesAt: new Date("2026-12-31T18:29:59.999Z"),
    isFeatured: false,
    infoSource: "employer_supplied",
    verifiedEmployer: true,
    applyMode: "platform",
    status: "published",
    displayStatus: "published",
    viewCount: null,
    applicationCount: null,
    organizationName: null,
    isSaved: null,
    hasApplied: null,
    descriptionHtml: "<p>Weld carbon steel pipe to <strong>ASME IX</strong> procedures.</p>",
    responsibilities: "Fit-up\nRoot and cap passes",
    qualificationsText: "ITI welder or equivalent <experience>",
    industry: { id: "ind", name: "Oil and gas" },
    minEducationLevel: null,
    sponsorshipDetails: null,
    contractDurationMonths: 24,
    workingHours: "10 hours, 6 days",
    recruitmentProcess: "Trade test at Visakhapatnam",
    startDate: null,
    externalApplyUrl: null,
    screeningRequired: false,
    screeningQuestions: [],
    locations: [],
    skillDetails: [
      { id: "s1", name: "GTAW", isRequired: true, minYears: 2 },
      { id: "s2", name: "SMAW", isRequired: true, minYears: null },
    ],
    recruitingAgent: null,
    employerProfile: { about: null, website: "https://gulf-fab.example", country: "QA", industry: "Oil and gas" },
    ...overrides,
  };
}

const URL = "https://venkatsai.example/jobs/pipe-welder-doha-000123";

describe("buildJobPostingJsonLd", () => {
  it("builds a Google JobPosting with the required properties", () => {
    const data = buildJobPostingJsonLd(detail(), { url: URL });
    expect(data).toMatchObject({
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: "Pipe welder (6G)",
      datePosted: "2026-11-01T06:00:00.000Z",
      validThrough: "2026-12-31T18:29:59.999Z",
      employmentType: "FULL_TIME",
      directApply: true,
      identifier: { "@type": "PropertyValue", name: "Venkat Sai Global", value: "VSG-JOB-000123" },
      hiringOrganization: { "@type": "Organization", name: "Gulf Fabrication LLC", sameAs: "https://gulf-fab.example", logo: "/media/logo-1/logo.png" },
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Doha", addressCountry: "QA" } },
      baseSalary: { "@type": "MonetaryAmount", currency: "QAR", value: { "@type": "QuantitativeValue", minValue: 2500, maxValue: 3200, unitText: "MONTH" } },
      experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: 36 },
      totalJobOpenings: 12,
    });
    expect(String(data.description)).toContain("<h3>Responsibilities</h3><p>Fit-up<br>Root and cap passes</p>");
    // Plain-text fields are escaped before they become HTML.
    expect(String(data.description)).toContain("ITI welder or equivalent &lt;experience&gt;");
  });

  it("omits the salary when it is not public or the period has no Google unit", () => {
    expect(buildJobPostingJsonLd(detail({ salary: null }), { url: URL }).baseSalary).toBeUndefined();
    expect(buildJobPostingJsonLd(detail({ salary: { minMinor: 1_000_000, maxMinor: null, currency: "INR", period: "project" } }), { url: URL }).baseSalary).toBeUndefined();
    const single = buildJobPostingJsonLd(detail({ salary: { minMinor: 3_000_000, maxMinor: null, currency: "INR", period: "year" } }), { url: URL }).baseSalary as Record<string, unknown>;
    expect(single).toEqual({ "@type": "MonetaryAmount", currency: "INR", value: { "@type": "QuantitativeValue", unitText: "YEAR", value: 30000 } });
  });

  it("uses minor units of three-decimal currencies correctly", () => {
    const data = buildJobPostingJsonLd(detail({ salary: { minMinor: 350_000, maxMinor: 350_000, currency: "KWD", period: "month" } }), { url: URL });
    expect((data.baseSalary as { value: { value: number } }).value.value).toBe(350);
  });

  it("describes remote jobs with TELECOMMUTE and the applicant country", () => {
    const data = buildJobPostingJsonLd(detail({ workMode: "remote", location: { countryCode: "IN", countryName: "India", stateRegion: null, city: null, extraLocations: 0 } }), { url: URL });
    expect(data.jobLocationType).toBe("TELECOMMUTE");
    expect(data.applicantLocationRequirements).toEqual({ "@type": "Country", name: "India" });
    expect(data.jobLocation).toBeUndefined();
  });

  it("lists every location of a multi-location job", () => {
    const data = buildJobPostingJsonLd(detail({ locations: [{ countryCode: "AE", countryName: "United Arab Emirates", stateRegion: null, city: "Abu Dhabi", openings: 4 }] }), { url: URL });
    expect(Array.isArray(data.jobLocation)).toBe(true);
    expect((data.jobLocation as unknown[]).length).toBe(2);
  });

  it("never exposes the hidden organisation of a confidential job", () => {
    const data = buildJobPostingJsonLd(
      detail({
        employer: { confidential: true, name: "EPC contractor, Qatar", organizationId: null, slug: null, logoUrl: null, logoThumbnailUrl: null, verified: false, managedByVenkatSai: true, hasPublicPage: false },
        employerProfile: null,
      }),
      { url: URL },
    );
    expect(data.hiringOrganization).toEqual({ "@type": "Organization", name: "EPC contractor, Qatar" });
  });

  it("maps every employment type", () => {
    expect(buildJobPostingJsonLd(detail({ employmentType: "internship" }), { url: URL }).employmentType).toBe("INTERN");
    expect(buildJobPostingJsonLd(detail({ employmentType: "contract" }), { url: URL }).employmentType).toBe("CONTRACTOR");
    expect(buildJobPostingJsonLd(detail({ employmentType: "apprenticeship" }), { url: URL }).employmentType).toBe("OTHER");
  });
});

describe("serializeJsonLd", () => {
  it("cannot be used to break out of the script element", () => {
    const json = serializeJsonLd({ title: "</script><script>alert(1)</script> & more" });
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
    expect(JSON.parse(json)).toEqual({ title: "</script><script>alert(1)</script> & more" });
  });
});
