/**
 * Integration-test fixtures for the organizations and training modules (never imported by app code).
 * Builds real rows in an isolated vsg_test_* database and the actor contexts services expect.
 */
import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { PLATFORM_PERMISSIONS, type PlatformPermission } from "@/config/permissions";
import { db } from "@/db";
import { candidateProfiles, files, organizationMembers, organizations, roles, users } from "@/db/schema";
import type { FilePurpose, OrgType } from "@/db/schema/_constants";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";

export const TEST_EMAIL_DOMAIN = "vsg-test.invalid";

let seeded = false;

/** Currencies, countries and default roles (idempotent production seeds). */
export async function seedReferenceData(): Promise<void> {
  if (seeded) return;
  const { seedCurrencies } = await import("@/server/seed/currencies");
  const { seedCountries } = await import("@/server/seed/countries");
  const { seedRoles } = await import("@/server/seed/roles");
  await seedCurrencies();
  await seedCountries();
  await seedRoles();
  seeded = true;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
}

export async function createUser(opts: { email?: string | null; verified?: boolean; isStaff?: boolean; displayName?: string; status?: "active" | "suspended" } = {}): Promise<SessionUser> {
  const email = opts.email === undefined ? uniqueEmail("user") : opts.email;
  const [row] = await db
    .insert(users)
    .values({
      email,
      emailVerifiedAt: opts.verified === false || !email ? null : new Date(),
      displayName: opts.displayName ?? "Test User",
      isStaff: opts.isStaff ?? false,
      status: opts.status ?? "active",
    })
    .returning();
  return toSessionUser(row!);
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

export async function reloadUser(userId: string): Promise<SessionUser> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return toSessionUser(row!);
}

/** Staff context with exactly these permissions (default: every platform permission). */
export function staffContext(user: SessionUser, permissions?: PlatformPermission[]): StaffContext {
  const list = permissions ?? PLATFORM_PERMISSIONS.map((p) => p.key);
  return { user: { ...user, isStaff: true }, roleKeys: ["test"], permissions: new Set(list), isSuperAdmin: !permissions };
}

/** Portal context of `userId` in `organizationId`, built from the database like getOrgContext(). */
export async function memberContext<T extends OrgType>(user: SessionUser, organizationId: string): Promise<OrgContext<T>> {
  const [row] = await db
    .select({ member: organizationMembers, org: organizations, role: roles })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(eq(organizationMembers.userId, user.id), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new Error("membership not found");
  return {
    orgType: row.org.type as T,
    user,
    sessionId: `test-session-${user.id}`,
    organization: row.org,
    membership: { id: row.member.id, status: row.member.status, jobTitle: row.member.jobTitle, department: row.member.department },
    role: { id: row.role.id, key: row.role.key, name: row.role.name },
    permissions: new Set(row.role.permissions),
    isOwner: row.role.key === "owner",
  };
}

export async function templateRoleId(scope: OrgType, key: string): Promise<string> {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.scope, scope), eq(roles.key, key), isNull(roles.organizationId)))
    .limit(1);
  if (!row) throw new Error(`role ${scope}/${key} missing`);
  return row.id;
}

/** A files row (no bytes needed: services only check metadata). */
export async function createFileRow(opts: { purpose: FilePurpose; ownerUserId: string; organizationId?: string | null; mimeType?: string; visibility?: "private" | "public" }): Promise<string> {
  const id = randomUUID();
  await db.insert(files).values({
    id,
    storageDriver: "local",
    storageKey: `test/${id}`,
    originalName: "document.pdf",
    mimeType: opts.mimeType ?? "application/pdf",
    sizeBytes: 1024,
    sha256: "0".repeat(64),
    visibility: opts.visibility ?? "private",
    purpose: opts.purpose,
    ownerUserId: opts.ownerUserId,
    organizationId: opts.organizationId ?? null,
    scanStatus: "clean",
  });
  return id;
}

export async function createCandidate(user?: SessionUser): Promise<{ user: SessionUser; candidateId: string }> {
  const owner = user ?? (await createUser({ displayName: "Candidate Test" }));
  const [row] = await db.insert(candidateProfiles).values({ userId: owner.id }).returning({ id: candidateProfiles.id });
  return { user: owner, candidateId: row!.id };
}

/** Fixture shortcut: mark an organisation verified (the verification flow itself is tested separately). */
export async function markOrganizationVerified(organizationId: string, verificationExpiresAt: Date | null = null): Promise<void> {
  await db.update(organizations).set({ status: "verified", verifiedAt: new Date(), verificationExpiresAt }).where(eq(organizations.id, organizationId));
}

/** Background tasks enqueued since `since` (notifications are delivered by tasks). */
export async function tasksSince(since: Date, type?: string): Promise<{ type: string; payload: Record<string, unknown> }[]> {
  const rows = await db.execute<{ type: string; payload: Record<string, unknown> }>(
    sql`select type, payload from background_jobs where created_at >= ${since} ${type ? sql`and type = ${type}` : sql``} order by id`,
  );
  return rows.rows;
}
