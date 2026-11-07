import { describe, expect, it } from "vitest";

import { computeSkillGap } from "./skill-gap";

const demand = [
  { skillId: "tig", name: "TIG welding", jobCount: 8 },
  { skillId: "mig", name: "MIG welding", jobCount: 6 },
  { skillId: "ndt", name: "NDT inspection", jobCount: 3 },
  { skillId: "rig", name: "Rigging", jobCount: 1 },
];

describe("computeSkillGap", () => {
  it("splits in-demand skills into matched and missing, most requested first", () => {
    const result = computeSkillGap({ candidateSkillIds: ["mig"], demand, totalJobs: 10, courses: [] });
    expect(result.matched.map((m) => m.skillId)).toEqual(["mig"]);
    expect(result.missing.map((m) => m.skillId)).toEqual(["tig", "ndt", "rig"]);
    expect(result.missing[0]!.share).toBeCloseTo(0.8);
    expect(result.coverage).toBe(25);
  });

  it("applies the minimum share and the missing limit", () => {
    const result = computeSkillGap({ candidateSkillIds: [], demand, totalJobs: 10, courses: [], minShare: 0.2, maxMissing: 2 });
    expect(result.missing.map((m) => m.skillId)).toEqual(["tig", "mig"]);
    expect(result.coverage).toBe(0);
  });

  it("suggests courses that teach missing skills, weighted by demand", () => {
    const result = computeSkillGap({
      candidateSkillIds: ["mig"],
      demand,
      totalJobs: 10,
      courses: [
        { id: "c1", slug: "rigging-basics", title: "Rigging basics", skillIds: ["rig"] },
        { id: "c2", slug: "tig-advanced", title: "Advanced TIG", skillIds: ["tig", "mig"] },
        { id: "c3", slug: "office", title: "Office tools", skillIds: ["excel"] },
      ],
    });
    expect(result.suggestions.map((s) => s.slug)).toEqual(["tig-advanced", "rigging-basics"]);
    expect(result.suggestions[0]!.covers).toEqual([{ skillId: "tig", name: "TIG welding" }]);
  });

  it("is honest with no data", () => {
    const result = computeSkillGap({ candidateSkillIds: ["mig"], demand: [], totalJobs: 0, courses: [] });
    expect(result).toEqual({ totalJobs: 0, matched: [], missing: [], coverage: 0, suggestions: [] });
  });
});
