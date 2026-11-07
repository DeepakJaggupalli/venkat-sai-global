import { describe, expect, it } from "vitest";

import { financialYearDisplay, financialYearLabel } from "./fiscal";

describe("financialYearLabel", () => {
  it("starts the Indian financial year on 1 April (IST)", () => {
    expect(financialYearLabel(new Date("2026-04-01T00:00:00+05:30"))).toBe("2627");
    expect(financialYearLabel(new Date("2027-03-31T23:59:00+05:30"))).toBe("2627");
    expect(financialYearLabel(new Date("2026-03-31T23:59:00+05:30"))).toBe("2526");
  });

  it("evaluates the boundary in IST, not UTC", () => {
    // 31 March 2026 20:00 UTC is already 1 April 2026 01:30 in India.
    expect(financialYearLabel(new Date("2026-03-31T20:00:00Z"))).toBe("2627");
  });

  it("keeps GST document numbers within 16 characters", () => {
    const fy = financialYearLabel(new Date("2026-11-07T10:00:00Z"));
    expect(`VSG/${fy}/000123`.length).toBeLessThanOrEqual(16);
    expect(`VSGC/${fy}/000045`.length).toBeLessThanOrEqual(16);
  });

  it("formats a readable label", () => {
    expect(financialYearDisplay("2627")).toBe("FY 2026–27");
  });
});
