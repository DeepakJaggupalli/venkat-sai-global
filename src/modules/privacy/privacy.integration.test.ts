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

  it("refuses staff without the permission", async () => {
    const weak = { ...ctx, permissions: new Set<string>(["candidates.view"]) };
    await expect(queries.listDataRequests(weak, {}, { page: 1, pageSize: 10, offset: 0 })).rejects.toThrow(/permission/);
  });
});
