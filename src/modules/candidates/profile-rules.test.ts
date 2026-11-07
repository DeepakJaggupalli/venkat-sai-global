import { describe, expect, it } from "vitest";

import { ageOn, buildSearchText, computeVerificationLevel, escapeLike, isMinor, last4, normaliseIdentityNumber, toPrefixTsQuery } from "./profile-rules";
import { candidateSearchFiltersSchema, parseCandidateSearchParams, personalSchema, preferencesSchema, skillsSchema } from "./schemas";

describe("verification level", () => {
  it("takes the highest completed level", () => {
    expect(computeVerificationLevel({ contactVerified: false, identityDocumentVerified: false, passedAssessment: false })).toBe("none");
    expect(computeVerificationLevel({ contactVerified: true, identityDocumentVerified: false, passedAssessment: false })).toBe("basic");
    expect(computeVerificationLevel({ contactVerified: true, identityDocumentVerified: true, passedAssessment: false })).toBe("documents_verified");
    expect(computeVerificationLevel({ contactVerified: false, identityDocumentVerified: false, passedAssessment: true })).toBe("skills_assessed");
  });
});

describe("minors (DPDP children's data)", () => {
  const today = new Date(Date.UTC(2026, 10, 7));
  it("computes age on calendar dates", () => {
    expect(ageOn("2008-11-07", today)).toBe(18);
    expect(ageOn("2008-11-08", today)).toBe(17);
    expect(ageOn("not-a-date", today)).toBeNull();
  });
  it("uses the date of birth first, then a guardian-consent record", () => {
    expect(isMinor("2010-01-01", false, today)).toBe(true);
    expect(isMinor("1990-01-01", true, today)).toBe(false);
    expect(isMinor(null, true, today)).toBe(true);
    expect(isMinor(null, false, today)).toBe(false);
  });
});

describe("text helpers", () => {
  it("builds safe prefix tsqueries", () => {
    expect(toPrefixTsQuery("TIG weld")).toBe("tig:* & weld:*");
    expect(toPrefixTsQuery("a & b | !c:* (x)")).toBe("a:* & b:* & c:* & x:*");
    expect(toPrefixTsQuery("వెల్డర్ 6G")).toBe("వెల్డర్:* & 6g:*");
    expect(toPrefixTsQuery("&|!")).toBeNull();
    expect(toPrefixTsQuery(null)).toBeNull();
  });
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
  it("keeps the last four characters of identity numbers", () => {
    expect(last4("k 1234-5678")).toBe("5678");
    expect(normaliseIdentityNumber(" k12 34/56-7 ")).toBe("K1234567");
  });
  it("deduplicates search text case-insensitively", () => {
    expect(buildSearchText(["GTAW", "gtaw", "TIG welding", null, ""])).toBe("GTAW TIG welding");
    expect(buildSearchText([])).toBeNull();
  });
});

describe("schemas", () => {
  it("requires currency and period with an expected salary", () => {
    const result = preferencesSchema.safeParse({ expectedSalaryAmount: "25000" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["expectedSalaryCurrency", "expectedSalaryPeriod"]));
  });

  it("normalises passport numbers and refuses one without a passport status", () => {
    expect(personalSchema.safeParse({ passportNumber: "k 1234567" }).success).toBe(false);
    const ok = personalSchema.parse({ passportNumber: "k 1234567", passportStatus: "valid" });
    expect(ok.passportNumber).toBe("K1234567");
  });

  it("rejects duplicate skills and too many primary skills", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(skillsSchema.safeParse({ skills: [{ skillId: id }, { skillId: id }] }).success).toBe(false);
    const many = Array.from({ length: 6 }, (_, i) => ({ skillId: `33333333-3333-4333-8333-33333333333${i}`, isPrimary: true }));
    expect(skillsSchema.safeParse({ skills: many }).success).toBe(false);
  });

  it("parses search params and drops invalid values instead of failing", () => {
    const filters = parseCandidateSearchParams({ skillIds: "not-a-uuid", experienceMinYears: "3", availability: "immediate,within_30_days", sort: "nope", page: "2" });
    expect(filters.skillIds).toEqual([]);
    expect(filters.experienceMinYears).toBe(3);
    expect(filters.availability).toEqual(["immediate", "within_30_days"]);
    expect(filters.sort).toBe("relevance");
    expect(filters.page).toBe(2);
    expect(candidateSearchFiltersSchema.safeParse({ salaryMax: "1000" }).success).toBe(false);
  });
});
