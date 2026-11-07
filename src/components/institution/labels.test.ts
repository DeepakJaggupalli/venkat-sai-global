import { describe, expect, it } from "vitest";

import { batchStatus, isoToLocalInput, localInputToIso, pct, ratio, toOptions } from "./labels";

describe("institution labels", () => {
  it("computes ratios without inventing values", () => {
    expect(ratio(1, 3)).toBe(33.3);
    expect(ratio(0, 0)).toBeNull();
  });

  it("formats percentages and missing values", () => {
    expect(pct(null)).toBe("—");
    expect(pct(82.5)).toBe("82.5%");
  });

  it("round-trips datetime-local values through ISO", () => {
    const local = "2026-12-01T09:30";
    expect(isoToLocalInput(localInputToIso(local))).toBe(local);
    expect(localInputToIso("")).toBe("");
    expect(isoToLocalInput(null)).toBe("");
  });

  it("falls back to a neutral badge for unknown statuses", () => {
    expect(batchStatus("in_progress").label).toBe("In progress");
    expect(batchStatus("mystery_state")).toEqual({ label: "mystery state", tone: "neutral" });
  });

  it("builds select options in key order", () => {
    expect(toOptions({ a: "A", b: "B" }, ["b"])).toEqual([{ value: "b", label: "B" }]);
  });
});
