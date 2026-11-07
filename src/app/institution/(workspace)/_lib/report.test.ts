import { describe, expect, it } from "vitest";

import { courseReportCsv, csvCell, reportRates } from "./report";

const row = { code: "VSG-CRS-000001", title: "Welding, SMAW", status: "published", batches: 2, enrolled: 10, completed: 6, dropped: 2, passed: 5, failed: 1, certificates: 5, placedLearners: 3, verifiedPlacedLearners: 1 };

describe("institution report", () => {
  it("derives rates only from decided outcomes", () => {
    expect(reportRates(row)).toEqual({ completionRate: 75, passRate: 83.3, placementRate: 50 });
  });

  it("returns null rates when there is nothing to divide by", () => {
    expect(reportRates({ completed: 0, dropped: 0, passed: 0, failed: 0, placedLearners: 0 })).toEqual({ completionRate: null, passRate: null, placementRate: null });
  });

  it("caps the placement rate at 100%", () => {
    expect(reportRates({ completed: 2, dropped: 0, passed: 0, failed: 0, placedLearners: 5 }).placementRate).toBe(100);
  });

  it("escapes CSV cells and neutralises formulas", () => {
    expect(csvCell('a "quoted", value')).toBe('"a ""quoted"", value"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });

  it("writes a header and one line per course", () => {
    const csv = courseReportCsv([row]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Completion rate %");
    expect(lines[1]).toContain('"Welding, SMAW"');
    expect(lines[1]).toContain(",75,83.3,");
  });
});
