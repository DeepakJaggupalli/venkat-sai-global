import "server-only";

import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { candidateProfiles, roles, securityEvents, sessions, userRoles, users, userTwoFactor } from "@/db/schema";
import type { UserStatus } from "@/db/schema/_constants";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery } from "@/lib/http";
import { audit, logSecurityEvent } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { invalidateUserSessions } from "@/modules/identity/session";

/**
 * Command Centre user administration. The identity module has no staff-facing user API yet, so this
 * private service implements it (reported as a cross-module need). Every function re-checks the staff
 * permission, refuses self-escalation and audits. Contact details are only returned to callers that
 * already hold users.view (account administration).
 */

export type UserListFilters = { q?: string; status?: UserStatus; kind?: "staff" | "candidate" | "organization" };

function likeTerm(q: string) {
  return `%${q.replace(/[%_\\]/g, "")}%`;
}

export async function listUsers(ctx: StaffContext, filters: UserListFilters, page: PageQuery) {
  if (!staffCan(ctx, "users.view")) throw new ActionError("Not allowed.", { code: "forbidden" });
  const where: SQL[] = [];
  if (filters.status) where.push(eq(users.status, filters.status));
  if (filters.kind === "staff") where.push(eq(users.isStaff, true));
  if (filters.kind === "candidate") where.push(sql`exists (select 1 from candidate_profiles cp where cp.user_id = ${users.id})`);
  if (filters.kind === "organization") where.push(sql`exists (select 1 from organization_members om where om.user_id = ${users.id})`);
  if (filters.q) {
    const t = likeTerm(filters.q.toLowerCase());
    where.push(or(ilike(users.displayName, t), ilike(users.email, t), ilike(users.phone, t))!);
  }
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        phone: users.phone,
        status: users.status,
        isStaff: users.isStaff,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        hasCandidate: sql<boolean>`exists (select 1 from candidate_profiles cp where cp.user_id = ${users.id})`,
        orgCount: sql<number>`(select count(*)::int from organization_members om where om.user_id = ${users.id} and om.status = 'active')`,
      })
      .from(users)
      .where(condition)
      .orderBy(desc(users.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(users).where(condition),
  ]);
  return paginated(rows, totals[0]?.value ?? 0, page);
}

export async function getUserAdminDetail(ctx: StaffContext, userId: string) {
  if (!staffCan(ctx, "users.view")) throw new ActionError("Not allowed.", { code: "forbidden" });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [roleRows, twoFactor, sessionRows, events, candidate, platformRoles] = await Promise.all([
    db
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(roles.scope, "platform"))),
    db.select({ enabledAt: userTwoFactor.enabledAt }).from(userTwoFactor).where(eq(userTwoFactor.userId, userId)).limit(1),
    db
      .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), sql`${sessions.expiresAt} > now()`))
      .orderBy(desc(sessions.lastSeenAt))
      .limit(20),
    db
      .select({ id: securityEvents.id, type: securityEvents.type, severity: securityEvents.severity, occurredAt: securityEvents.occurredAt })
      .from(securityEvents)
      .where(eq(securityEvents.userId, userId))
      .orderBy(desc(securityEvents.occurredAt))
      .limit(25),
    db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1),
    listPlatformRoles(),
  ]);
  return {
    user: { ...user, passwordHash: undefined, hasPassword: Boolean(user.passwordHash) },
    roles: roleRows,
    twoFactorEnabled: Boolean(twoFactor[0]?.enabledAt),
    sessions: sessionRows.map((s) => ({ ...s, key: s.id.slice(0, 8) })),
    securityEvents: events,
    candidateId: candidate[0]?.id ?? null,
    platformRoles,
  };
}

export async function listPlatformRoles() {
  return db.select({ id: roles.id, key: roles.key, name: roles.name, description: roles.description, permissions: roles.permissions }).from(roles).where(eq(roles.scope, "platform")).orderBy(roles.sortOrder, roles.name);
}

async function isSuperAdminUser(userId: string): Promise<boolean> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.scope, "platform"), eq(roles.key, SUPER_ADMIN_ROLE_KEY)))
    .limit(1);
  return rows.length > 0;
}

function assertNotSelf(ctx: StaffContext, userId: string, what: string) {
  if (ctx.user.id === userId) throw new ActionError(`You cannot ${what} your own account here. Ask another administrator.`);
}

async function assertCanTouch(ctx: StaffContext, userId: string) {
  if (!ctx.isSuperAdmin && (await isSuperAdminUser(userId))) throw new ActionError("Only a Super Admin can change a Super Admin account.");
}

export async function setUserStatus(ctx: StaffContext, userId: string, status: "active" | "suspended", reason: string): Promise<void> {
  if (!staffCan(ctx, "users.manage")) throw new ActionError("Not allowed.", { code: "forbidden" });
  assertNotSelf(ctx, userId, status === "suspended" ? "suspend" : "reactivate");
  await assertCanTouch(ctx, userId);
  const [user] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ActionError("User not found.");
  if (user.status === "closed") throw new ActionError("Closed accounts cannot be changed.");
  if (status === "active" && user.status !== "suspended") throw new ActionError("Only suspended accounts can be reactivated.");
  if (status === "suspended" && user.status === "suspended") throw new ActionError("The account is already suspended.");
  await db.update(users).set({ status, statusReason: reason }).where(eq(users.id, userId));
  if (status === "suspended") await invalidateUserSessions(userId);
  await audit({ action: status === "suspended" ? "user.suspended" : "user.reactivated", entityType: "user", entityId: userId, metadata: { reason }, actorUserId: ctx.user.id, actorType: "staff" });
  await logSecurityEvent({ userId, type: status === "suspended" ? "account_suspended_by_staff" : "account_reactivated_by_staff", severity: "warning", metadata: { by: ctx.user.id } });
}

export async function revokeAllUserSessions(ctx: StaffContext, userId: string): Promise<void> {
  if (!staffCan(ctx, "users.security")) throw new ActionError("Not allowed.", { code: "forbidden" });
  assertNotSelf(ctx, userId, "revoke the sessions of");
  await assertCanTouch(ctx, userId);
  await invalidateUserSessions(userId);
  await audit({ action: "user.sessions_revoked_by_staff", entityType: "user", entityId: userId, actorUserId: ctx.user.id, actorType: "staff" });
  await logSecurityEvent({ userId, type: "sessions_revoked_by_staff", severity: "warning", metadata: { by: ctx.user.id } });
}

/** Revoke one session. The page passes the 8-character prefix shown in the list, never the session id. */
export async function revokeUserSession(ctx: StaffContext, userId: string, sessionKey: string): Promise<void> {
  if (!staffCan(ctx, "users.security")) throw new ActionError("Not allowed.", { code: "forbidden" });
  assertNotSelf(ctx, userId, "revoke the sessions of");
  await assertCanTouch(ctx, userId);
  if (!/^[A-Za-z0-9_-]{8}$/.test(sessionKey)) throw new ActionError("Session not found.");
  const rows = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), sql`left(${sessions.id}, 8) = ${sessionKey}`));
  if (rows.length !== 1) throw new ActionError("Session not found or already ended.");
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, rows[0]!.id)));
  await audit({ action: "user.session_revoked_by_staff", entityType: "user", entityId: userId, actorUserId: ctx.user.id, actorType: "staff" });
  await logSecurityEvent({ userId, type: "session_revoked_by_staff", severity: "info", metadata: { by: ctx.user.id } });
}

/** Remove the authenticator app and recovery codes (lost device). Signs the user out everywhere. */
export async function resetUserTwoFactor(ctx: StaffContext, userId: string, reason: string): Promise<void> {
  if (!staffCan(ctx, "users.security")) throw new ActionError("Not allowed.", { code: "forbidden" });
  assertNotSelf(ctx, userId, "reset two-factor authentication for");
  await assertCanTouch(ctx, userId);
  const deleted = await db.delete(userTwoFactor).where(eq(userTwoFactor.userId, userId)).returning({ userId: userTwoFactor.userId });
  if (!deleted.length) throw new ActionError("This account does not use two-factor authentication.");
  await invalidateUserSessions(userId);
  await audit({ action: "user.two_factor_reset_by_staff", entityType: "user", entityId: userId, metadata: { reason }, actorUserId: ctx.user.id, actorType: "staff" });
  await logSecurityEvent({ userId, type: "two_factor_reset_by_staff", severity: "critical", metadata: { by: ctx.user.id } });
}

/**
 * Replace a person's platform (staff) roles. Guards: not your own roles; only Super Admins grant or
 * remove Super Admin, and the last Super Admin cannot lose the role; others may only grant roles whose
 * permissions they hold themselves. A person with no platform role stops being staff.
 */
export async function setStaffRoles(ctx: StaffContext, userId: string, roleIds: string[]): Promise<void> {
  if (!staffCan(ctx, "users.roles")) throw new ActionError("Not allowed.", { code: "forbidden" });
  assertNotSelf(ctx, userId, "change the roles of");
  await db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new ActionError("User not found.");
    const platform = await tx.select({ id: roles.id, key: roles.key, permissions: roles.permissions }).from(roles).where(eq(roles.scope, "platform"));
    const byId = new Map(platform.map((r) => [r.id, r]));
    const unique = [...new Set(roleIds)];
    if (unique.some((id) => !byId.has(id))) throw new ActionError("Choose roles from the list.");
    const current = await tx.select({ roleId: userRoles.roleId }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(and(eq(userRoles.userId, userId), eq(roles.scope, "platform")));
    const currentIds = new Set(current.map((c) => c.roleId));
    const added = unique.filter((id) => !currentIds.has(id));
    const removed = [...currentIds].filter((id) => !unique.includes(id));
    const touchesSuper = [...added, ...removed].some((id) => byId.get(id)?.key === SUPER_ADMIN_ROLE_KEY);
    if (touchesSuper && !ctx.isSuperAdmin) throw new ActionError("Only a Super Admin can grant or remove the Super Admin role.");
    if (!ctx.isSuperAdmin) {
      if ([...currentIds].some((id) => byId.get(id)?.key === SUPER_ADMIN_ROLE_KEY)) throw new ActionError("Only a Super Admin can change a Super Admin account.");
      for (const id of added) {
        const missing = byId.get(id)!.permissions.filter((p) => !ctx.permissions.has(p));
        if (missing.length) throw new ActionError("You can only grant roles whose permissions you hold yourself.");
      }
    }
    if (removed.some((id) => byId.get(id)?.key === SUPER_ADMIN_ROLE_KEY)) {
      const superRole = platform.find((r) => r.key === SUPER_ADMIN_ROLE_KEY)!;
      const [{ value }] = await tx
        .select({ value: count() })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(and(eq(userRoles.roleId, superRole.id), eq(users.status, "active")));
      if (Number(value) <= 1) throw new ActionError("At least one active Super Admin must remain.");
    }
    if (removed.length) await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, removed)));
    if (added.length) await tx.insert(userRoles).values(added.map((roleId) => ({ userId, roleId, grantedByUserId: ctx.user.id }))).onConflictDoNothing();
    await tx.update(users).set({ isStaff: unique.length > 0 }).where(eq(users.id, userId));
    if (removed.length || !unique.length) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit({
      action: "user.staff_roles_changed",
      entityType: "user",
      entityId: userId,
      metadata: { added: added.map((id) => byId.get(id)!.key), removed: removed.map((id) => byId.get(id)!.key) },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
  });
  await logSecurityEvent({ userId, type: "staff_roles_changed", severity: "warning", metadata: { by: ctx.user.id } });
}

/**
 * Create a staff account (or promote an existing person) with roles. New accounts have no password:
 * the caller sends the set-password link through the identity module's reset flow.
 */
export async function createStaffUser(ctx: StaffContext, input: { displayName: string; email: string; roleIds: string[] }): Promise<{ id: string; created: boolean }> {
  if (!staffCan(ctx, "users.roles")) throw new ActionError("Not allowed.", { code: "forbidden" });
  if (!input.roleIds.length) throw new ActionError("Choose at least one role.", { fieldErrors: { roleIds: ["Choose at least one role"] } });
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id, status: users.status, isStaff: users.isStaff }).from(users).where(eq(users.email, email)).limit(1);
  if (existing?.isStaff) throw new ActionError("This person is already on the team. Change their roles from their account page.", { fieldErrors: { email: ["Already a staff member"] } });
  if (existing && existing.status !== "active") throw new ActionError("That account is not active.", { fieldErrors: { email: ["Account not active"] } });
  let id = existing?.id;
  if (!id) {
    const [row] = await db.insert(users).values({ email, displayName: input.displayName.trim(), status: "active", isStaff: false, signupSource: "staff_invite" }).returning({ id: users.id });
    id = row!.id;
    await audit({ action: "user.created_by_staff", entityType: "user", entityId: id, actorUserId: ctx.user.id, actorType: "staff" });
  }
  await setStaffRoles(ctx, id, input.roleIds);
  return { id, created: !existing };
}
