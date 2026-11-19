/**
 * Integration tests for the privacy module against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_privacy
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_privacy'; npx vitest run src/modules/privacy
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("privacy module (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const service = await import("./service");
  const queries = await import("./queries");
  const { tasks } = await import("./tasks");
  type SessionUser = import("@/modules/identity/session").SessionUser;
  const { loadStaffContextForUser } = await import("./staff-context");
  const erasure = await import("./erasure");
  const orgService = await import("@/modules/organizations/service");
  const fx = await import("@/modules/organizations/testing");

  const run = randomUUID().slice(0, 8);
  const log = () => undefined;
  const taskCtx = { taskId: 0, attempt: 1, log };

  function sessionUser(u: typeof s.users.$inferSelect): SessionUser {
    return { id: u.id, email: u.email, phone: u.phone, emailVerifiedAt: u.emailVerifiedAt, phoneVerifiedAt: u.phoneVerifiedAt, displayName: u.displayName, avatarFileId: null, status: u.status, isStaff: u.isStaff, locale: u.locale, timezone: u.timezone, hasPassword: false, twoFactorEnabled: false };
  }

  async function makeUser(label: string, opts: { staff?: boolean; verified?: boolean } = {}) {
    const [u] = await db
      .insert(s.users)
      .values({ email: `${label}-${run}@example.test`, displayName: `${label} ${run}`, isStaff: Boolean(opts.staff), emailVerifiedAt: opts.verified === false ? null : new Date(), status: "active" })
      .returning();
    return u!;
  }

  const staffUser = await makeUser("privacy-staff", { staff: true });
  const [role] = await db.insert(s.roles).values({ scope: "platform", key: `privacy-${run}`, name: "Privacy test role", permissions: ["privacy.requests", "candidates.view"] }).returning();
  await db.insert(s.userRoles).values({ userId: staffUser.id, roleId: role!.id });
  const ctx = (await loadStaffContextForUser(staffUser.id))!;

  it("loads a staff context with the role's permissions", () => {
    expect(ctx).not.toBeNull();
    expect(ctx.permissions.has("privacy.requests")).toBe(true);
    expect(ctx.permissions.has("support.manage")).toBe(false);
  });

  it("creates a verified request with a settings-driven due date and blocks duplicates", async () => {
    const subject = await makeUser("privacy-subject-a");
    const created = await service.createDataRequest(sessionUser(subject), { type: "export", details: undefined, confirmDeletion: false });
    expect(created.code).toMatch(/DSR/);
    const days = (created.dueAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(1);
    const [row] = await db.select().from(s.dataRequests).where(eq(s.dataRequests.id, created.id));
    expect(row!.status).toBe("received");
    expect(row!.identityVerifiedAt).not.toBeNull();
    await expect(service.createDataRequest(sessionUser(subject), { type: "export", details: undefined, confirmDeletion: false })).rejects.toThrow(/open request/);
  });

  it("asks unverified accounts to confirm identity and keeps requests scoped to their owner", async () => {
    const subject = await makeUser("privacy-subject-b", { verified: false });
    const other = await makeUser("privacy-other");
    const created = await service.createDataRequest(sessionUser(subject), { type: "correction", details: "My surname is spelt wrong", confirmDeletion: false });
    const [row] = await db.select().from(s.dataRequests).where(eq(s.dataRequests.id, created.id));
    expect(row!.status).toBe("identity_verification");
    await expect(service.startDataRequest(ctx, created.id)).rejects.toThrow(/identity/i);
    await expect(service.cancelMyDataRequest(sessionUser(other), created.id)).rejects.toThrow(/not found/i);
    expect(await queries.listMyDataRequests(other.id)).toHaveLength(0);
    await service.verifyDataRequestIdentity(ctx, created.id, "Matched code sent to the registered phone");
    await service.completeDataRequest(ctx, created.id, { resolution: "We corrected the surname on your profile." });
    const [done] = await queries.listMyDataRequests(subject.id);
    expect(done!.status).toBe("completed");
    expect(done!.resolution).toContain("corrected");
  });

  it("generates an owner-only export through the task and completes the request", async () => {
    const subject = await makeUser("privacy-subject-c");
    await db.insert(s.candidateProfiles).values({ userId: subject.id, headline: "Welder" });
    const created = await service.createDataRequest(sessionUser(subject), { type: "export", details: undefined, confirmDeletion: false });
    await service.startDataRequest(ctx, created.id);
    await service.queueDataExport(ctx, created.id);
    const [job] = await db.select().from(s.backgroundJobs).where(and(eq(s.backgroundJobs.type, "privacy.export")));
    expect(job).toBeTruthy();
    await tasks["privacy.export"]!({ requestId: created.id, staffUserId: staffUser.id }, taskCtx);
    const [row] = await db.select().from(s.dataRequests).where(eq(s.dataRequests.id, created.id));
    expect(row!.status).toBe("completed");
    expect(row!.exportFileId).toBeTruthy();
    const [file] = await db.select().from(s.files).where(eq(s.files.id, row!.exportFileId!));
    expect(file!.purpose).toBe("data_export");
    expect(file!.ownerUserId).toBe(subject.id);
    const [mine] = await queries.listMyDataRequests(subject.id);
    expect(mine!.export?.href).toContain(file!.id);
    // Re-running the task is a no-op.
    await tasks["privacy.export"]!({ requestId: created.id, staffUserId: staffUser.id }, taskCtx);
  });

  it("erases an account, keeping the row anonymised", async () => {
    const subject = await makeUser("privacy-subject-d");
    await db.insert(s.candidateProfiles).values({ userId: subject.id, headline: "Fitter", legalName: "Real Name" });
    const created = await service.createDataRequest(sessionUser(subject), { type: "deletion", details: undefined, confirmDeletion: true });
    await service.startDataRequest(ctx, created.id);
    await expect(service.completeDataRequest(ctx, created.id, { resolution: "Done manually without erasing" })).rejects.toThrow(/Erase account/);
    await service.queueAccountErasure(ctx, created.id, null);
    await tasks["privacy.erase"]!({ requestId: created.id, staffUserId: staffUser.id }, taskCtx);
    const [user] = await db.select().from(s.users).where(eq(s.users.id, subject.id));
    expect(user!.status).toBe("closed");
    expect(user!.email).toBeNull();
    expect(user!.displayName).toBe("Deleted user");
    const [profile] = await db.select().from(s.candidateProfiles).where(eq(s.candidateProfiles.userId, subject.id));
    expect(profile!.deletedAt).not.toBeNull();
    expect(profile!.legalName).toBeNull();
    const [row] = await db.select().from(s.dataRequests).where(eq(s.dataRequests.id, created.id));
    expect(row!.status).toBe("completed");
    expect(row!.retentionExceptions).toBeTruthy();
  });

  describe("erasure of an organisation owner", () => {
    const day = 24 * 60 * 60 * 1000;
    async function ownedOrganization(label: string) {
      await fx.seedReferenceData();
      const owner = await makeUser(`privacy-owner-${label}`);
      const org = await orgService.createOrganization("employer", { name: `Erasure Co ${label} ${run}`, countryCode: "IN", city: "Hyderabad" }, sessionUser(owner));
      return { owner, org };
    }
    async function addMember(orgId: string, label: string, roleKey: string, joinedDaysAgo: number) {
      const user = await makeUser(`privacy-member-${label}`);
      await db.insert(s.organizationMembers).values({ organizationId: orgId, userId: user.id, roleId: await fx.templateRoleId("employer", roleKey), status: "active", joinedAt: new Date(Date.now() - joinedDaysAgo * day) });
      return user;
    }
    const erase = (userId: string, code: string) => erasure.eraseAccount(ctx, { userId, requestId: randomUUID(), requestCode: code });
    const orgRow = async (id: string) => (await db.select().from(s.organizations).where(eq(s.organizations.id, id)))[0]!;
    const memberRow = async (orgId: string, userId: string) => (await db.select().from(s.organizationMembers).where(and(eq(s.organizationMembers.organizationId, orgId), eq(s.organizationMembers.userId, userId))))[0]!;

    it("promotes the longest-serving member (admins first) when the sole owner is erased", async () => {
      const { owner, org } = await ownedOrganization("promote");
      const recruiter = await addMember(org.id, "promote-recruiter", "recruiter", 30);
      const admin = await addMember(org.id, "promote-admin", "admin", 3);
      const since = new Date(Date.now() - 1000);
      const summary = await erase(owner.id, `DSR-${run}-P`);
      expect(summary.organizations).toEqual([expect.objectContaining({ organizationId: org.id, outcome: "promoted", newOwnerUserId: admin.id })]);
      expect((await orgRow(org.id)).status).toBe("draft");
      expect((await memberRow(org.id, owner.id)).status).toBe("disabled");
      expect((await fx.memberContext<"employer">(fx.toSessionUser(admin), org.id)).isOwner).toBe(true);
      expect((await fx.memberContext<"employer">(fx.toSessionUser(recruiter), org.id)).isOwner).toBe(false);
      const sent = await fx.tasksSince(since, "notifications.dispatch");
      const handover = sent.find((t) => t.payload.event === "org.ownership_transferred");
      expect(handover).toBeTruthy();
      expect(JSON.stringify(handover!.payload.recipients)).toContain(admin.id);
      const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "organization.ownership_transferred"), eq(s.auditLogs.entityId, org.id)));
      expect(audits).toHaveLength(1);
    });

    it("suspends the organisation as orphaned and flags staff when nobody else is left", async () => {
      const { owner, org } = await ownedOrganization("orphan");
      await addMember(org.id, "orphan-disabled", "admin", 10).then((u) => db.update(s.organizationMembers).set({ status: "disabled" }).where(eq(s.organizationMembers.userId, u.id)));
      const since = new Date(Date.now() - 1000);
      const summary = await erase(owner.id, `DSR-${run}-O`);
      expect(summary.organizations).toEqual([expect.objectContaining({ organizationId: org.id, outcome: "orphaned", previousStatus: "draft" })]);
      const row = await orgRow(org.id);
      expect(row.status).toBe("suspended");
      expect(row.suspendedAt).not.toBeNull();
      expect(row.statusReason).toMatch(/Orphaned/);
      expect(row.statusReason).toContain(`DSR-${run}-O`);
      expect(row.metadata.statusBeforeSuspension).toBe("draft");
      expect(row.metadata.orphanedReason).toBe("owner_erased");
      const staffAlerts = await fx.tasksSince(since, "notifications.dispatch_staff");
      expect(staffAlerts.some((t) => t.payload.event === "org.orphaned" && t.payload.permission === "orgs.manage")).toBe(true);
      const [task] = await db.select().from(s.tasks).where(eq(s.tasks.organizationId, org.id));
      expect(task?.title).toContain("Orphaned organisation");
      expect(task?.priority).toBe("high");
      const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "organization.orphaned"), eq(s.auditLogs.entityId, org.id)));
      expect(audits).toHaveLength(1);
    });

    it("leaves an organisation alone when another active owner remains", async () => {
      const { owner, org } = await ownedOrganization("coowner");
      const coOwner = await addMember(org.id, "coowner-second", "owner", 1);
      const summary = await erase(owner.id, `DSR-${run}-C`);
      expect(summary.organizations).toEqual([]);
      expect((await orgRow(org.id)).status).toBe("draft");
      expect((await fx.memberContext<"employer">(fx.toSessionUser(coOwner), org.id)).isOwner).toBe(true);
      expect((await memberRow(org.id, owner.id)).status).toBe("disabled");
    });
  });

  it("refuses staff without the permission", async () => {
    const weak = { ...ctx, permissions: new Set<string>(["candidates.view"]) };
    await expect(queries.listDataRequests(weak, {}, { page: 1, pageSize: 10, offset: 0 })).rejects.toThrow(/permission/);
  });
});
