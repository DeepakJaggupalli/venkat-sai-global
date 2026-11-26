import { describe, expect, it, vi } from "vitest";

// parseReportFilters is pure; the database client is never touched.
vi.mock("@/db", () => ({ db: {} }));

import { parseReportFilters } from "./queries";

describe("parseReportFilters (reports page and exports)", () => {
  it("keeps real calendar days and makes the end date inclusive", () => {
    const f = parseReportFilters({ from: "2026-01-31", to: "2026-02-28", jobId: "3a67bd75-3b59-4000-b6c1-0c8a7813ea16" });
    expect(f.fromIso).toBe("2026-01-31");
    expect(f.toIso).toBe("2026-02-28");
    expect(f.from?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(f.to?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(f.jobId).toBe("3a67bd75-3b59-4000-b6c1-0c8a7813ea16");
  });

  it("drops impossible or malformed dates from the address bar instead of failing the page", () => {
    for (const bad of ["2026-13-45", "2026-02-31", "2026-00-10", "garbage", "2026-1-1", "9999-99-99"]) {
      const f = parseReportFilters({ from: bad, to: bad });
      expect(f, bad).toEqual({ from: undefined, to: undefined, fromIso: undefined, toIso: undefined, jobId: undefined });
    }
    // Repeated parameters (?from=a&from=b) arrive as arrays.
    expect(parseReportFilters({ from: ["2026-01-01", "2026-02-01"], jobId: "not-a-uuid" })).toEqual({ from: undefined, to: undefined, fromIso: undefined, toIso: undefined, jobId: undefined });
  });
});
