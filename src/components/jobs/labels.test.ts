import { describe, expect, it } from "vitest";

import { daysUntil, enumLabel, experienceText, humanizeValue, isClosingSoon, isNewJob, placeText, salaryText, type Translate } from "./labels";

const messages: Record<string, string> = {
  "enum.workMode.remote": "Remote",
  "salary.per.month": "{amount} a month",
  "experience.range": "{min}–{max} years",
  "experience.atLeast": "At least {count} years",
  "experience.upTo": "Up to {count} years",
  "experience.exact": "{count} years",
  "experience.none": "No experience needed",
};
const t: Translate = (key, vars) => (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, n: string) => String(vars?.[n] ?? `{${n}}`));

describe("job labels", () => {
  it("translates enums and falls back to a humanised value", () => {
    expect(enumLabel(t, "workMode", "remote")).toBe("Remote");
    expect(enumLabel(t, "workMode", "on_site")).toBe("On site");
    expect(humanizeValue("project_based")).toBe("Project based");
  });

  it("joins places without empty or repeated parts", () => {
    expect(placeText({ city: "Dubai", stateRegion: "Dubai", countryName: "United Arab Emirates", countryCode: "AE" })).toBe("Dubai, United Arab Emirates");
    expect(placeText({ city: null, stateRegion: null, countryName: null, countryCode: "IN" })).toBe("IN");
  });

  it("formats salary in the record's own currency, never assuming one", () => {
    const text = salaryText(t, { minMinor: 250000, maxMinor: 320000, currency: "AED", period: "month" }, "en");
    expect(text).toMatch(/AED/);
    expect(text).toMatch(/a month$/);
    expect(salaryText(t, null, "en")).toBeNull();
    expect(salaryText(t, { minMinor: null, maxMinor: null, currency: "AED", period: "month" }, "en")).toBeNull();
  });

  it("describes experience ranges", () => {
    expect(experienceText(t, 2, 5)).toBe("2–5 years");
    expect(experienceText(t, 0, null)).toBe("No experience needed");
    expect(experienceText(t, 3, null)).toBe("At least 3 years");
    expect(experienceText(t, null, 2)).toBe("Up to 2 years");
    expect(experienceText(t, null, null)).toBeNull();
  });

  it("computes days until closing and the closing-soon / new flags", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    expect(daysUntil(new Date("2026-11-09T09:00:00Z"), now)).toBe(2);
    expect(daysUntil(new Date("2026-11-01T00:00:00Z"), now)).toBe(0);
    expect(daysUntil(null, now)).toBeNull();
    expect(isClosingSoon(new Date("2026-11-12T00:00:00Z"), now)).toBe(true);
    expect(isClosingSoon(new Date("2026-12-30T00:00:00Z"), now)).toBe(false);
    expect(isNewJob(new Date("2026-11-06T00:00:00Z"), now)).toBe(true);
    expect(isNewJob(new Date("2026-10-01T00:00:00Z"), now)).toBe(false);
  });
});
