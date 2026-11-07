/**
 * Integration tests for the membership check that authorises organisation switching and for the
 * organisation switcher data. Needs an isolated database:
 *
 *   node scripts/test-db.mjs vsg_test_designshell
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_designshell'; npx vitest run src/components/layout
 *
 * Skipped when DATABASE_URL does not point at a vsg_test_* database (never touches the main database).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "";
const isTestDatabase = /\/vsg_test_[a-z0-9_]+$/.test(databaseUrl);

describe.skipIf(!isTestDatabase)("shell-data (database)", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    member: "",
    outsider: "",
    employerA: "",
    employerB: "",
    disabledEmployer: "",
    deletedEmployer: "",
    partner: "",
  };
  const created = { users: [] as string[], orgs: [] as string[], roles: [] as string[] };

  beforeAll(async () => {
    const { db } = await import("@/db");
    const { organizationMembers, organizations, roles, users } = await import("@/db/schema");

    const [member, outsider] = await db
      .insert(users)
      .values([
        { displayName: "Shell Member", email: `member-${suffix}@example.test` },
        { displayName: "Shell Outsider", email: `outsider-${suffix}@example.test` },
      ])
      .returning({ id: users.id });
    ids.member = member!.id;
    ids.outsider = outsider!.id;
    created.users.push(ids.member, ids.outsider);

    const orgRows = await db
      .insert(organizations)
      .values([
        { type: "employer", name: `Alpha Fabrication ${suffix}`, slug: `alpha-${suffix}`, status: "verified" },
        { type: "employer", name: `Beta Marine ${suffix}`, slug: `beta-${suffix}`, status: "pending" },
        { type: "employer", name: `Gamma Works ${suffix}`, slug: `gamma-${suffix}` },
        { type: "employer", name: `Deleted Co ${suffix}`, slug: `deleted-${suffix}`, deletedAt: new Date() },
        { type: "recruitment_partner", name: `Delta Staffing ${suffix}`, slug: `delta-${suffix}` },
      ])
      .returning({ id: organizations.id });
    [ids.employerA, ids.employerB, ids.disabledEmployer, ids.deletedEmployer, ids.partner] = orgRows.map((row) => row.id) as [
      string,
      string,
      string,
      string,
      string,
    ];
    created.orgs.push(...orgRows.map((row) => row.id));

    const [employerRole, partnerRole] = await db
      .insert(roles)
      .values([
        { scope: "employer", key: `owner-${suffix}`, name: "Owner", permissions: ["employer.dashboard"] },
        { scope: "recruitment_partner", key: `owner-${suffix}`, name: "Agency owner", permissions: ["partner.dashboard"] },
      ])
      .returning({ id: roles.id });
    created.roles.push(employerRole!.id, partnerRole!.id);

    await db.insert(organizationMembers).values([
      { organizationId: ids.employerA, userId: ids.member, roleId: employerRole!.id, status: "active" },
      { organizationId: ids.employerB, userId: ids.member, roleId: employerRole!.id, status: "active" },
      { organizationId: ids.disabledEmployer, userId: ids.member, roleId: employerRole!.id, status: "disabled" },
      { organizationId: ids.deletedEmployer, userId: ids.member, roleId: employerRole!.id, status: "active" },
      { organizationId: ids.partner, userId: ids.member, roleId: partnerRole!.id, status: "active" },
    ]);
  });

  afterAll(async () => {
    const { db, pool } = await import("@/db");
    const { organizations, roles, users } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    // Memberships cascade with organisations/users.
    if (created.orgs.length) await db.delete(organizations).where(inArray(organizations.id, created.orgs));
    if (created.roles.length) await db.delete(roles).where(inArray(roles.id, created.roles));
    if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    await pool.end();
  });

  it("finds an active membership of the right organisation type", async () => {
    const { findActiveMembership } = await import("./shell-data");
    await expect(findActiveMembership(ids.member, "employer", ids.employerA)).resolves.toEqual({
      organizationId: ids.employerA,
      organizationName: `Alpha Fabrication ${suffix}`,
    });
    await expect(findActiveMembership(ids.member, "recruitment_partner", ids.partner)).resolves.toMatchObject({
      organizationId: ids.partner,
    });
  });

  it("refuses disabled memberships, deleted organisations, other types and other users", async () => {
    const { findActiveMembership } = await import("./shell-data");
    await expect(findActiveMembership(ids.member, "employer", ids.disabledEmployer)).resolves.toBeNull();
    await expect(findActiveMembership(ids.member, "employer", ids.deletedEmployer)).resolves.toBeNull();
    await expect(findActiveMembership(ids.member, "employer", ids.partner)).resolves.toBeNull();
    await expect(findActiveMembership(ids.outsider, "employer", ids.employerA)).resolves.toBeNull();
    await expect(findActiveMembership(ids.member, "employer", randomUUID())).resolves.toBeNull();
  });

  it("lists only active memberships of the current portal's type for the switcher", async () => {
    const { getOrgShellData } = await import("./shell-data");
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, ids.employerA));

    const data = await getOrgShellData({
      orgType: "employer",
      user: {
        id: ids.member,
        email: null,
        phone: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        displayName: "Shell Member",
        avatarFileId: null,
        status: "active",
        isStaff: false,
        locale: "en",
        timezone: null,
        hasPassword: false,
        twoFactorEnabled: false,
      },
      sessionId: "test-session",
      organization: organization!,
      membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
      role: { id: randomUUID(), key: "owner", name: "Owner" },
      permissions: new Set(["employer.dashboard"]),
      isOwner: true,
    });

    expect(data.organization).toMatchObject({ id: ids.employerA, type: "employer", status: "verified", roleName: "Owner" });
    expect(data.memberships.map((m) => m.organizationId).sort()).toEqual([ids.employerA, ids.employerB].sort());
    expect(data.memberships.find((m) => m.organizationId === ids.employerB)?.organizationStatus).toBe("pending");
  });
});
