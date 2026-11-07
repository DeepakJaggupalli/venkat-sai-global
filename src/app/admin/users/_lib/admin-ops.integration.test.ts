/**
 * Integration tests for the Command Centre read models and user administration (ui:admin-ops)
 * against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_adminops
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_adminops'; npx vitest run src/app/admin src/components/admin
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("admin ops (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { eq, inArray } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const dash = await import("@/components/admin/dashboard-queries");
  const adminQueries = await import("@/components/admin/queries");
  const userAdmin = await import("./user-admin");
  const approvalsInbox = await import("../../approvals/_lib/queries");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const run = randomUUID().slice(0, 8);
  const createdUsers: string[] = [];
  const createdRoles: string[] = [];

  async function makeUser(name: string, opts: { staff?: boolean } = {}) {
    const [u] = await db
      .insert(s.users)
      .values({ email: `${name}-${run}@example.test`, displayName: `${name} ${run}`, isStaff: opts.staff ?? false, status: "active" })
      .returning();
    createdUsers.push(u!.id);
    return u!;
  }
  async function makeRole(key: string, permissions: string[]) {
    const [r] = await db.insert(s.roles).values({ scope: "platform", key: `${key}-${run}`, name: `${key} ${run}`, permissions }).returning();
    createdRoles.push(r!.id);
    return r!;
  }
  function ctxFor(u: typeof s.users.$inferSelect, permissions: string[], isSuperAdmin = false): StaffContext {
    return {
      user: {
        id: u.id,
        email: u.email,
        phone: u.phone,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        displayName: u.displayName,
        avatarFileId: null,
        status: u.status,
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: false,
        twoFactorEnabled: true,
      },
      roleKeys: [],
      permissions: new Set(permissions),
      isSuperAdmin,
    };
  }

  afterAll(async () => {
    if (createdUsers.length) {
      await db.delete(s.userRoles).where(inArray(s.userRoles.userId, createdUsers));
      await db.delete(s.users).where(inArray(s.users.id, createdUsers));
    }
    if (createdRoles.length) await db.delete(s.roles).where(inArray(s.roles.id, createdRoles));
    await pool.end();
  });

  it("dashboard counts, weekly trends and money queries run and return numbers", async () => {
    const before = await dash.getDashboardCounts();
    await makeUser("dash");
    const after = await dash.getDashboardCounts();
    expect(after.users).toBe(before.users + 1);
    for (const value of Object.values(after)) expect(Number.isFinite(value)).toBe(true);
    const trends = await dash.getWeeklyTrends(12);
    expect(trends.weeks).toHaveLength(12);
    expect(trends.users.at(-1)).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(await dash.getRevenue30d())).toBe(true);
    expect(Array.isArray(await dash.getOutstandingInvoices())).toBe(true);
    expect(await dash.getActiveSubscriptionCount()).toBeGreaterThanOrEqual(0);
  });

  it("approval inbox filters run (open, unassigned, me, priority, search)", async () => {
    const me = await makeUser("inbox", { staff: true });
    const ctx = ctxFor(me, ["approvals.view"]);
    const page = { page: 1, pageSize: 10, offset: 0 };
    for (const filters of [{ status: "open" as const }, { status: "all" as const, assignee: "unassigned" }, { status: "open" as const, assignee: "me", priority: "urgent" as const, q: "x%_" }]) {
      const result = await approvalsInbox.listApprovalInbox(ctx, approvalsInbox.approvalFiltersSchema.parse(filters), page);
      expect(result.page).toBe(1);
    }
  });

  it("staff options include only active staff holding the permission", async () => {
    const holder = await makeUser("holder", { staff: true });
    const other = await makeUser("other", { staff: true });
    const role = await makeRole("leads", ["leads.view"]);
    await db.insert(s.userRoles).values({ userId: holder.id, roleId: role.id });
    const options = await adminQueries.listStaffOptions({ permission: "leads.view" });
    expect(options.some((o) => o.value === holder.id)).toBe(true);
    expect(options.some((o) => o.value === other.id)).toBe(false);
  });

  it("role changes refuse self-edits and escalation, and grant held roles", async () => {
    const admin = await makeUser("admin", { staff: true });
    const target = await makeUser("target");
    const small = await makeRole("small", ["leads.view"]);
    const big = await makeRole("big", ["leads.view", "users.roles", "commercial.refunds"]);
    const ctx = ctxFor(admin, ["users.roles", "leads.view"]);

    await expect(userAdmin.setStaffRoles(ctx, admin.id, [small.id])).rejects.toThrow(/your own account/);
    await expect(userAdmin.setStaffRoles(ctx, target.id, [big.id])).rejects.toThrow(/permissions you hold/);

    await userAdmin.setStaffRoles(ctx, target.id, [small.id]);
    const [row] = await db.select({ isStaff: s.users.isStaff }).from(s.users).where(eq(s.users.id, target.id));
    expect(row!.isStaff).toBe(true);

    await userAdmin.setStaffRoles(ctx, target.id, []);
    const [row2] = await db.select({ isStaff: s.users.isStaff }).from(s.users).where(eq(s.users.id, target.id));
    expect(row2!.isStaff).toBe(false);
  });

  it("suspension needs a reason path, blocks self and revokes sessions", async () => {
    const admin = await makeUser("mgr", { staff: true });
    const target = await makeUser("susp");
    const ctx = ctxFor(admin, ["users.manage", "users.security"]);
    await db.insert(s.sessions).values({ id: `test-${run}-session-aaaaaaaa`, userId: target.id, expiresAt: new Date(Date.now() + 3_600_000) });

    await expect(userAdmin.setUserStatus(ctx, admin.id, "suspended", "x")).rejects.toThrow(/your own account/);
    await userAdmin.setUserStatus(ctx, target.id, "suspended", "Fraud report under review");
    const [u] = await db.select().from(s.users).where(eq(s.users.id, target.id));
    expect(u!.status).toBe("suspended");
    const remaining = await db.select().from(s.sessions).where(eq(s.sessions.userId, target.id));
    expect(remaining).toHaveLength(0);
    await expect(userAdmin.setUserStatus(ctx, target.id, "suspended", "again")).rejects.toThrow(/already suspended/);
    await userAdmin.setUserStatus(ctx, target.id, "active", "Cleared");
    const [u2] = await db.select().from(s.users).where(eq(s.users.id, target.id));
    expect(u2!.status).toBe("active");
  });

  it("users without the permission are refused", async () => {
    const viewer = await makeUser("viewer", { staff: true });
    const ctx = ctxFor(viewer, ["users.view"]);
    await expect(userAdmin.revokeAllUserSessions(ctx, createdUsers[0]!)).rejects.toThrow(/Not allowed/);
    await expect(userAdmin.listUsers(ctxFor(viewer, []), {}, { page: 1, pageSize: 5, offset: 0 })).rejects.toThrow(/Not allowed/);
    const list = await userAdmin.listUsers(ctx, { q: run, kind: "staff" }, { page: 1, pageSize: 50, offset: 0 });
    expect(list.items.every((i) => i.isStaff)).toBe(true);
  });
});
