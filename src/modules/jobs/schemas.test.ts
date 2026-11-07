import { describe, expect, it } from "vitest";

import { jobAlertSchema, jobFormSchema, parseJobSearchParams, screeningQuestionSchema } from "./schemas";

const base = { title: "Pipe welder", countryCode: "qa", employmentType: "full_time", workMode: "on_site" };

describe("jobFormSchema", () => {
  it("accepts a minimal job and normalises codes and defaults", () => {
    const job = jobFormSchema.parse(base);
    expect(job).toMatchObject({ title: "Pipe welder", countryCode: "QA", openings: 1, applyMode: "platform", visaSponsorship: "not_applicable", salaryVisible: false });
    expect(job.accommodationProvided).toBeNull();
    expect(job.skills).toEqual([]);
  });

  it("validates salary ranges, currency and period", () => {
    const issues = (input: Record<string, unknown>) => jobFormSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(issues({ salaryMin: "3000", salaryMax: "2000", salaryCurrency: "QAR", salaryPeriod: "month" })).toContain("salaryMax");
    expect(issues({ salaryMin: "3000" })).toEqual(expect.arrayContaining(["salaryCurrency", "salaryPeriod"]));
    expect(issues({ salaryMin: "2000", salaryMax: "3000", salaryCurrency: "qar", salaryPeriod: "month" })).toEqual([]);
  });

  it("requires a country unless remote, a link for external applications and a description for confidential jobs", () => {
    const issues = (input: Record<string, unknown>) => jobFormSchema.safeParse({ title: "Welder", ...input }).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(issues({ workMode: "on_site" })).toContain("countryCode");
    expect(issues({ workMode: "remote" })).toEqual([]);
    expect(issues({ workMode: "remote", applyMode: "external_url" })).toContain("externalApplyUrl");
    expect(issues({ workMode: "remote", applyMode: "external_url", externalApplyUrl: "http://example.com/apply" })).toContain("externalApplyUrl");
    expect(issues({ workMode: "remote", isConfidential: "on" })).toContain("confidentialEmployerName");
  });

  it("reads tri-state amenities and JSON lists", () => {
    const job = jobFormSchema.parse({
      ...base,
      accommodationProvided: "yes",
      foodProvided: "no",
      skills: [{ skillId: "33333333-3333-4333-8333-333333333333", isRequired: false, minYears: "2" }],
      locations: [{ countryCode: "ae", city: "Dubai", openings: "3" }],
    });
    expect(job.accommodationProvided).toBe(true);
    expect(job.foodProvided).toBe(false);
    expect(job.skills[0]).toEqual({ skillId: "33333333-3333-4333-8333-333333333333", isRequired: false, minYears: 2 });
    expect(job.locations[0]).toMatchObject({ countryCode: "AE", city: "Dubai", openings: 3 });
  });

  it("rejects a listing that ends before the deadline", () => {
    expect(jobFormSchema.safeParse({ ...base, applicationDeadline: "2026-12-31", expiresAt: "2026-12-01" }).success).toBe(false);
  });
});

describe("screening questions", () => {
  it("only accepts review rules that fit the answer type (they flag, never reject)", () => {
    expect(screeningQuestionSchema.safeParse({ question: "Do you hold a valid passport?", type: "yes_no", knockout: { kind: "equals", value: false } }).success).toBe(true);
    expect(screeningQuestionSchema.safeParse({ question: "Do you hold a valid passport?", type: "yes_no", knockout: { kind: "below", value: 1 } }).success).toBe(false);
    expect(
      screeningQuestionSchema.safeParse({
        question: "Which positions are you qualified in?",
        type: "multi_choice",
        options: [
          { value: "3g", label: "3G" },
          { value: "6g", label: "6G" },
        ],
        knockout: { kind: "any_of", values: ["9g"] },
      }).success,
    ).toBe(false);
    expect(screeningQuestionSchema.safeParse({ question: "Pick one option please", type: "single_choice", options: [{ value: "a", label: "A" }] }).success).toBe(false);
  });
});

describe("parseJobSearchParams", () => {
  it("supports the public URL aliases and comma-separated values", () => {
    const filters = parseJobSearchParams({ type: "internship", overseas: "1", country: "ae,qa", q: "welder", sort: "closing" });
    expect(filters).toMatchObject({ employmentTypes: ["internship"], overseas: true, countryCodes: ["AE", "QA"], q: "welder", sort: "closing", page: 1, pageSize: 20 });
  });

  it("drops invalid values instead of failing", () => {
    const filters = parseJobSearchParams({ categoryIds: "nope", workModes: "space", page: "-3", salaryMin: "5000", q: "welder", overseas: "true" });
    expect(filters.categoryIds).toEqual([]);
    expect(filters.workModes).toEqual([]);
    expect(filters.page).toBe(1);
    expect(filters.salaryMin).toBeUndefined();
    // Valid filters survive.
    expect(filters.q).toBe("welder");
    expect(filters.overseas).toBe(true);
  });
});

describe("jobAlertSchema", () => {
  it("needs at least one channel and a currency with a salary minimum", () => {
    expect(jobAlertSchema.safeParse({ name: "Welding in Qatar", channels: [] }).success).toBe(false);
    expect(jobAlertSchema.safeParse({ name: "Welding in Qatar", channels: ["email"], salaryMin: "2000" }).success).toBe(false);
    const alert = jobAlertSchema.parse({ name: "Welding in Qatar", channels: ["email", "in_app"], countries: ["qa"], overseasOnly: "on" });
    expect(alert).toMatchObject({ frequency: "weekly", countries: ["QA"], overseasOnly: true, isActive: true });
  });
});
