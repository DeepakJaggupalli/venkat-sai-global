import { describe, expect, it } from "vitest";

import { activeFilterCount, activeFilterNames, isFlagOn, readMulti, recordReader, toggleMultiPatch } from "./filter-params";

describe("job filter params", () => {
  it("reads aliases, canonical names, repeated and comma-separated values without duplicates", () => {
    const reader = recordReader({ type: ["full_time", "contract,full_time"], employmentTypes: "internship" });
    expect(readMulti(reader, "type")).toEqual(["full_time", "contract", "internship"]);
  });

  it("toggling writes the alias and clears the canonical name", () => {
    const reader = recordReader({ countryCodes: "AE" });
    expect(toggleMultiPatch(reader, "country", "SA", true)).toEqual({ country: ["AE", "SA"], countryCodes: null });
    expect(toggleMultiPatch(recordReader({ country: "AE" }), "country", "AE", false)).toEqual({ country: null, countryCodes: null });
  });

  it("names active filters without values and ignores keywords and off flags", () => {
    const reader = recordReader({ q: "welder", country: "AE", salaryMin: "1000", salaryCurrency: "AED", overseas: "0", verifiedOnly: "1" });
    expect(activeFilterNames(reader)).toEqual(["country", "salary", "verifiedOnly"]);
    expect(activeFilterCount(reader)).toBe(3);
  });

  it("recognises flag values", () => {
    expect(isFlagOn("1")).toBe(true);
    expect(isFlagOn("true")).toBe(true);
    expect(isFlagOn("0")).toBe(false);
    expect(isFlagOn(undefined)).toBe(false);
  });
});
