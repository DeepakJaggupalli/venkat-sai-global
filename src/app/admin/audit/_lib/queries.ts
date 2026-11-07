import "server-only";

import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, dataAccessLogs, organizations, securityEvents, users } from "@/db/schema";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";

/**
 * Read models for the audit area (audit.view). All three logs are append-only; nothing here writes.
 * Date filters are calendar days in the viewer's time zone (inclusive).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const text = (max: number) => z.string().trim().max(max).optional().catch(undefined);

export const auditFilterSchema = z.object({
  actor: text(100),
  action: text(100),
  entity: text(60),
  entityId: text(100),
  org: z.uuid().optional().catch(undefined),
  from: isoDate,
  to: isoDate,
});
export type AuditFilters = z.infer<typeof auditFilterSchema>;

export const securityFilterSchema = z.object({
  user: text(100),
  type: text(60),
  severity: z.enum(["info", "warning", "critical"]).optional().catch(undefined),
  from: isoDate,
  to: isoDate,
});
export type SecurityFilters = z.infer<typeof securityFilterSchema>;

export const dataAccessFilterSchema = z.object({
  actor: text(100),
  subject: text(100),
  category: text(60),
  accessType: z.enum(["view", "reveal", "download", "export", "share"]).optional().catch(undefined),
  from: isoDate,
  to: isoDate,
});
export type DataAccessFilters = z.infer<typeof dataAccessFilterSchema>;

const like = (q: string) => `%${q.replace(/[%_\\]/g, "")}%`;

function dateRange(col: AnyPgColumn, from: string | undefined, to: string | undefined, tz: string): SQL[] {
  const out: SQL[] = [];
  if (from) out.push(sql`${col} >= (${from}::date)::timestamp at time zone ${tz}`);
  if (to) out.push(sql`${col} < ((${to}::date + 1))::timestamp at time zone ${tz}`);
  return out;
}

function userMatch(u: { id: AnyPgColumn; displayName: AnyPgColumn; email: AnyPgColumn }, q: string | undefined): SQL | undefined {
  if (!q) return undefined;
  if (/^[0-9a-f-]{36}$/i.test(q)) return eq(u.id, q);
  return or(ilike(u.displayName, like(q)), ilike(u.email, like(q)));
}

const actor = alias(users, "actor");
const subject = alias(users, "subject");

export type AuditEntry = {
  id: number;
  occurredAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

function auditWhere(f: AuditFilters, tz: string) {
  return and(
    userMatch(actor, f.actor),
    f.action ? ilike(auditLogs.action, `${f.action.replace(/[%_\\]/g, "")}%`) : undefined,
    f.entity ? eq(auditLogs.entityType, f.entity) : undefined,
    f.entityId ? eq(auditLogs.entityId, f.entityId) : undefined,
    f.org ? eq(auditLogs.organizationId, f.org) : undefined,
    ...dateRange(auditLogs.occurredAt, f.from, f.to, tz),
  );
}

export async function listAuditLogs(f: AuditFilters, page: PageQuery, tz: string): Promise<Paginated<AuditEntry>> {
  const where = auditWhere(f, tz);
  const base = () =>
    db
      .select({
        id: auditLogs.id,
        occurredAt: auditLogs.occurredAt,
        actorUserId: auditLogs.actorUserId,
        actorName: actor.displayName,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        organizationId: auditLogs.organizationId,
        organizationName: organizations.name,
        userAgent: auditLogs.userAgent,
        requestId: auditLogs.requestId,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .leftJoin(actor, eq(actor.id, auditLogs.actorUserId))
      .leftJoin(organizations, eq(organizations.id, auditLogs.organizationId));
  const [rows, [total]] = await Promise.all([
    base().where(where).orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(auditLogs).leftJoin(actor, eq(actor.id, auditLogs.actorUserId)).where(where),
  ]);
  return paginated(rows, total?.value ?? 0, page);
}

export async function exportAuditLogs(f: AuditFilters, tz: string, limit: number): Promise<AuditEntry[]> {
  return (await listAuditLogs(f, { page: 1, pageSize: limit, offset: 0 }, tz)).items;
}

/** Distinct entity types seen in the log (for the filter). */
export async function auditEntityTypes(): Promise<string[]> {
  const rows = await db.selectDistinct({ t: auditLogs.entityType }).from(auditLogs).orderBy(asc(auditLogs.entityType)).limit(200);
  return rows.map((r) => r.t).filter((t): t is string => Boolean(t));
}

export type SecurityEntry = {
  id: number;
  occurredAt: Date;
  userId: string | null;
  userName: string | null;
  type: string;
  severity: "info" | "warning" | "critical";
  userAgent: string | null;
  metadata: Record<string, unknown>;
};

export async function listSecurityEvents(f: SecurityFilters, page: PageQuery, tz: string): Promise<Paginated<SecurityEntry>> {
  const where = and(
    userMatch(subject, f.user),
    f.type ? eq(securityEvents.type, f.type) : undefined,
    f.severity ? eq(securityEvents.severity, f.severity) : undefined,
    ...dateRange(securityEvents.occurredAt, f.from, f.to, tz),
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: securityEvents.id,
        occurredAt: securityEvents.occurredAt,
        userId: securityEvents.userId,
        userName: subject.displayName,
        type: securityEvents.type,
        severity: securityEvents.severity,
        userAgent: securityEvents.userAgent,
        metadata: securityEvents.metadata,
      })
      .from(securityEvents)
      .leftJoin(subject, eq(subject.id, securityEvents.userId))
      .where(where)
      .orderBy(desc(securityEvents.occurredAt), desc(securityEvents.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(securityEvents).leftJoin(subject, eq(subject.id, securityEvents.userId)).where(where),
  ]);
  return paginated(rows, total?.value ?? 0, page);
}

export async function securityEventTypes(): Promise<string[]> {
  const rows = await db.selectDistinct({ t: securityEvents.type }).from(securityEvents).orderBy(asc(securityEvents.type)).limit(200);
  return rows.map((r) => r.t);
}

export type DataAccessEntry = {
  id: number;
  occurredAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actorOrganizationName: string | null;
  subjectUserId: string | null;
  subjectName: string | null;
  subjectType: string;
  subjectId: string;
  dataCategory: string;
  accessType: string;
  reason: string | null;
  metadata: Record<string, unknown>;
};

export async function listDataAccessLogs(f: DataAccessFilters, page: PageQuery, tz: string): Promise<Paginated<DataAccessEntry>> {
  const where = and(
    userMatch(actor, f.actor),
    userMatch(subject, f.subject),
    f.category ? eq(dataAccessLogs.dataCategory, f.category) : undefined,
    f.accessType ? eq(dataAccessLogs.accessType, f.accessType) : undefined,
    ...dateRange(dataAccessLogs.occurredAt, f.from, f.to, tz),
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: dataAccessLogs.id,
        occurredAt: dataAccessLogs.occurredAt,
        actorUserId: dataAccessLogs.actorUserId,
        actorName: actor.displayName,
        actorOrganizationName: organizations.name,
        subjectUserId: dataAccessLogs.subjectUserId,
        subjectName: subject.displayName,
        subjectType: dataAccessLogs.subjectType,
        subjectId: dataAccessLogs.subjectId,
        dataCategory: dataAccessLogs.dataCategory,
        accessType: dataAccessLogs.accessType,
        reason: dataAccessLogs.reason,
        metadata: dataAccessLogs.metadata,
      })
      .from(dataAccessLogs)
      .leftJoin(actor, eq(actor.id, dataAccessLogs.actorUserId))
      .leftJoin(subject, eq(subject.id, dataAccessLogs.subjectUserId))
      .leftJoin(organizations, eq(organizations.id, dataAccessLogs.actorOrganizationId))
      .where(where)
      .orderBy(desc(dataAccessLogs.occurredAt), desc(dataAccessLogs.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db
      .select({ value: count() })
      .from(dataAccessLogs)
      .leftJoin(actor, eq(actor.id, dataAccessLogs.actorUserId))
      .leftJoin(subject, eq(subject.id, dataAccessLogs.subjectUserId))
      .where(where),
  ]);
  return paginated(rows, total?.value ?? 0, page);
}

export async function dataAccessCategories(): Promise<string[]> {
  const rows = await db.selectDistinct({ t: dataAccessLogs.dataCategory }).from(dataAccessLogs).orderBy(asc(dataAccessLogs.dataCategory)).limit(100);
  return rows.map((r) => r.t);
}

export async function organizationName(id: string): Promise<string | null> {
  const [row] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, id)).limit(1);
  return row?.name ?? null;
}
