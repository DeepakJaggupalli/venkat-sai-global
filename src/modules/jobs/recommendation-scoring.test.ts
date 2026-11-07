import { describe, expect, it } from "vitest";

import { isRecommendable, RECOMMENDATION_WEIGHTS, scoreJobForCandidate, scoreLocation, type RecommendationCandidate, type RecommendationJob } from "./recommendation-scoring";

const WELDING = "cat-welding";
const candidate: RecommendationCandidate = {
  skillIds: ["gtaw", "smaw", "blueprint"],
  preferredCategoryIds: [WELDING],
  experienceCategoryIds: [],
  preferredRoles: ["Pipe welder"],
  totalExperienceMonths: 6 * 12,
  desiredEmploymentTypes: ["full_time"],
  preferredWorkModes: ["on_site"],
  current: { countryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" },
  preferredLocations: [{ countryCode: "QA", stateRegion: null, city: null }],
  openToOverseas: true,
  willingToRelocate: true,
  expectedSalary: { amountMinor: 250_000, currency: "QAR", period: "month" },
};

const job: RecommendationJob = {
  title: "Pipe welder (6G)",
  jobCategoryId: WELDING,
  categoryName: "Welding",
  skills: [
    { id: "gtaw", name: "GTAW", isRequired: true },
    { id: "smaw", name: "SMAW", isRequired: true },
    { id: "fcaw", name: "FCAW", isRequired: false },
  ],
  employmentType: "full_time",
  workMode: "on_site",
  primary: { countryCode: "QA", stateRegion: null, city: "Doha" },
  extraLocations: [],
  isOverseas: true,
  experienceMinYears: 5,
  experienceMaxYears: 10,
  salary: { minMinor: 240_000, maxMinor: 300_000, currency: "QAR", period: "month" },
};

describe("scoreJobForCandidate", () => {
  it("uses weights that add up to 100", () => {
    expect(Object.values(RECOMMENDATION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("explains every point of a strong match", () => {
    const result = scoreJobForCandidate(candidate, job);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toEqual(["skills_match", "preferred_category", "preferred_location", "experience_fit", "salary_fit", "employment_type", "work_mode"]);
    // Skills: 2/2 required (24) + 0/1 optional (0).
    expect(result.reasons[0]).toMatchObject({ points: 24, params: { matched: 2, total: 2, skills: "GTAW, SMAW" } });
    expect(result.score).toBe(24 + 20 + 20 + 15 + 10 + 3 + 2);
    expect(result.reasons.reduce((sum, r) => sum + r.points, 0)).toBe(result.score);
    expect(isRecommendable(result)).toBe(true);
  });

  it("excludes overseas jobs for candidates not open to overseas work (minors included)", () => {
    const result = scoreJobForCandidate({ ...candidate, openToOverseas: false }, job);
    expect(result).toMatchObject({ score: 0, excluded: "not_open_to_overseas" });
    expect(isRecommendable(result)).toBe(false);
  });

  it("does not compare salaries across currencies or periods", () => {
    const codes = (c: RecommendationCandidate) => scoreJobForCandidate(c, job).reasons.map((r) => r.code);
    expect(codes({ ...candidate, expectedSalary: { amountMinor: 250_000, currency: "INR", period: "month" } })).not.toContain("salary_fit");
    expect(codes({ ...candidate, expectedSalary: { amountMinor: 250_000, currency: "QAR", period: "year" } })).not.toContain("salary_fit");
    expect(codes({ ...candidate, expectedSalary: { amountMinor: 320_000, currency: "QAR", period: "month" } })).toContain("salary_close");
  });

  it("scores experience close to the range lower than a fit", () => {
    const close = scoreJobForCandidate({ ...candidate, totalExperienceMonths: 4 * 12 + 6 }, job).reasons.find((r) => r.code.startsWith("experience"));
    expect(close).toMatchObject({ code: "experience_close", points: 8 });
    const far = scoreJobForCandidate({ ...candidate, totalExperienceMonths: 12 }, job).reasons.find((r) => r.code.startsWith("experience"));
    expect(far).toBeUndefined();
  });

  it("falls back to role words and past categories", () => {
    const noPreference = { ...candidate, preferredCategoryIds: [] };
    expect(scoreJobForCandidate(noPreference, job).reasons.find((r) => r.code === "preferred_role")).toMatchObject({ points: 16, params: { role: "Pipe welder" } });
    const history = { ...noPreference, preferredRoles: [], experienceCategoryIds: [WELDING] };
    expect(scoreJobForCandidate(history, job).reasons.find((r) => r.code === "experience_category")?.points).toBe(12);
  });

  it("needs a skills or role match to recommend (location alone is not enough)", () => {
    const unrelated: RecommendationJob = { ...job, title: "Accountant", jobCategoryId: "cat-finance", categoryName: "Finance", skills: [{ id: "tally", name: "Tally", isRequired: true }] };
    const result = scoreJobForCandidate(candidate, unrelated);
    expect(result.reasons.map((r) => r.code)).not.toContain("skills_match");
    expect(isRecommendable(result)).toBe(false);
  });
});

describe("scoreLocation", () => {
  const domestic: RecommendationJob = { ...job, isOverseas: false, primary: { countryCode: "IN", stateRegion: "Andhra Pradesh", city: "Visakhapatnam" } };
  it("ranks city, region and country for home-country jobs", () => {
    expect(scoreLocation(candidate, domestic)?.code).toBe("location_city");
    expect(scoreLocation(candidate, { ...domestic, primary: { countryCode: "IN", stateRegion: "Andhra Pradesh", city: "Vijayawada" } })?.code).toBe("location_region");
    expect(scoreLocation(candidate, { ...domestic, primary: { countryCode: "IN", stateRegion: "Gujarat", city: "Jamnagar" } })).toMatchObject({ code: "relocation", points: 10 });
    expect(scoreLocation({ ...candidate, willingToRelocate: false }, { ...domestic, primary: { countryCode: "IN", stateRegion: "Gujarat", city: "Jamnagar" } })).toMatchObject({ code: "location_country", points: 6 });
  });
  it("matches extra job locations and preferred cities", () => {
    const multi = { ...domestic, primary: { countryCode: "IN", stateRegion: "Gujarat", city: "Jamnagar" }, extraLocations: [{ countryCode: "IN", stateRegion: "Andhra Pradesh", city: "visakhapatnam" }] };
    expect(scoreLocation(candidate, multi)?.code).toBe("location_city");
  });
  it("scores overseas jobs by preferred countries", () => {
    expect(scoreLocation(candidate, job)).toMatchObject({ code: "preferred_location", points: 20 });
    expect(scoreLocation(candidate, { ...job, primary: { countryCode: "AE", stateRegion: null, city: "Dubai" } })).toMatchObject({ code: "overseas_open", points: 12 });
  });
  it("scores remote jobs by work-mode preference", () => {
    const remote = { ...job, workMode: "remote", isOverseas: false, primary: { countryCode: null, stateRegion: null, city: null } };
    expect(scoreLocation({ ...candidate, preferredWorkModes: ["remote"] }, remote)?.code).toBe("remote_preference");
    expect(scoreLocation(candidate, remote)?.code).toBe("remote_in_country");
  });
});
