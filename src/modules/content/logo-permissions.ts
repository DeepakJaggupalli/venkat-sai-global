import "server-only";

import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { cmsEntries, logoPermissions, organizations, users, type LogoPermissionStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";

import { entryLabel, takeEntryOffline } from "./entries";
import { syncEntryUsages } from "./entry-content";
import { assertStaff, dateFromCalendar, likePattern, rethrowConstraint } from "./internal";
import { CONTENT_ADMIN_PATHS } from "./links";
import { assertAssetsUsable, prepareEvidenceFile, syncMediaUsages } from "./media";
import type { LogoPermissionInput } from "./schemas";
import type { LogoPermissionRow } from "./types";

/**
 * Logo permissions: evidence that an organisation allowed Venkat Sai to show its name and logo, where, and until
 * when. Recording needs content.edit; approving and revoking need content.publish. A logo appears publicly only
 * while its permission is approved, unexpired and covers the location (checked by the public queries and the
 * content.publish_scheduled task, which marks lapsed permissions expired and takes their logos offline).
 * Records are evidence: they are revoked, never deleted.
 */

type Tx = DbOrTx;

export const LOGO_MEDIA_ENTITY_TYPE = "logo_permission";

async function lockPermission(id: string, tx: Tx): Promise<LogoPermissionRow> {
  const locked = await tx.execute<{ id: string }>(sql`select id from logo_permissions where id = ${id} for update`);
  if (!locked.rows.length) throw new ActionError("This logo permission could not be found.");
  const [row] = await tx.select().from(logoPermissions).where(eq(logoPermissions.id, id)).limit(1);
  if (!row) throw new ActionError("This logo permission could not be found.");
  return row;
}

/** Take client logo entries linked to a permission offline (revoked / expired permission). */
async function archiveLinkedLogos(permissionId: string, actorUserId: string | null, tx: Tx): Promise<number> {
  const linked = await tx
    .select()
    .from(cmsEntries)
    .where(and(eq(cmsEntries.logoPermissionId, permissionId), inArray(cmsEntries.status, ["published", "scheduled"]), sql`${cmsEntries.deletedAt} is null`));
  for (const entry of linked) {
    await takeEntryOffline(entry, "archived", actorUserId, tx);
    await syncEntryUsages(entry.id, tx);
    await audit({ action: "content.entry_archived", entityType: "cms_entry", entityId: entry.id, actorUserId, actorType: actorUserId ? undefined : "system", metadata: { reason: "Logo permission no longer valid", label: entryLabel(entry) }, tx });
  }
  return linked.length;
}

/** Record a new permission (pending) or update one. Approved permissions can only be changed by publishers. */
export async function saveLogoPermission(ctx: StaffContext, input: LogoPermissionInput): Promise<{ id: string; created: boolean }> {
  assertStaff(ctx, "content.edit");
  if (input.grantedAt && input.expiresAt && input.expiresAt <= input.grantedAt) {
    throw new ActionError("The expiry date must be after the grant date.", { fieldErrors: { expiresAt: ["Must be after the grant date"] } });
  }
  try {
    return await db.transaction(async (tx) => {
      if (input.organizationId) {
        const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
        if (!org) throw new ActionError("That organisation no longer exists.", { fieldErrors: { organizationId: ["Choose another organisation"] } });
      }
      if (input.logoAssetId) await assertAssetsUsable([{ assetId: input.logoAssetId, kinds: ["image"], label: "Logo" }], tx, "logoAssetId");
      const values = {
        organizationName: input.organizationName,
        organizationId: input.organizationId ?? null,
        relationship: input.relationship,
        logoAssetId: input.logoAssetId ?? null,
        permissionType: input.permissionType,
        evidenceReference: input.evidenceReference ?? null,
        grantedByName: input.grantedByName ?? null,
        grantedByDesignation: input.grantedByDesignation ?? null,
        grantedAt: dateFromCalendar(input.grantedAt),
        expiresAt: dateFromCalendar(input.expiresAt),
        displayLocations: input.displayLocations,
        conditions: input.conditions ?? null,
        notes: input.notes ?? null,
      };
      let id = input.id;
      let created = false;
      if (id) {
        const row = await lockPermission(id, tx);
        if (row.status === "revoked" || row.status === "expired") throw new ActionError("Revoked or expired permissions are kept as evidence and cannot be edited. Record a new permission.");
        if (row.status === "approved") assertStaff(ctx, "content.publish", "Only staff who can publish may change an approved permission.");
        const evidenceFileId = input.evidenceFileId !== undefined ? await prepareEvidenceFile(input.evidenceFileId, ctx.user.id, tx) : row.evidenceFileId;
        await tx.update(logoPermissions).set({ ...values, evidenceFileId }).where(eq(logoPermissions.id, id));
        await audit({ action: "logo_permission.updated", entityType: "logo_permission", entityId: id, organizationId: values.organizationId, actorUserId: ctx.user.id, metadata: { status: row.status }, tx });
      } else {
        const evidenceFileId = await prepareEvidenceFile(input.evidenceFileId, ctx.user.id, tx);
        const [row] = await tx.insert(logoPermissions).values({ ...values, evidenceFileId, status: "pending", createdByUserId: ctx.user.id }).returning({ id: logoPermissions.id });
        id = row!.id;
        created = true;
        await audit({ action: "logo_permission.created", entityType: "logo_permission", entityId: id, organizationId: values.organizationId, actorUserId: ctx.user.id, tx });
      }
      await syncMediaUsages(LOGO_MEDIA_ENTITY_TYPE, id, values.logoAssetId ? [{ assetId: values.logoAssetId, field: "logoAssetId" }] : [], tx);
      return { id, created };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Approve a pending permission (evidence, grantor, grant date and at least one location are required). */
export async function approveLogoPermission(ctx: StaffContext, id: string): Promise<void> {
  assertStaff(ctx, "content.publish");
  try {
    await db.transaction(async (tx) => {
      const row = await lockPermission(id, tx);
      if (row.status !== "pending") throw new ActionError("Only pending permissions can be approved.");
      const missing: string[] = [];
      if (!row.evidenceFileId && !row.evidenceReference?.trim()) missing.push("evidence (a file or reference)");
      if (!row.grantedByName?.trim()) missing.push("who granted it");
      if (!row.grantedAt) missing.push("the grant date");
      if (!row.displayLocations.length) missing.push("at least one display location");
      if (missing.length) throw new ActionError(`Add ${missing.join(", ")} before approving.`);
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw new ActionError("This permission has already expired.");
      await tx.update(logoPermissions).set({ status: "approved", approvedAt: new Date(), approvedByUserId: ctx.user.id }).where(eq(logoPermissions.id, id));
      await audit({ action: "logo_permission.approved", entityType: "logo_permission", entityId: id, organizationId: row.organizationId, actorUserId: ctx.user.id, tx });
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Revoke a permission (e.g. the organisation withdrew it); linked live logos go offline at once. */
export async function revokeLogoPermission(ctx: StaffContext, input: { id: string; reason: string }): Promise<{ logosTakenOffline: number }> {
  assertStaff(ctx, "content.publish");
  try {
    return await db.transaction(async (tx) => {
      const row = await lockPermission(input.id, tx);
      if (row.status === "revoked") return { logosTakenOffline: 0 };
      await tx.update(logoPermissions).set({ status: "revoked", revokedAt: new Date(), revokedReason: input.reason }).where(eq(logoPermissions.id, input.id));
      const logosTakenOffline = await archiveLinkedLogos(input.id, ctx.user.id, tx);
      await audit({
        action: "logo_permission.revoked",
        entityType: "logo_permission",
        entityId: input.id,
        organizationId: row.organizationId,
        actorUserId: ctx.user.id,
        metadata: { reason: input.reason, logosTakenOffline },
        tx,
      });
      return { logosTakenOffline };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Mark approved permissions past their expiry as expired and take their logos offline (content.publish_scheduled). */
export async function expireLogoPermissions(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ id: logoPermissions.id, organizationName: logoPermissions.organizationName, expiresAt: logoPermissions.expiresAt })
    .from(logoPermissions)
    .where(and(eq(logoPermissions.status, "approved"), sql`${logoPermissions.expiresAt} is not null and ${logoPermissions.expiresAt} <= ${now}`))
    .limit(100);
  for (const permission of due) {
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string }>(sql`select id from logo_permissions where id = ${permission.id} and status = 'approved' for update skip locked`);
      if (!locked.rows.length) return;
      await tx.update(logoPermissions).set({ status: "expired" }).where(eq(logoPermissions.id, permission.id));
      const logosTakenOffline = await archiveLinkedLogos(permission.id, null, tx);
      await audit({ action: "logo_permission.expired", entityType: "logo_permission", entityId: permission.id, actorType: "system", metadata: { logosTakenOffline }, tx });
      await notifyStaff(
        {
          event: "work.reminder",
          permission: "content.publish",
          data: { kindLabel: "logo permission renewal", title: `Logo permission expired: ${permission.organizationName}`, dueAt: permission.expiresAt?.toISOString(), overdue: true },
          link: CONTENT_ADMIN_PATHS.logoPermission(permission.id),
          dedupeKey: `content:logo-permission-expired:${permission.id}`,
        },
        { tx },
      );
    });
  }
  return due.length;
}

export type LogoPermissionListItem = LogoPermissionRow & { linkedLogoCount: number; approvedByName: string | null };

export async function listLogoPermissions(
  ctx: StaffContext,
  filters: { status?: LogoPermissionStatus; q?: string },
  page: PageQuery,
): Promise<Paginated<LogoPermissionListItem>> {
  assertStaff(ctx, ["content.view", "content.edit"], undefined, "any");
  const where: SQL[] = [];
  if (filters.status) where.push(eq(logoPermissions.status, filters.status));
  if (filters.q?.trim()) where.push(sql`${logoPermissions.organizationName} ilike ${likePattern(filters.q.trim())}`);
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        permission: logoPermissions,
        approvedByName: users.displayName,
        linkedLogoCount: sql<number>`(select count(*)::int from cms_entries e where e.logo_permission_id = ${logoPermissions.id} and e.deleted_at is null)`,
      })
      .from(logoPermissions)
      .leftJoin(users, eq(users.id, logoPermissions.approvedByUserId))
      .where(condition)
      .orderBy(sql`case ${logoPermissions.status} when 'pending' then 0 when 'approved' then 1 when 'expired' then 2 else 3 end`, asc(logoPermissions.organizationName), desc(logoPermissions.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(logoPermissions).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({ ...r.permission, approvedByName: r.approvedByName, linkedLogoCount: Number(r.linkedLogoCount) })),
    totals[0]?.value ?? 0,
    page,
  );
}

export async function getLogoPermission(ctx: StaffContext, id: string): Promise<(LogoPermissionRow & { linkedEntries: { id: string; title: string; status: string }[] }) | null> {
  assertStaff(ctx, ["content.view", "content.edit"], undefined, "any");
  const [row] = await db.select().from(logoPermissions).where(eq(logoPermissions.id, id)).limit(1);
  if (!row) return null;
  const linkedEntries = await db
    .select({ id: cmsEntries.id, title: cmsEntries.title, status: cmsEntries.status })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.logoPermissionId, id), sql`${cmsEntries.deletedAt} is null`));
  return { ...row, linkedEntries };
}

/** Approved, unexpired permissions (picker for client_logos entries). */
export async function listUsableLogoPermissions(ctx: StaffContext): Promise<Pick<LogoPermissionRow, "id" | "organizationName" | "relationship" | "displayLocations" | "expiresAt">[]> {
  assertStaff(ctx, ["content.view", "content.edit"], undefined, "any");
  return db
    .select({
      id: logoPermissions.id,
      organizationName: logoPermissions.organizationName,
      relationship: logoPermissions.relationship,
      displayLocations: logoPermissions.displayLocations,
      expiresAt: logoPermissions.expiresAt,
    })
    .from(logoPermissions)
    .where(and(eq(logoPermissions.status, "approved"), sql`(${logoPermissions.expiresAt} is null or ${logoPermissions.expiresAt} > now())`))
    .orderBy(asc(logoPermissions.organizationName));
}

/** link to the admin page of a permission (for notifications / approvals). */
export const logoPermissionHref = CONTENT_ADMIN_PATHS.logoPermission;
