import { describe, expect, it } from "vitest";

import { arcPath, coordsFor, flagEmoji, groupByReach, MAP_HEIGHT, project, reachGroupFor } from "./geo";
import { resolveHomepageSections } from "./home/sections";
import { buildRequirementPayload, emptyLine } from "./forms/requirement-lines";

describe("resolveHomepageSections", () => {
  it("returns the default order when the CMS lists nothing", () => {
    const keys = resolveHomepageSections(undefined).map((s) => s.key);
    expect(keys[0]).toBe("metrics");
    expect(keys.at(-1)).toBe("cta_band");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("respects CMS order, hides invisible sections and appends unmentioned ones", () => {
    const resolved = resolveHomepageSections([
      { key: "news", visible: true, heading: "  Updates  " },
      { key: "metrics", visible: false },
      { key: "news", visible: false },
      { key: "unknown", visible: true },
    ]);
    expect(resolved[0]).toEqual({ key: "news", heading: "Updates", intro: null });
    expect(resolved.some((s) => s.key === "metrics")).toBe(false);
    expect(resolved.filter((s) => s.key === "news")).toHaveLength(1);
    expect(resolved.some((s) => s.key === "cta_band")).toBe(true);
  });
});

describe("geo helpers", () => {
  it("groups regions into the reach groups", () => {
    expect(reachGroupFor("gcc")).toBe("gcc");
    expect(reachGroupFor("middle_east")).toBe("other");
    expect(reachGroupFor("oceania")).toBe("other");
    expect(reachGroupFor(undefined)).toBe("other");
    const groups = groupByReach(
      [
        { c: "QA", r: "gcc" },
        { c: "DE", r: "europe" },
        { c: "AE", r: "gcc" },
        { c: "BR", r: "latin_america" },
      ],
      (i) => i.r,
    );
    expect(groups.map((g) => g.group)).toEqual(["gcc", "europe", "other"]);
    expect(groups[0]?.items.map((i) => i.c)).toEqual(["QA", "AE"]);
  });

  it("projects inside the frame and falls back to the region centre", () => {
    const qa = coordsFor("qa");
    expect(qa).toEqual({ lon: 51.2, lat: 25.3 });
    expect(coordsFor("ZZ", "europe")).toEqual({ lon: 12, lat: 50 });
    expect(coordsFor("ZZ", null)).toBeNull();
    const p = project({ lon: 500, lat: -90 });
    expect(p.x).toBe(1000);
    expect(p.y).toBe(MAP_HEIGHT);
  });

  it("draws arcs that bend upwards", () => {
    const d = arcPath({ x: 0, y: 100 }, { x: 200, y: 100 });
    const cy = Number(d.split("Q")[1]?.split(" ")[1]);
    expect(cy).toBeLessThan(100);
  });

  it("builds flag emoji only for valid codes", () => {
    expect(flagEmoji("in")).toBe("🇮🇳");
    expect(flagEmoji("123")).toBe("");
  });
});

describe("requirement lines", () => {
  it("drops blank optional values and parses skills", () => {
    const payload = buildRequirementPayload([
      { ...emptyLine("a"), roleTitle: " Welder ", positions: "12", requiredSkills: "TIG, MIG ,", salaryMin: "", salaryCurrency: "" },
    ]);
    expect(payload).toEqual([{ roleTitle: "Welder", positions: 12, requiredSkills: ["TIG", "MIG"] }]);
  });

  it("keeps salary fields together and ignores fully empty rows", () => {
    const payload = buildRequirementPayload([
      { ...emptyLine("a"), roleTitle: "Fitter", positions: "3", salaryMin: "1200", salaryMax: "1500", salaryCurrency: "qar", salaryPeriod: "month", experienceMinYears: "2" },
      emptyLine("b"),
    ]);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ salaryMin: 1200, salaryMax: 1500, salaryCurrency: "QAR", salaryPeriod: "month", experienceMinYears: 2 });
  });
});
