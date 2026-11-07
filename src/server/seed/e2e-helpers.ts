import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { PLATFORM_PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db } from "@/db";
import { organizationMembers, organizations, roles, sessions, userRoles, users } from "@/db/schema";
import type { FilePurpose, OrgType } from "@/db/schema/_constants";
import { storeFile } from "@/modules/files";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { evaluatePasswordStrength, hashPassword } from "@/modules/identity/password";
import { currentPolicyVersions, recordSignupConsents } from "@/modules/identity/service";
import type { SessionUser } from "@/modules/identity/session";

/**
 * Building blocks for the local-only E2E seed (src/server/seed/e2e.ts). Never imported by app code or by the
 * production seed. Everything here is idempotent: rows are found by natural key and reset, not duplicated.
 */

export const E2E_EMAIL_DOMAIN = "e2e.venkatsai.test";
export const e2eEmail = (local: string): string => `${local}@${E2E_EMAIL_DOMAIN}`;

export type SeedLog = (message: string) => void;

/** Random password that passes the platform policy (length, variety, no email / name parts). */
export function generatePassword(context: { email: string; name: string }): string {
  for (;;) {
    const candidate = `Vsg-${randomBytes(15).toString("base64url")}-9q`;
    if (evaluatePasswordStrength(candidate, { minLength: 12, email: context.email, name: context.name }).ok) return candidate;
  }
}

export function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    displayName: row.displayName,
    avatarFileId: row.avatarFileId,
    status: row.status,
    isStaff: row.isStaff,
    locale: row.locale,
    timezone: row.timezone,
    hasPassword: !!row.passwordHash,
    twoFactorEnabled: false,
  };
}

export async function loadSessionUser(userId: string): Promise<SessionUser> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new Error(`E2E seed: user ${userId} not found`);
  return toSessionUser(row);
}

export type PasswordAccount = { email: string; displayName: string; password: string; isStaff?: boolean };

/**
 * Create the account, or reset an existing one to a known state: active, email verified, the given password,
 * no lock-out. Sessions are revoked only when the password actually changed (so --keep-passwords does not
 * sign other engineers out). Returns the user id and whether the row was created.
 */
export async function upsertPasswordUser(account: PasswordAccount, opts: { passwordChanged: boolean }): Promise<{ id: string; created: boolean }> {
  const email = account.email.toLowerCase();
  const passwordHash = await hashPassword(account.password);
  const now = new Date();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db
      .update(users)
      .set({
        displayName: account.displayName,
        isStaff: account.isStaff ?? false,
        status: "active",
        statusReason: null,
        closedAt: null,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
        passwordHash,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, existing.id));
    if (opts.passwordChanged) await db.delete(sessions).where(eq(sessions.userId, existing.id));
    return { id: existing.id, created: false };
  }
  const [created] = await db
    .insert(users)
    .values({
      email,
      emailVerifiedAt: now,
      passwordHash,
      passwordChangedAt: now,
      displayName: account.displayName,
      status: "active",
      isStaff: account.isStaff ?? false,
      signupSource: "seed",
    })
    .returning({ id: users.id });
  if (!account.isStaff) {
    await recordSignupConsents(created!.id, {
      versions: await currentPolicyVersions(),
      marketing: { email: false, sms: false, whatsapp: false },
      source: "signup",
      evidence: { seededBy: "e2e-seed" },
    });
  }
  return { id: created!.id, created: true };
}

/**
 * "Fresh" accounts are consumed by specs (onboarding creates an organisation, the age gate locks a date of
 * birth). Remove the previous account and whatever it created; when a foreign key keeps a row alive, the old
 * account is archived under another address instead so the canonical address is free again.
 */
export async function removeFreshAccount(email: string, log: SeedLog): Promise<void> {
  const [old] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!old) return;
  const memberships = await db.select({ organizationId: organizationMembers.organizationId }).from(organizationMembers).where(eq(organizationMembers.userId, old.id));
  for (const { organizationId } of memberships) {
    const [others] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), sql`${organizationMembers.userId} <> ${old.id}`));
    if ((others?.value ?? 0) > 0) continue;
    try {
      await db.transaction(async (tx) => {
        await tx.delete(organizations).where(eq(organizations.id, organizationId));
      });
    } catch {
      await db.update(organizations).set({ deletedAt: new Date(), isPublic: false }).where(eq(organizations.id, organizationId));
      log(`  note: organisation ${organizationId} created by a fresh account is referenced elsewhere; soft-deleted instead`);
    }
  }
  try {
    await db.transaction(async (tx) => {
      await tx.delete(users).where(eq(users.id, old.id));
    });
  } catch {
    const archived = `archived-${old.id.slice(0, 8)}-${Date.now().toString(36)}@${E2E_EMAIL_DOMAIN}`;
    await db
      .update(users)
      .set({ email: archived, status: "closed", statusReason: "E2E fresh account replaced", closedAt: new Date(), passwordHash: null })
      .where(eq(users.id, old.id));
    await db.delete(sessions).where(eq(sessions.userId, old.id));
    log(`  note: previous fresh account ${email} is referenced elsewhere; archived instead of deleted`);
  }
}

export async function templateRoleId(scope: OrgType | "platform", key: string): Promise<string> {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.scope, scope), eq(roles.key, key), isNull(roles.organizationId)))
    .limit(1);
  if (!row) throw new Error(`E2E seed: role template ${scope}/${key} is missing — run "npm run db:seed" first`);
  return row.id;
}

/** Give a staff user exactly one platform role template (removes other platform roles it had). */
export async function setStaffRole(userId: string, roleKey: string): Promise<void> {
  const roleId = await templateRoleId("platform", roleKey);
  const platformRoles = db.select({ id: roles.id }).from(roles).where(eq(roles.scope, "platform"));
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), sql`${userRoles.roleId} in (${platformRoles}) and ${userRoles.roleId} <> ${roleId}`));
  await db.insert(userRoles).values({ userId, roleId, grantedByUserId: null }).onConflictDoNothing();
}

/** Staff context of the E2E Super Admin (every platform permission), for calling domain services. */
export function superAdminContext(user: SessionUser): StaffContext {
  return {
    user: { ...user, isStaff: true },
    roleKeys: [SUPER_ADMIN_ROLE_KEY],
    permissions: new Set(PLATFORM_PERMISSIONS.map((p) => p.key)),
    isSuperAdmin: true,
  };
}

/** Portal context of `userId` in `organizationId`, built from the database the way getOrgContext() does. */
export async function orgContextFor<T extends OrgType>(userId: string, organizationId: string): Promise<OrgContext<T>> {
  const [row] = await db
    .select({ member: organizationMembers, org: organizations, role: roles })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new Error(`E2E seed: membership of ${userId} in ${organizationId} not found`);
  return {
    orgType: row.org.type as T,
    user: await loadSessionUser(userId),
    sessionId: `e2e-seed-${userId}`,
    organization: row.org,
    membership: { id: row.member.id, status: row.member.status, jobTitle: row.member.jobTitle, department: row.member.department },
    role: { id: row.role.id, key: row.role.key, name: row.role.name },
    permissions: new Set(row.role.permissions),
    isOwner: row.role.key === "owner",
  };
}

/** Add (or re-activate) a member with a template role. */
export async function ensureMember(organizationId: string, scope: OrgType, userId: string, roleKey: string): Promise<void> {
  const roleId = await templateRoleId(scope, roleKey);
  await db
    .insert(organizationMembers)
    .values({ organizationId, userId, roleId, status: "active", joinedAt: new Date() })
    .onConflictDoUpdate({ target: [organizationMembers.organizationId, organizationMembers.userId], set: { roleId, status: "active" } });
}

/** A minimal one-page PDF, stored through the files module like an upload (type sniffing included). */
const TEST_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

export async function storeTestPdf(opts: { purpose: FilePurpose; ownerUserId: string; organizationId?: string | null; name: string }): Promise<string> {
  const file = await storeFile({
    data: new Uint8Array(TEST_PDF),
    originalName: opts.name,
    declaredMimeType: "application/pdf",
    purpose: opts.purpose,
    ownerUserId: opts.ownerUserId,
    organizationId: opts.organizationId ?? null,
  });
  return file.id;
}

/** YYYY-MM-DD `days` from today (UTC). */
export function isoDay(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Date of birth for someone who is `years` old today (UTC), minus a few days so the birthday has passed. */
export function dateOfBirthForAge(years: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 10);
  return d.toISOString().slice(0, 10);
}
