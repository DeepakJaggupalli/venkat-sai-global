/**
 * Employer kinds (direct company vs travel agency) against PostgreSQL (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_agency
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_agency'; npx vitest run src/modules/organizations/employer-kind.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("employer kinds", async () => {
  if (!enabled) return;
  const { and, eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { auditLogs, organizations } = await import("@/db/schema");
  const fx = await import("./testing");
  const service = await import("./service");
  const employer = await import("./employer");
  const queries = await import("./queries");
  const authz = await import("@/modules/identity/authz");

  let staff: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    staff = fx.staffContext(await fx.createUser({ isStaff: true }), ["orgs.view", "orgs.manage"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  const details = (name: string) => ({ name: `${name} ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`, countryCode: "IN", city: "Visakhapatnam" });

  it("creates travel agencies and direct companies; other types have no kind", async () => {
    const owner = await fx.createUser();
    const agency = await service.createOrganization("employer", details("Agency"), owner, { employerKind: "travel_agency" });
    const company = await service.createOrganization("employer", details("Company"), await fx.createUser());
    const partner = await service.createOrganization("recruitment_partner", details("Partner"), await fx.createUser(), { employerKind: "travel_agency" });
    expect(agency.employerKind).toBe("travel_agency");
    expect(company.employerKind).toBe("direct_company");
    expect(partner.employerKind).toBeNull();

    const memberships = await authz.listUserMemberships(owner.id);
    expect(memberships.find((m) => m.organizationId === agency.id)?.employerKind).toBe("travel_agency");
    const access = await authz.getPortalAccess(owner);
    expect(access).toMatchObject({ agency: true, employer: false });
    expect(authz.portalHomePath(access)).toBe("/agency");
  });

  it("lets only the owner switch the kind, audited", async () => {
    const owner = await fx.createUser();
    const org = await service.createOrganization("employer", details("Switch"), owner);
    const ctx = await fx.memberContext<"employer">(owner, org.id);

    await expect(employer.setEmployerKind({ ...ctx, isOwner: false }, org.id, "travel_agency")).rejects.toThrow(/owner/i);
    const updated = await employer.setEmployerKind(ctx, org.id, "travel_agency");
    expect(updated.employerKind).toBe("travel_agency");
    const logs = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, org.id), eq(auditLogs.action, "employer.kind_changed")));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.metadata).toMatchObject({ from: "direct_company", to: "travel_agency" });
    expect(authz.portalHomePath(await authz.getPortalAccess(owner))).toBe("/agency");
  });

  it("filters the Command Centre list by travel agency / company", async () => {
    const agency = await service.createOrganization("employer", details("FilterAgency"), await fx.createUser(), { employerKind: "travel_agency" });
    const company = await service.createOrganization("employer", details("FilterCompany"), await fx.createUser());
    // A row created before the column existed (no stored kind) counts as a company.
    const legacy = await service.createOrganization("employer", details("FilterLegacy"), await fx.createUser());
    await db.update(organizations).set({ employerKind: null }).where(eq(organizations.id, legacy.id));
    const page = { page: 1, pageSize: 200, offset: 0 };

    const agencies = (await queries.listOrganizations(staff, { employerKind: "travel_agency" }, page)).items;
    expect(agencies.map((o) => o.id)).toContain(agency.id);
    expect(agencies.map((o) => o.id)).not.toContain(company.id);
    expect(agencies.every((o) => o.type === "employer" && o.employerKind === "travel_agency")).toBe(true);

    const companies = (await queries.listOrganizations(staff, { employerKind: "direct_company" }, page)).items;
    expect(companies.map((o) => o.id)).toEqual(expect.arrayContaining([company.id, legacy.id]));
    expect(companies.map((o) => o.id)).not.toContain(agency.id);
    expect(companies.find((o) => o.id === legacy.id)?.employerKind).toBe("direct_company");
  });
});
