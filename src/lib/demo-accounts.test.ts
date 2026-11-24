import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { DEMO_EMAIL_DOMAIN, DEMO_MARKER, hasDemoMarker, isDemoEmail, notDemoCandidateRefSql, notDemoOrganizationRefSql, notDemoSql } from "./demo-accounts";

const dialect = new PgDialect();

describe("demo account marker", () => {
  it("recognises marked jsonb only", () => {
    expect(hasDemoMarker(DEMO_MARKER)).toBe(true);
    expect(hasDemoMarker({ demoAccount: true, demoKey: "company" })).toBe(true);
    expect(hasDemoMarker({ demoAccount: "true" })).toBe(false);
    expect(hasDemoMarker({ demoAccount: false })).toBe(false);
    expect(hasDemoMarker({})).toBe(false);
    expect(hasDemoMarker(null)).toBe(false);
    expect(hasDemoMarker([{ demoAccount: true }])).toBe(false);
  });

  it("recognises the reserved demo domain exactly", () => {
    expect(DEMO_EMAIL_DOMAIN).toBe("demo.venkatsai.test");
    expect(isDemoEmail("Admin@Demo.Venkatsai.Test")).toBe(true);
    expect(isDemoEmail("admin@notdemo.venkatsai.test")).toBe(false);
    expect(isDemoEmail("admin@demo.venkatsai.test.example.com")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });

  it("builds parameterised SQL that treats NULL as not demo", () => {
    const query = dialect.sqlToQuery(notDemoSql(sql`o.metadata`));
    expect(query.sql).toBe("not coalesce(o.metadata @> $1::jsonb, false)");
    expect(query.params).toEqual(['{"demoAccount":true}']);
    expect(dialect.sqlToQuery(notDemoOrganizationRefSql(sql`jobs.organization_id`)).sql).toMatch(/^\(jobs\.organization_id is null or not exists \(/);
    expect(dialect.sqlToQuery(notDemoCandidateRefSql(sql`placements.candidate_id`)).sql).toMatch(/^not exists \(\s+select 1 from candidate_profiles demo_cp join users demo_u/);
  });
});
