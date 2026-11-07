import "server-only";

import { and, count, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { auditLogs, dataRequests, files, supportTickets, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import {
  CLOSED_DATA_REQUEST_STATUSES,
  isExportExpired,
  exportExpiresAt,
  OPEN_DATA_REQUEST_STATUSES,
  SLA_WARNING_DAYS,
  type DataRequestStatus,
  type DataRequestType,
} from "./constants";
import type { StaffDataRequestFilters } from "./schemas";

function assertStaff(ctx: StaffContext): void {
  if (!staffCan(ctx, "privacy.requests")) throw new ActionError("You do not have permission to view data requests.", { code: "forbidden" });
}

// ---------------------------------------------------------------------------
// Requester
// ---------------------------------------------------------------------------

export type MyDataRequestItem = {
  id: string;
  code: string;
  type: DataRequestType;
  status: DataRequestStatus;
  createdAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  resolution: string | null;
  canCancel: boolean;
  /** Owner-only download of the generated export while it is available. */
  export: { fileId: string; href: string; expiresAt: Date } | null;
  exportExpired: boolean;
};

/** The signed-in person's own requests (newest first). Staff notes are never part of this view. */
export async function listMyDataRequests(userId: string, limit = 20): Promise<MyDataRequestItem[]> {
  const rows = await db
    .select({
      id: dataRequests.id,
      code: dataRequests.code,
      type: dataRequests.type,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
      dueAt: dataRequests.dueAt,
      completedAt: dataRequests.completedAt,
      resolution: dataRequests.resolution,
      exportFileId: dataRequests.exportFileId,
      fileDeletedAt: files.deletedAt,
      fileOwner: files.ownerUserId,
      fileCreatedAt: files.createdAt,
    })
    .from(dataRequests)
    .leftJoin(files, eq(files.id, dataRequests.exportFileId))
    .where(eq(dataRequests.userId, userId))
    .orderBy(desc(dataRequests.createdAt))
    .limit(limit);
  const now = new Date();
  return rows.map((r) => {
    const available = Boolean(r.exportFileId && !r.fileDeletedAt && r.fileOwner === userId && r.fileCreatedAt && !isExportExpired(r.fileCreatedAt, now));
    return {
      id: r.id,
      code: r.code,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt,
      dueAt: r.dueAt,
      completedAt: r.completedAt,
      // Declined requests show the reason written for the requester; nothing else from staff.
      resolution: r.status === "completed" || r.status === "rejected" ? r.resolution : null,
      canCancel: r.status === "received" || r.status === "identity_verification",
      export: available ? { fileId: r.exportFileId!, href: `/api/v1/files/${r.exportFileId}?download=1`, expiresAt: exportExpiresAt(r.fileCreatedAt!) } : null,
      exportExpired: Boolean(r.exportFileId) && !available,
    };
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type StaffDataRequestListItem = {
  id: string;
  code: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requesterName: string | null;
  hasAccount: boolean;
  identityVerifiedAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  handlerName: string | null;
};

const handler = alias(users, "handler");

function filterConditions(ctx: StaffContext, filters: StaffDataRequestFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(dataRequests.status, [...OPEN_DATA_REQUEST_STATUSES]));
  else if (filters.status === "closed") where.push(inArray(dataRequests.status, [...CLOSED_DATA_REQUEST_STATUSES]));
  else if (filters.status) where.push(eq(dataRequests.status, filters.status));
  if (filters.type) where.push(eq(dataRequests.type, filters.type));
  if (filters.assigned === "me") where.push(eq(dataRequests.handledByUserId, ctx.user.id));
  if (filters.assigned === "unassigned") where.push(isNull(dataRequests.handledByUserId));
  if (filters.sla) {
    where.push(inArray(dataRequests.status, [...OPEN_DATA_REQUEST_STATUSES]));
    if (filters.sla === "overdue") where.push(lt(dataRequests.dueAt, sql`now()`));
    else where.push(sql`${dataRequests.dueAt} >= now() and ${dataRequests.dueAt} < now() + make_interval(days => ${SLA_WARNING_DAYS})`);
  }
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(dataRequests.code, term), ilike(dataRequests.requesterName, term), ilike(dataRequests.requesterEmail, term))!);
  }
  return where;
}

export async function listDataRequests(ctx: StaffContext, filters: StaffDataRequestFilters, page: PageQuery): Promise<Paginated<StaffDataRequestListItem>> {
  assertStaff(ctx);
  const where = filterConditions(ctx, filters);
  const cond = where.length ? and(...where) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: dataRequests.id,
        code: dataRequests.code,
        type: dataRequests.type,
        status: dataRequests.status,
        requesterName: dataRequests.requesterName,
        userId: dataRequests.userId,
        identityVerifiedAt: dataRequests.identityVerifiedAt,
        dueAt: dataRequests.dueAt,
        createdAt: dataRequests.createdAt,
        completedAt: dataRequests.completedAt,
        handlerName: handler.displayName,
      })
      .from(dataRequests)
      .leftJoin(handler, eq(handler.id, dataRequests.handledByUserId))
      .where(cond)
      // Open requests first, most urgent deadline first.
      .orderBy(sql`case when ${dataRequests.status} in ('received','identity_verification','in_progress') then 0 else 1 end`, sql`${dataRequests.dueAt} asc nulls last`, desc(dataRequests.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(dataRequests).where(cond),
  ]);
  return paginated(
    rows.map(({ userId, ...r }) => ({ ...r, hasAccount: Boolean(userId) })),
    total?.value ?? 0,
    page,
  );
}

export async function dataRequestCounts(ctx: StaffContext): Promise<{ open: number; overdue: number; dueSoon: number; awaitingIdentity: number; mine: number }> {
  assertStaff(ctx);
  const open = inArray(dataRequests.status, [...OPEN_DATA_REQUEST_STATUSES]);
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${open})::int`,
      overdue: sql<number>`count(*) filter (where ${open} and ${dataRequests.dueAt} < now())::int`,
      dueSoon: sql<number>`count(*) filter (where ${open} and ${dataRequests.dueAt} >= now() and ${dataRequests.dueAt} < now() + make_interval(days => ${SLA_WARNING_DAYS}))::int`,
      awaitingIdentity: sql<number>`count(*) filter (where ${dataRequests.status} = 'identity_verification')::int`,
      mine: sql<number>`count(*) filter (where ${open} and ${dataRequests.handledByUserId} = ${ctx.user.id})::int`,
    })
    .from(dataRequests);
  return row ?? { open: 0, overdue: 0, dueSoon: 0, awaitingIdentity: 0, mine: 0 };
}

export type StaffDataRequestDetail = {
  request: typeof dataRequests.$inferSelect;
  account: { id: string; displayName: string; email: string | null; phone: string | null; status: string; isStaff: boolean; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null; createdAt: Date } | null;
  handlerName: string | null;
  exportFile: { id: string; name: string; size: number; createdAt: Date; deleted: boolean } | null;
  tickets: { id: string; code: string; subject: string; status: string }[];
  history: { id: string; action: string; at: Date; actorName: string | null }[];
};

export async function getDataRequest(ctx: StaffContext, id: string): Promise<StaffDataRequestDetail | null> {
  assertStaff(ctx);
  const [row] = await db.select().from(dataRequests).where(eq(dataRequests.id, id)).limit(1);
  if (!row) return null;
  const actor = alias(users, "actor");
  const [account, handlerRow, exportFile, tickets, history] = await Promise.all([
    row.userId
      ? db
          .select({ id: users.id, displayName: users.displayName, email: users.email, phone: users.phone, status: users.status, isStaff: users.isStaff, emailVerifiedAt: users.emailVerifiedAt, phoneVerifiedAt: users.phoneVerifiedAt, createdAt: users.createdAt })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.handledByUserId ? db.select({ name: users.displayName }).from(users).where(eq(users.id, row.handledByUserId)).limit(1).then((r) => r[0]?.name ?? null) : Promise.resolve(null),
    row.exportFileId
      ? db
          .select({ id: files.id, name: files.originalName, size: files.sizeBytes, createdAt: files.createdAt, deletedAt: files.deletedAt })
          .from(files)
          .where(eq(files.id, row.exportFileId))
          .limit(1)
          .then((r) => (r[0] ? { id: r[0].id, name: r[0].name, size: r[0].size, createdAt: r[0].createdAt, deleted: Boolean(r[0].deletedAt) } : null))
      : Promise.resolve(null),
    db.select({ id: supportTickets.id, code: supportTickets.code, subject: supportTickets.subject, status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.dataRequestId, id)),
    db
      .select({ id: auditLogs.id, action: auditLogs.action, at: auditLogs.occurredAt, actorName: actor.displayName })
      .from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorUserId))
      .where(and(eq(auditLogs.entityType, "data_request"), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(50),
  ]);
  return { request: row, account, handlerName: handlerRow, exportFile, tickets, history: history.map((h) => ({ ...h, id: String(h.id) })) };
}

/** Requests still open whose deadline is within SLA_WARNING_DAYS or past (privacy.sla_watch). */
export async function openRequestsNearDeadline(now: Date = new Date()): Promise<{ id: string; code: string; type: DataRequestType; dueAt: Date; handledByUserId: string | null }[]> {
  const horizon = new Date(now.getTime() + SLA_WARNING_DAYS * 86_400_000);
  const rows = await db
    .select({ id: dataRequests.id, code: dataRequests.code, type: dataRequests.type, dueAt: dataRequests.dueAt, handledByUserId: dataRequests.handledByUserId })
    .from(dataRequests)
    .where(and(inArray(dataRequests.status, [...OPEN_DATA_REQUEST_STATUSES]), lt(dataRequests.dueAt, horizon)));
  return rows.filter((r): r is typeof r & { dueAt: Date } => r.dueAt !== null);
}

/** Export files past their availability window that are still stored. */
export async function expiredExportFiles(now: Date = new Date()): Promise<{ requestId: string; fileId: string }[]> {
  const rows = await db
    .select({ requestId: dataRequests.id, fileId: files.id, createdAt: files.createdAt })
    .from(dataRequests)
    .innerJoin(files, eq(files.id, dataRequests.exportFileId))
    .where(isNull(files.deletedAt));
  return rows.filter((r) => isExportExpired(r.createdAt, now)).map(({ requestId, fileId }) => ({ requestId, fileId }));
}
