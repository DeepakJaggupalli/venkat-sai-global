import "server-only";

import { and, desc, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";

import { PLATFORM_PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { fileAccessGrants, files, organizationMembers, organizations, roles, userRoles, users } from "@/db/schema";
import { audit } from "@/modules/audit";
import { getStaffContext } from "@/modules/identity/authz";
import { getCurrentUser } from "@/modules/identity/session";
import { getSetting } from "@/modules/settings";

import { evaluateFileAccess, type AccessFile } from "./access-rules";
import { getFilePolicy } from "./policies";
import type { ActiveGrant, FileAccessDecision, FileAccessGrantRow, FileViewer } from "./types";

/**
 * File access control: who is asking (FileViewer), may they read this file (checkFileAccess /
 * canAccessFile), and explicit, revocable grants for people outside the default rules
 * (grantFileAccess / revokeFileAccess). The rules themselves live in access-rules.ts.
 */

const ALL_PLATFORM_PERMISSIONS: ReadonlySet<string> = new Set(PLATFORM_PERMISSIONS.map((p) => p.key));

async function loadMemberships(userId: string): Promise<FileViewer["memberships"]> {
  const rows = await db
    .select({ organizationId: organizationMembers.organizationId, organizationType: organizations.type, permissions: roles.permissions })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), isNull(organizations.deletedAt)));
  return rows.map((r) => ({ organizationId: r.organizationId, organizationType: r.organizationType, permissions: new Set(r.permissions) }));
}

/** The signed-in viewer (memoised per request), or null when signed out / 2FA incomplete. */
export const getCurrentFileViewer = cache(async (): Promise<FileViewer | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  let staffPermissions: ReadonlySet<string> = new Set();
  if (user.isStaff) {
    const ctx = await getStaffContext();
    // Same rule as requireStaff(): staff who must set up 2FA get no staff powers until they do.
    const mustSetUp2fa = !user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"));
    if (ctx && !mustSetUp2fa) staffPermissions = ctx.permissions;
  }
  return { userId: user.id, isStaff: user.isStaff, staffPermissions, memberships: await loadMemberships(user.id) };
});

/** Viewer for an arbitrary user id (background jobs, exports). Null when the user is missing or inactive. */
export async function loadFileViewer(userId: string): Promise<FileViewer | null> {
  const [user] = await db.select({ id: users.id, isStaff: users.isStaff, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === "suspended" || user.status === "closed") return null;
  let staffPermissions: ReadonlySet<string> = new Set();
  if (user.isStaff) {
    const rows = await db
      .select({ key: roles.key, permissions: roles.permissions })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(roles.scope, "platform")));
    staffPermissions = rows.some((r) => r.key === SUPER_ADMIN_ROLE_KEY) ? ALL_PLATFORM_PERMISSIONS : new Set(rows.flatMap((r) => r.permissions));
  }
  return { userId: user.id, isStaff: user.isStaff, staffPermissions, memberships: await loadMemberships(user.id) };
}

async function loadRelevantGrants(viewer: FileViewer, fileId: string): Promise<ActiveGrant[]> {
  const orgIds = viewer.memberships.map((m) => m.organizationId);
  const grantee: SQL | undefined = orgIds.length
    ? or(eq(fileAccessGrants.granteeUserId, viewer.userId), inArray(fileAccessGrants.granteeOrganizationId, orgIds))
    : eq(fileAccessGrants.granteeUserId, viewer.userId);
  return db
    .select({
      id: fileAccessGrants.id,
      granteeUserId: fileAccessGrants.granteeUserId,
      granteeOrganizationId: fileAccessGrants.granteeOrganizationId,
      expiresAt: fileAccessGrants.expiresAt,
      revokedAt: fileAccessGrants.revokedAt,
    })
    .from(fileAccessGrants)
    .where(
      and(
        eq(fileAccessGrants.fileId, fileId),
        isNull(fileAccessGrants.revokedAt),
        or(isNull(fileAccessGrants.expiresAt), gt(fileAccessGrants.expiresAt, new Date())),
        grantee,
      ),
    );
}

/** Full access decision (reason when denied, how access was obtained when allowed). */
export async function checkFileAccess(viewer: FileViewer | null, file: AccessFile): Promise<FileAccessDecision> {
  const first = evaluateFileAccess(viewer, file);
  if (first.allowed || !viewer || first.reason !== "forbidden") return first;
  if (getFilePolicy(file.purpose).ownerOnly) return first;
  // Only hit the grants table when the default rules said no.
  const grants = await loadRelevantGrants(viewer, file.id);
  return grants.length ? evaluateFileAccess(viewer, file, grants) : first;
}

/** May this viewer read this file? (Pass `await getCurrentFileViewer()` for the signed-in user.) */
export async function canAccessFile(viewer: FileViewer | null, file: AccessFile): Promise<boolean> {
  return (await checkFileAccess(viewer, file)).allowed;
}

// ---------------------------------------------------------------------------
// Explicit grants
// ---------------------------------------------------------------------------

const grantSchema = z
  .object({
    fileId: z.uuid(),
    granteeUserId: z.uuid().nullish(),
    granteeOrganizationId: z.uuid().nullish(),
    reason: z.string().trim().min(3).max(300),
    contextType: z.string().trim().max(60).nullish(),
    contextId: z.uuid().nullish(),
    expiresAt: z.date().nullish(),
    grantedByUserId: z.uuid().nullish(),
  })
  .refine((v) => Boolean(v.granteeUserId) !== Boolean(v.granteeOrganizationId), { message: "Provide exactly one of granteeUserId or granteeOrganizationId" });

export type GrantFileAccessInput = z.input<typeof grantSchema>;

/**
 * Give a user or an organisation read access to a private file (e.g. an employer to a candidate's
 * resume once the candidate applied). Idempotent per (file, grantee, context): an existing active
 * grant is reused (its expiry extended when the new one is later). The CALLER must have
 * authorised the sharing (consent, ownership, permissions). Data exports can never be shared.
 */
export async function grantFileAccess(input: GrantFileAccessInput, opts: { tx?: DbOrTx } = {}): Promise<{ id: string; created: boolean }> {
  const data = grantSchema.parse(input);
  const run = async (tx: DbOrTx) => {
    const [file] = await tx
      .select({ id: files.id, purpose: files.purpose, organizationId: files.organizationId })
      .from(files)
      .where(and(eq(files.id, data.fileId), isNull(files.deletedAt)))
      .limit(1);
    if (!file) throw new Error("grantFileAccess: file not found");
    if (getFilePolicy(file.purpose).ownerOnly) throw new Error(`grantFileAccess: ${file.purpose} files cannot be shared`);

    const [existing] = await tx
      .select({ id: fileAccessGrants.id, expiresAt: fileAccessGrants.expiresAt })
      .from(fileAccessGrants)
      .where(
        and(
          eq(fileAccessGrants.fileId, data.fileId),
          isNull(fileAccessGrants.revokedAt),
          or(isNull(fileAccessGrants.expiresAt), gt(fileAccessGrants.expiresAt, new Date())),
          data.granteeUserId ? eq(fileAccessGrants.granteeUserId, data.granteeUserId) : eq(fileAccessGrants.granteeOrganizationId, data.granteeOrganizationId!),
          data.contextType ? eq(fileAccessGrants.contextType, data.contextType) : isNull(fileAccessGrants.contextType),
          data.contextId ? eq(fileAccessGrants.contextId, data.contextId) : isNull(fileAccessGrants.contextId),
        ),
      )
      .limit(1);
    if (existing) {
      const extend = existing.expiresAt && (!data.expiresAt || data.expiresAt > existing.expiresAt);
      if (extend) await tx.update(fileAccessGrants).set({ expiresAt: data.expiresAt ?? null }).where(eq(fileAccessGrants.id, existing.id));
      return { id: existing.id, created: false };
    }

    const [row] = await tx
      .insert(fileAccessGrants)
      .values({
        fileId: data.fileId,
        granteeUserId: data.granteeUserId ?? null,
        granteeOrganizationId: data.granteeOrganizationId ?? null,
        grantedByUserId: data.grantedByUserId ?? null,
        reason: data.reason,
        contextType: data.contextType ?? null,
        contextId: data.contextId ?? null,
        expiresAt: data.expiresAt ?? null,
      })
      .returning({ id: fileAccessGrants.id });
    await audit({
      action: "file.access_granted",
      entityType: "file",
      entityId: data.fileId,
      organizationId: file.organizationId,
      metadata: {
        grantId: row!.id,
        purpose: file.purpose,
        granteeUserId: data.granteeUserId ?? null,
        granteeOrganizationId: data.granteeOrganizationId ?? null,
        reason: data.reason,
        contextType: data.contextType ?? null,
        contextId: data.contextId ?? null,
        expiresAt: data.expiresAt?.toISOString() ?? null,
      },
      ...(data.grantedByUserId !== undefined ? { actorUserId: data.grantedByUserId } : {}),
      tx,
    });
    return { id: row!.id, created: true };
  };
  return opts.tx ? run(opts.tx) : db.transaction(run);
}

export type RevokeFileAccessFilter =
  | { grantId: string }
  | { fileId: string; granteeUserId?: string; granteeOrganizationId?: string; contextType?: string; contextId?: string };

/** Revoke matching active grants (e.g. the candidate withdrew the application). Returns how many. */
export async function revokeFileAccess(filter: RevokeFileAccessFilter, opts: { revokedByUserId?: string | null; tx?: DbOrTx } = {}): Promise<number> {
  const conditions: SQL[] = [isNull(fileAccessGrants.revokedAt)];
  if ("grantId" in filter) {
    conditions.push(eq(fileAccessGrants.id, z.uuid().parse(filter.grantId)));
  } else {
    conditions.push(eq(fileAccessGrants.fileId, z.uuid().parse(filter.fileId)));
    if (filter.granteeUserId) conditions.push(eq(fileAccessGrants.granteeUserId, z.uuid().parse(filter.granteeUserId)));
    if (filter.granteeOrganizationId) conditions.push(eq(fileAccessGrants.granteeOrganizationId, z.uuid().parse(filter.granteeOrganizationId)));
    if (filter.contextType) conditions.push(eq(fileAccessGrants.contextType, filter.contextType));
    if (filter.contextId) conditions.push(eq(fileAccessGrants.contextId, z.uuid().parse(filter.contextId)));
  }
  const executor = opts.tx ?? db;
  const revoked = await executor
    .update(fileAccessGrants)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: fileAccessGrants.id, fileId: fileAccessGrants.fileId });
  const byFile = new Map<string, string[]>();
  for (const r of revoked) byFile.set(r.fileId, [...(byFile.get(r.fileId) ?? []), r.id]);
  for (const [fileId, grantIds] of byFile) {
    await audit({
      action: "file.access_revoked",
      entityType: "file",
      entityId: fileId,
      metadata: { grantIds },
      ...(opts.revokedByUserId !== undefined ? { actorUserId: opts.revokedByUserId } : {}),
      tx: opts.tx,
    });
  }
  return revoked.length;
}

/** All grants of a file, newest first (admin / owner views). */
export async function listFileGrants(fileId: string): Promise<FileAccessGrantRow[]> {
  return db.select().from(fileAccessGrants).where(eq(fileAccessGrants.fileId, fileId)).orderBy(desc(fileAccessGrants.createdAt));
}
