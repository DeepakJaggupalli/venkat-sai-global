import { describe, expect, it } from "vitest";

import { COMPLETENESS_WEIGHTS, computeExperienceMonths, computeProfileCompleteness, type CompletenessInput } from "./completeness";

const empty: CompletenessInput = {
  headline: null,
  about: null,
  careerObjective: null,
  currentCountryCode: null,
  city: null,
  contactVerified: false,
  preferredCategoryCount: 0,
  preferredRoleCount: 0,
  desiredEmploymentTypeCount: 0,
  preferredWorkModeCount: 0,
  availability: null,
  hasExpectedSalary: false,
  experienceCount: 0,
  isFresher: false,
  educationCount: 0,
  skillCount: 0,
  languageCount: 0,
  hasResume: false,
  hasPhoto: false,
  openToOverseas: false,
  passportStatus: null,
  unverifiedDocumentCount: 0,
  rejectedDocumentCount: 0,
  visibility: "venkat_sai_only",
};

const full: CompletenessInput = {
  ...empty,
  headline: "Pipe welder (6G, GTAW/SMAW)",
  about: "Eight years of shop and site welding.",
  currentCountryCode: "IN",
  city: "Visakhapatnam",
  contactVerified: true,
  preferredCategoryCount: 1,
  desiredEmploymentTypeCount: 1,
  availability: "immediate",
  hasExpectedSalary: true,
  experienceCount: 2,
  educationCount: 1,
  skillCount: 5,
  languageCount: 2,
  hasResume: true,
  hasPhoto: true,
};

describe("computeProfileCompleteness", () => {
  it("uses weights that add up to 100", () => {
    expect(Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("scores an empty profile 0 and suggests every scored step, highest gain first", () => {
    const result = computeProfileCompleteness(empty);
    expect(result.score).toBe(0);
    expect(result.items.every((i) => !i.complete && i.earned === 0)).toBe(true);
    const points = result.nextActions.map((a) => a.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(result.nextActions[0]!.points).toBe(15);
    expect(result.nextActions.reduce((sum, a) => sum + a.points, 0)).toBe(100);
    expect(result.nextActions.find((a) => a.key === "verify_contact")?.href).toBe("/account");
  });

  it("scores a complete profile 100 with no scored hints", () => {
    const result = computeProfileCompleteness(full);
    expect(result.score).toBe(100);
    expect(result.items.every((i) => i.complete)).toBe(true);
    expect(result.nextActions.filter((a) => a.points > 0)).toEqual([]);
  });

  it("gives partial credit for one or two skills and asks for more", () => {
    const result = computeProfileCompleteness({ ...full, skillCount: 2 });
    expect(result.score).toBe(100 - 15 + 8);
    expect(result.nextActions[0]).toMatchObject({ key: "add_more_skills", points: 7, section: "skills" });
  });

  it("does not penalise freshers for having no work history", () => {
    const withoutExperience = computeProfileCompleteness({ ...full, experienceCount: 0 });
    const fresher = computeProfileCompleteness({ ...full, experienceCount: 0, isFresher: true });
    expect(withoutExperience.score).toBe(85);
    expect(fresher.score).toBe(100);
  });

  it("splits preferences into roles 5, work style 3, availability 4, salary 3", () => {
    const result = computeProfileCompleteness({ ...full, preferredCategoryCount: 0, preferredRoleCount: 0, availability: null });
    const item = result.items.find((i) => i.key === "preferences")!;
    expect(item.earned).toBe(3 + 3);
    expect(result.nextActions.map((a) => a.key)).toEqual(expect.arrayContaining(["add_preferred_roles", "add_availability"]));
  });

  it("adds unscored advice for overseas readiness, documents and visibility", () => {
    const result = computeProfileCompleteness({ ...full, openToOverseas: true, unverifiedDocumentCount: 2, rejectedDocumentCount: 1 });
    const advice = result.nextActions.filter((a) => a.points === 0).map((a) => a.key);
    expect(advice).toEqual(["add_passport_status", "fix_rejected_documents", "submit_documents_for_verification", "review_visibility"]);
  });

  it("never scores sensitive data (identity fields are not inputs)", () => {
    expect(Object.keys(empty)).not.toEqual(expect.arrayContaining(["dateOfBirth", "gender", "nationalityCode"]));
  });
});

describe("computeExperienceMonths", () => {
  const today = new Date(Date.UTC(2026, 10, 7));

  it("counts months inclusively and merges overlapping jobs", () => {
    expect(
      computeExperienceMonths(
        [
          { startDate: "2020-01-01", endDate: "2020-03-31", isCurrent: false },
          { startDate: "2020-03-01", endDate: "2020-06-30", isCurrent: false },
        ],
        today,
      ),
    ).toBe(6);
  });

  it("runs current jobs until today and ignores entries without a start", () => {
    expect(computeExperienceMonths([{ startDate: "2026-01-01", endDate: null, isCurrent: true }, { startDate: null, endDate: "2019-01-01", isCurrent: false }], today)).toBe(11);
  });

  it("returns 0 for no entries or inverted dates", () => {
    expect(computeExperienceMonths([], today)).toBe(0);
    expect(computeExperienceMonths([{ startDate: "2024-05-01", endDate: "2024-01-01", isCurrent: false }], today)).toBe(0);
  });
});
