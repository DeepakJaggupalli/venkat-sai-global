import { describe, expect, it } from "vitest";

import { formatExperience, formatPlace, MAX_COMPARE, parseCompareIds, toggleCompare } from "./labels";
import { computeFunnels, csvCell, daysBetween, groupHireSources, median, ratio, toCsv, totalFunnel } from "./report-utils";
import { buildCandidateSearchQuery } from "./search-query";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const E = "55555555-5555-4555-8555-555555555555";

describe("formatExperience", () => {
  it("formats months", () => {
    expect(formatExperience(null)).toBe("—");
    expect(formatExperience(0)).toBe("Fresher");
    expect(formatExperience(1)).toBe("1 mo");
    expect(formatExperience(14)).toBe("1 yr 2 mos");
    expect(formatExperience(24)).toBe("2 yrs");
  });
});

describe("formatPlace", () => {
  it("joins available parts", () => {
    expect(formatPlace({ city: "Visakhapatnam", stateRegion: "Andhra Pradesh", countryCode: "IN" })).toBe("Visakhapatnam, Andhra Pradesh, IN");
    expect(formatPlace({})).toBe("Location not shared");
  });
});

describe("compare selection", () => {
  it("toggles and caps at four", () => {
    let sel: string[] = [];
    for (const id of [A, B, C, D]) sel = toggleCompare(sel, id).next;
    expect(sel).toHaveLength(MAX_COMPARE);
    const over = toggleCompare(sel, E);
    expect(over.rejected).toBe(true);
    expect(over.next).toEqual(sel);
    expect(toggleCompare(sel, A).next).toEqual([B, C, D]);
  });
  it("parses ids safely", () => {
    expect(parseCompareIds(`${A},${A},bad,${B}`)).toEqual([A, B]);
    expect(parseCompareIds([A, `${B},${C}`, D, E])).toEqual([A, B, C, D]);
    expect(parseCompareIds(undefined)).toEqual([]);
  });
});

describe("funnels", () => {
  it("counts the furthest step each application reached", () => {
    const funnels = computeFunnels([
      { jobId: "j1", applicationId: "a1", category: "applied" },
      { jobId: "j1", applicationId: "a1", category: "screening" },
      { jobId: "j1", applicationId: "a1", category: "interview" },
      { jobId: "j1", applicationId: "a1", category: "rejected" },
      { jobId: "j1", applicationId: "a2", category: "applied" },
      { jobId: "j1", applicationId: "a3", category: "joined" },
      { jobId: "j2", applicationId: "a4", category: "withdrawn" },
    ]);
    const j1 = funnels.find((f) => f.jobId === "j1")!;
    expect(j1.total).toBe(3);
    expect(j1.counts).toEqual({ applied: 3, screened: 2, interviewed: 2, offered: 1, joined: 1 });
    const j2 = funnels.find((f) => f.jobId === "j2")!;
    expect(j2.counts.applied).toBe(1);
    expect(j2.counts.screened).toBe(0);
    expect(totalFunnel(funnels).applied).toBe(4);
  });
  it("returns nothing for no rows", () => {
    expect(computeFunnels([])).toEqual([]);
  });
});

describe("numbers", () => {
  it("ratio, days, median", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
    expect(daysBetween("2026-01-01T00:00:00Z", "2026-01-11T00:00:00Z")).toBe(10);
    expect(daysBetween(null, new Date())).toBeNull();
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("hire sources", () => {
  it("never separates partners from Venkat Sai", () => {
    const groups = groupHireSources([
      { source: "direct", value: 2 },
      { source: "partner", value: 3 },
      { source: "staff_assigned", value: 1 },
    ]);
    expect(groups.find((g) => g.key === "direct")!.value).toBe(2);
    expect(groups.find((g) => g.key === "venkat_sai")!.value).toBe(4);
    expect(groups.some((g) => (g.key as string) === "partner")).toBe(false);
  });
});

describe("csv", () => {
  it("escapes and neutralises formulas", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["x", "y"], [[1, "a"]])).toBe("x,y\r\n1,a\r\n");
  });
});

describe("buildCandidateSearchQuery", () => {
  it("drops empty values and strips [] suffixes", () => {
    const fd = new FormData();
    fd.append("q", " welder ");
    fd.append("skillIds[]", A);
    fd.append("skillIds[]", B);
    fd.append("city", "");
    fd.append("availability", "immediate");
    fd.append("page", "3");
    expect(buildCandidateSearchQuery(fd)).toBe(`q=welder&skillIds=${A}&skillIds=${B}&availability=immediate`);
  });
});
