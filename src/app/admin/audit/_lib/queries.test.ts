import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { auditFilterSchema, dataAccessFilterSchema, securityFilterSchema } from "./queries";

/**
 * The audit pages and the CSV export read `from` / `to` straight from the URL and cast them to a Postgres date.
 * An impossible day (2026-02-30, 2026-13-01) used to reach the query and fail the whole page; it must be ignored.
 */
describe("audit log date filters", () => {
  const schemas = { audit: auditFilterSchema, security: securityFilterSchema, dataAccess: dataAccessFilterSchema };

  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name}: keeps real calendar days`, () => {
      expect(schema.parse({ from: "2026-02-28", to: "2024-02-29" })).toMatchObject({ from: "2026-02-28", to: "2024-02-29" });
    });

    it(`${name}: drops impossible or malformed days instead of failing`, () => {
      for (const bad of ["2026-02-30", "2026-13-01", "2025-02-29", "2026-00-10", "0000-01-01", "notadate", "2026-1-1", "2026-01-01T00:00", "'; drop table x;--"]) {
        const parsed = schema.parse({ from: bad, to: bad });
        expect(parsed.from, bad).toBeUndefined();
        expect(parsed.to, bad).toBeUndefined();
      }
    });
  }
});
