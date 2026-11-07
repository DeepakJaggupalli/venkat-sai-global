import "server-only";

import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import type { OrgPermissionFor } from "@/config/permissions";
import { db, type DbOrTx } from "@/db";
import { announcements, organizations, type AnnouncementAudience, type AnnouncementPlacement, type AnnouncementStatus } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { orgCan, type OrgContext, type StaffContext } from "@/modules/identity/authz";

import { ANNOUNCEMENT_STATUS_VALUES } from "./constants";
import { assertStaff, rethrowConstraint } from "./internal";
import type { AnnouncementInput, PartnerAnnouncementInput } from "./schemas";
import type { ActiveAnnouncement, AdminAnnouncementItem, AnnouncementRow } from "./types";

/**
 * Announcements: banners, tickers and notification-centre posts for the public site and the portals.
 *
 * Lifecycle: draft → (publish) published, or scheduled when startsAt is in the future → published at startsAt →
 * expired at endsAt (content.publish_scheduled) → archived. Staff manage them with announcements.manage.
 * Partner organisations (verified employers, recruitment partners, institutions) may request announcements for
 * the public site / People Portal; each request goes through the approval centre (type partner_announcement).
 *
 * Broadcasts are never fanned out as per-user notifications: banners and notification centres read
 * `getActiveAnnouncements()` at render time, so `sendNotification` is always stored false.
 */

type Tx = DbOrTx;

/** The org permission that lets a member speak for the organisation (request announcements). */
const PARTNER_ANNOUNCEMENT_PERMISSION: { [T in OrgType]: OrgPermissionFor<T> } = {
  employer: "employer.company.manage",
  recruitment_partner: "partner.profile.manage",
  institution: "institution.profile.manage",
};

async function lockAnnouncement(id: string, tx: Tx): Promise<AnnouncementRow> {
  const locked = await tx.execute<{ id: string }>(sql`select id from announcements where id = ${id} for update`);
  if (!locked.rows.length) throw new ActionError("This announcement could not be found.");
  const [row] = await tx.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!row) throw new ActionError("This announcement could not be found.");
  return row;
}

function fields(input: AnnouncementInput | PartnerAnnouncementInput) {
  return {
    title: input.title,
    body: input.body ?? null,
    audience: [...new Set(input.audience)] as AnnouncementAudience[],
    placements: [...new Set(input.placements)] as AnnouncementPlacement[],
    priority: input.priority,
    linkUrl: input.linkUrl ?? null,
    linkLabel: input.linkUrl ? (input.linkLabel ?? null) : null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  };
}

/** Status/publication fields for going live now or at startsAt (validates the window). */
function goLive(row: Pick<AnnouncementRow, "startsAt" | "endsAt" | "publishedAt">, actorUserId: string | null, now: Date) {
  if (row.endsAt && row.endsAt.getTime() <= now.getTime()) throw new ActionError("This announcement has already ended. Change the end time first.");
  if (row.startsAt && row.startsAt.getTime() > now.getTime()) {
    return { status: "scheduled" as const, publishedByUserId: actorUserId };
  }
  return { status: "published" as const, publishedAt: row.publishedAt ?? now, publishedByUserId: actorUserId };
}

// ---------------------------------------------------------------------------
// Staff (announcements.manage)
// ---------------------------------------------------------------------------

/** Create (no id) or update an announcement. Published / scheduled announcements change immediately. */
export async function saveAnnouncement(ctx: StaffContext, input: AnnouncementInput): Promise<{ id: string; created: boolean }> {
  assertStaff(ctx, "announcements.manage");
  try {
    return await db.transaction(async (tx) => {
      if (!input.id) {
        const [row] = await tx
          .insert(announcements)
          .values({ ...fields(input), isDismissible: input.isDismissible, status: "draft", sendNotification: false, createdByUserId: ctx.user.id, updatedByUserId: ctx.user.id })
          .returning({ id: announcements.id });
        await audit({ action: "announcement.created", entityType: "announcement", entityId: row!.id, actorUserId: ctx.user.id, tx });
        return { id: row!.id, created: true };
      }
      const current = await lockAnnouncement(input.id, tx);
      if (current.status === "archived") throw new ActionError("Archived announcements cannot be edited. Duplicate it instead.");
      const next = fields(input);
      const now = new Date();
      // Keep the lifecycle consistent with the edited window.
      let status: AnnouncementStatus = current.status;
      if (status === "scheduled" && (!next.startsAt || next.startsAt.getTime() <= now.getTime())) status = "published";
      if (status === "published" && next.startsAt && next.startsAt.getTime() > now.getTime()) status = "scheduled";
      if ((status === "published" || status === "scheduled") && next.endsAt && next.endsAt.getTime() <= now.getTime()) status = "expired";
      if (status === "expired" && (!next.endsAt || next.endsAt.getTime() > now.getTime())) status = current.publishedAt ? "published" : "draft";
      await tx
        .update(announcements)
        .set({
          ...next,
          isDismissible: input.isDismissible,
          status,
          publishedAt: status === "published" ? (current.publishedAt ?? now) : current.publishedAt,
          updatedByUserId: ctx.user.id,
        })
        .where(eq(announcements.id, current.id));
      await audit({ action: "announcement.updated", entityType: "announcement", entityId: current.id, organizationId: current.organizationId, actorUserId: ctx.user.id, metadata: { status }, tx });
      return { id: current.id, created: false };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Publish now, or schedule when startsAt is in the future. */
export async function publishAnnouncement(ctx: StaffContext, id: string): Promise<{ status: AnnouncementStatus }> {
  assertStaff(ctx, "announcements.manage");
  try {
    return await db.transaction(async (tx) => {
      const row = await lockAnnouncement(id, tx);
      if (row.status === "archived") throw new ActionError("Restore this announcement before publishing it.");
      const live = goLive(row, ctx.user.id, new Date());
      await tx.update(announcements).set({ ...live, updatedByUserId: ctx.user.id }).where(eq(announcements.id, id));
      if (row.organizationId) await cancelApprovalsForEntity("partner_announcement", id, ctx.user.id, "Published by staff", tx);
      await audit({ action: `announcement.${live.status}`, entityType: "announcement", entityId: id, organizationId: row.organizationId, actorUserId: ctx.user.id, tx });
      return { status: live.status };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** End a live or scheduled announcement now. */
export async function expireAnnouncement(ctx: StaffContext, id: string): Promise<void> {
  assertStaff(ctx, "announcements.manage");
  try {
    await db.transaction(async (tx) => {
      const row = await lockAnnouncement(id, tx);
      if (row.status !== "published" && row.status !== "scheduled") throw new ActionError("Only published or scheduled announcements can be ended.");
      const now = new Date();
      // A scheduled announcement that never started gets no end before its start (window CHECK).
      const endsAt = row.startsAt && row.startsAt.getTime() >= now.getTime() ? null : now;
      await tx
        .update(announcements)
        .set({ status: "expired", endsAt: endsAt ?? row.endsAt, publishedAt: row.publishedAt ?? (row.status === "published" ? now : null), updatedByUserId: ctx.user.id })
        .where(eq(announcements.id, id));
      await audit({ action: "announcement.expired", entityType: "announcement", entityId: id, organizationId: row.organizationId, actorUserId: ctx.user.id, tx });
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

export async function archiveAnnouncement(ctx: StaffContext, id: string): Promise<void> {
  assertStaff(ctx, "announcements.manage");
  await db.transaction(async (tx) => {
    const row = await lockAnnouncement(id, tx);
    if (row.status === "archived") return;
    await tx.update(announcements).set({ status: "archived", updatedByUserId: ctx.user.id }).where(eq(announcements.id, id));
    if (row.organizationId) await cancelApprovalsForEntity("partner_announcement", id, ctx.user.id, "Archived", tx);
    await audit({ action: "announcement.archived", entityType: "announcement", entityId: id, organizationId: row.organizationId, actorUserId: ctx.user.id, tx });
  });
}

/** Return an archived or expired announcement to draft (dates can then be edited and it can be published again). */
export async function restoreAnnouncement(ctx: StaffContext, id: string): Promise<void> {
  assertStaff(ctx, "announcements.manage");
  await db.transaction(async (tx) => {
    const row = await lockAnnouncement(id, tx);
    if (row.status !== "archived" && row.status !== "expired") throw new ActionError("Only archived or expired announcements can be restored.");
    await tx.update(announcements).set({ status: "draft", updatedByUserId: ctx.user.id }).where(eq(announcements.id, id));
    await audit({ action: "announcement.restored", entityType: "announcement", entityId: id, organizationId: row.organizationId, actorUserId: ctx.user.id, tx });
  });
}

/** Delete a draft that never went live (anything that was shown is archived instead, for the record). */
export async function deleteAnnouncement(ctx: StaffContext, id: string): Promise<void> {
  assertStaff(ctx, "announcements.manage");
  await db.transaction(async (tx) => {
    const row = await lockAnnouncement(id, tx);
    if (row.status !== "draft" || row.publishedAt) throw new ActionError("Only drafts that were never published can be deleted. Archive it instead.");
    if (row.organizationId) await cancelApprovalsForEntity("partner_announcement", id, ctx.user.id, "Deleted", tx);
    await tx.delete(announcements).where(eq(announcements.id, id));
    await audit({ action: "announcement.deleted", entityType: "announcement", entityId: id, organizationId: row.organizationId, actorUserId: ctx.user.id, metadata: { title: row.title }, tx });
  });
}

export async function listAnnouncements(
  ctx: StaffContext,
  filters: { status?: AnnouncementStatus; fromPartners?: boolean; q?: string },
  page: PageQuery,
): Promise<Paginated<AdminAnnouncementItem>> {
  assertStaff(ctx, "announcements.manage");
  const where: SQL[] = [];
  if (filters.status && (ANNOUNCEMENT_STATUS_VALUES as readonly string[]).includes(filters.status)) where.push(eq(announcements.status, filters.status));
  if (filters.fromPartners) where.push(sql`${announcements.organizationId} is not null`);
  if (filters.q?.trim()) where.push(sql`${announcements.title} ilike ${`%${filters.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  const condition = where.length ? and(...where) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({ a: announcements, organizationName: organizations.name })
      .from(announcements)
      .leftJoin(organizations, eq(organizations.id, announcements.organizationId))
      .where(condition)
      .orderBy(sql`case ${announcements.status} when 'published' then 0 when 'scheduled' then 1 when 'draft' then 2 when 'expired' then 3 else 4 end`, desc(announcements.updatedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(announcements).where(condition),
  ]);
  return paginated(
    rows.map(({ a, organizationName }) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      audience: a.audience,
      placements: a.placements,
      priority: a.priority,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      publishedAt: a.publishedAt,
      organizationId: a.organizationId,
      organizationName,
      updatedAt: a.updatedAt,
    })),
    totals[0]?.value ?? 0,
    page,
  );
}

export async function getAnnouncement(ctx: StaffContext, id: string): Promise<(AnnouncementRow & { organizationName: string | null }) | null> {
  assertStaff(ctx, "announcements.manage");
  const [row] = await db
    .select({ a: announcements, organizationName: organizations.name })
    .from(announcements)
    .leftJoin(organizations, eq(organizations.id, announcements.organizationId))
    .where(eq(announcements.id, id))
    .limit(1);
  return row ? { ...row.a, organizationName: row.organizationName } : null;
}

// ---------------------------------------------------------------------------
// Partner organisations
// ---------------------------------------------------------------------------

function assertPartnerCan<T extends OrgType>(ctx: OrgContext<T>): void {
  if (!orgCan(ctx, PARTNER_ANNOUNCEMENT_PERMISSION[ctx.orgType] as OrgPermissionFor<T>)) {
    throw new ActionError("You do not have permission to request announcements for this organisation.", { code: "forbidden" });
  }
  if (ctx.organization.status !== "verified") {
    throw new ActionError("Announcements can be requested once your organisation is verified.", { code: "org_not_verified" });
  }
}

async function lockOwnAnnouncement(ctx: OrgContext, id: string, tx: Tx): Promise<AnnouncementRow> {
  const row = await lockAnnouncement(id, tx);
  if (row.organizationId !== ctx.organization.id) throw new ActionError("This announcement could not be found.");
  return row;
}

/**
 * A partner organisation drafts or edits an announcement request and submits it for review (approval type
 * partner_announcement). Limited to the public site / People Portal audiences and non-premium placements.
 * Requests can be edited while in draft (including after "changes requested").
 */
export async function savePartnerAnnouncement<T extends OrgType>(ctx: OrgContext<T>, input: PartnerAnnouncementInput): Promise<{ id: string; approvalCode: string }> {
  assertPartnerCan(ctx);
  try {
    return await db.transaction(async (tx) => {
      let id = input.id;
      if (id) {
        const row = await lockOwnAnnouncement(ctx, id, tx);
        if (row.status !== "draft") throw new ActionError("This announcement is no longer a draft and cannot be changed. Contact Venkat Sai to update it.");
        await tx.update(announcements).set({ ...fields(input), isDismissible: true, updatedByUserId: ctx.user.id }).where(eq(announcements.id, id));
      } else {
        const [row] = await tx
          .insert(announcements)
          .values({
            ...fields(input),
            isDismissible: true,
            status: "draft",
            sendNotification: false,
            organizationId: ctx.organization.id,
            createdByUserId: ctx.user.id,
            updatedByUserId: ctx.user.id,
          })
          .returning({ id: announcements.id });
        id = row!.id;
      }
      const request = await submitForApproval(
        {
          type: "partner_announcement",
          entityType: "announcement",
          entityId: id,
          organizationId: ctx.organization.id,
          title: `Announcement from ${ctx.organization.name}: ${input.title}`,
          summary: input.body ?? null,
          payload: { announcementId: id, audience: input.audience, placements: input.placements },
          submittedByUserId: ctx.user.id,
        },
        tx,
      );
      await audit({
        action: input.id ? "announcement.partner_request_updated" : "announcement.partner_requested",
        entityType: "announcement",
        entityId: id,
        organizationId: ctx.organization.id,
        actorUserId: ctx.user.id,
        metadata: { approvalId: request.id },
        tx,
      });
      return { id, approvalCode: request.code };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Withdraw a request (or take down a live partner announcement). */
export async function withdrawPartnerAnnouncement<T extends OrgType>(ctx: OrgContext<T>, id: string): Promise<void> {
  if (!orgCan(ctx, PARTNER_ANNOUNCEMENT_PERMISSION[ctx.orgType] as OrgPermissionFor<T>)) {
    throw new ActionError("You do not have permission to manage announcements for this organisation.", { code: "forbidden" });
  }
  await db.transaction(async (tx) => {
    const row = await lockOwnAnnouncement(ctx, id, tx);
    if (row.status === "archived") return;
    await tx.update(announcements).set({ status: "archived", updatedByUserId: ctx.user.id }).where(eq(announcements.id, id));
    await cancelApprovalsForEntity("partner_announcement", id, ctx.user.id, "Withdrawn by the organisation", tx);
    await audit({ action: "announcement.partner_withdrawn", entityType: "announcement", entityId: id, organizationId: ctx.organization.id, actorUserId: ctx.user.id, tx });
  });
}

/** The organisation's own announcement requests (newest first). */
export async function listPartnerAnnouncements<T extends OrgType>(ctx: OrgContext<T>): Promise<AnnouncementRow[]> {
  if (!orgCan(ctx, PARTNER_ANNOUNCEMENT_PERMISSION[ctx.orgType] as OrgPermissionFor<T>)) return [];
  return db.select().from(announcements).where(eq(announcements.organizationId, ctx.organization.id)).orderBy(desc(announcements.createdAt)).limit(100);
}

/** Apply an approval decision on a partner request (approval handler; runs in the decision transaction). */
export async function applyPartnerAnnouncementDecision(
  announcementId: string,
  decision: "approved" | "rejected" | "changes_requested",
  actorUserId: string,
  tx: Tx,
): Promise<void> {
  const row = await lockAnnouncement(announcementId, tx);
  if (decision === "approved") {
    if (row.status === "archived") throw new ActionError("This announcement was withdrawn and can no longer be approved.");
    const live = goLive(row, actorUserId, new Date());
    await tx.update(announcements).set({ ...live, updatedByUserId: actorUserId }).where(eq(announcements.id, announcementId));
    await audit({ action: `announcement.partner_${live.status}`, entityType: "announcement", entityId: announcementId, organizationId: row.organizationId, actorUserId, tx });
    return;
  }
  if (decision === "rejected") {
    await tx.update(announcements).set({ status: "archived", updatedByUserId: actorUserId }).where(eq(announcements.id, announcementId));
  }
  await audit({ action: `announcement.partner_${decision}`, entityType: "announcement", entityId: announcementId, organizationId: row.organizationId, actorUserId, tx });
}

// ---------------------------------------------------------------------------
// Public read + background
// ---------------------------------------------------------------------------

/**
 * Announcements to show right now for an audience (portal) and placement: published, inside their window,
 * targeted at the audience or "all". Ordered critical → low, newest first. Safe for anonymous use.
 */
export async function getActiveAnnouncements(opts: {
  audience: AnnouncementAudience;
  placement: AnnouncementPlacement;
  limit?: number;
  now?: Date;
}): Promise<ActiveAnnouncement[]> {
  const now = opts.now ?? new Date();
  const audiences = opts.audience === "all" ? ["all"] : [opts.audience, "all"];
  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.status, "published"),
        or(isNull(announcements.startsAt), sql`${announcements.startsAt} <= ${now}`),
        or(isNull(announcements.endsAt), sql`${announcements.endsAt} > ${now}`),
        sql`${announcements.audience} && array[${sql.join(
          audiences.map((a) => sql`${a}`),
          sql`, `,
        )}]::text[]`,
        sql`${announcements.placements} @> array[${opts.placement}]::text[]`,
      ),
    )
    .orderBy(sql`case ${announcements.priority} when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, desc(announcements.publishedAt))
    .limit(Math.min(Math.max(opts.limit ?? 5, 1), 20));
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    linkUrl: a.linkUrl,
    linkLabel: a.linkLabel,
    priority: a.priority,
    isDismissible: a.isDismissible,
    placements: a.placements,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    publishedAt: a.publishedAt,
    fromPartner: a.organizationId !== null,
  }));
}

/** Map an active announcement to the public header banner props (src/components/layout Announcement). */
export function toBannerAnnouncement(a: ActiveAnnouncement): {
  id: string;
  message: string;
  href: string | null;
  linkLabel: string | null;
  tone: "neutral" | "highlight" | "critical";
  dismissible: boolean;
} {
  return {
    id: a.id,
    message: a.body ? `${a.title}: ${a.body}` : a.title,
    href: a.linkUrl,
    linkLabel: a.linkLabel,
    tone: a.priority === "critical" ? "critical" : a.priority === "high" ? "highlight" : "neutral",
    dismissible: a.isDismissible,
  };
}

/** Start scheduled announcements and expire ended ones (content.publish_scheduled). */
export async function processAnnouncementSchedule(now: Date = new Date()): Promise<{ started: number; expired: number }> {
  return db.transaction(async (tx) => {
    const started = await tx
      .update(announcements)
      .set({ status: "published", publishedAt: sql`coalesce(${announcements.publishedAt}, ${now})` })
      .where(and(eq(announcements.status, "scheduled"), sql`${announcements.startsAt} <= ${now}`, or(isNull(announcements.endsAt), sql`${announcements.endsAt} > ${now}`)))
      .returning({ id: announcements.id, organizationId: announcements.organizationId });
    const expired = await tx
      .update(announcements)
      .set({ status: "expired" })
      .where(and(inArray(announcements.status, ["published", "scheduled"]), sql`${announcements.endsAt} <= ${now}`))
      .returning({ id: announcements.id, organizationId: announcements.organizationId });
    for (const row of started) {
      await audit({ action: "announcement.published", entityType: "announcement", entityId: row.id, organizationId: row.organizationId, actorType: "system", metadata: { scheduled: true }, tx });
    }
    for (const row of expired) {
      await audit({ action: "announcement.expired", entityType: "announcement", entityId: row.id, organizationId: row.organizationId, actorType: "system", tx });
    }
    return { started: started.length, expired: expired.length };
  });
}
