import "server-only";

import { inArray, isNotNull, or, sql, eq, and } from "drizzle-orm";

import { db } from "@/db";
import { analyticsEvents, analyticsSessions } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

/**
 * Data-subject requests (DPDP Act 2023 §§ 11–12) for analytics data, for the privacy module's DSAR
 * workflow. A person is linked to analytics only through analytics_sessions.userId (signed-in sessions with
 * analytics consent); their visitor ids reach their other (signed-out) sessions on the same browsers.
 * Heatmap points and consent receipts are not linked to anyone and are not affected.
 */

export type DsarActor = { kind: "staff"; staff: StaffContext } | { kind: "system"; reason: string };

function authorize(actor: DsarActor): string | null {
  if (actor.kind === "staff") {
    if (!staffCan(actor.staff, "privacy.requests")) throw new ActionError("You do not have permission to process data requests.", { code: "forbidden" });
    return actor.staff.user.id;
  }
  if (!actor.reason.trim()) throw new ActionError("A reason is required for system data requests.", { code: "invalid_actor" });
  return null;
}

async function visitorIdsFor(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ visitorId: analyticsSessions.visitorId })
    .from(analyticsSessions)
    .where(and(eq(analyticsSessions.userId, userId), isNotNull(analyticsSessions.visitorId)));
  return rows.map((r) => r.visitorId!).filter(Boolean);
}

export type AnalyticsSubjectSummary = {
  sessions: number;
  events: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  countries: string[];
  devices: string[];
};

/** What analytics holds about a user (for a DSAR access / export response). Audited. */
export async function summarizeAnalyticsForUser(actor: DsarActor, userId: string): Promise<AnalyticsSubjectSummary> {
  const actorUserId = authorize(actor);
  const visitorIds = await visitorIdsFor(userId);
  const sessionScope = visitorIds.length ? or(eq(analyticsSessions.userId, userId), inArray(analyticsSessions.visitorId, visitorIds)) : eq(analyticsSessions.userId, userId);
  const [row] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      events: sql<number>`coalesce(sum(${analyticsSessions.events}), 0)::int`,
      firstSeenAt: sql<Date | null>`min(${analyticsSessions.startedAt})`,
      lastSeenAt: sql<Date | null>`max(${analyticsSessions.lastSeenAt})`,
      countries: sql<string[]>`coalesce(array_agg(distinct btrim(${analyticsSessions.countryCode})) filter (where ${analyticsSessions.countryCode} is not null), '{}')`,
      devices: sql<string[]>`coalesce(array_agg(distinct ${analyticsSessions.deviceType}) filter (where ${analyticsSessions.deviceType} is not null), '{}')`,
    })
    .from(analyticsSessions)
    .where(sessionScope);
  await audit({
    action: "analytics.subject_data_summarized",
    entityType: "user",
    entityId: userId,
    actorUserId,
    actorType: actor.kind === "staff" ? "staff" : "system",
    metadata: actor.kind === "system" ? { reason: actor.reason } : {},
  });
  return {
    sessions: row?.sessions ?? 0,
    events: row?.events ?? 0,
    firstSeenAt: row?.firstSeenAt ? new Date(row.firstSeenAt) : null,
    lastSeenAt: row?.lastSeenAt ? new Date(row.lastSeenAt) : null,
    countries: row?.countries ?? [],
    devices: row?.devices ?? [],
  };
}

/**
 * Erase a user's analytics data: their signed-in sessions and every session / event carrying one of their
 * visitor ids (events and scroll depth cascade with sessions). Aggregated daily metrics are not personal
 * data and are kept. Audited; returns what was deleted.
 */
export async function eraseAnalyticsForUser(actor: DsarActor, userId: string): Promise<{ sessions: number; events: number }> {
  const actorUserId = authorize(actor);
  const visitorIds = await visitorIdsFor(userId);
  const sessionScope = visitorIds.length ? or(eq(analyticsSessions.userId, userId), inArray(analyticsSessions.visitorId, visitorIds)) : eq(analyticsSessions.userId, userId);
  return db.transaction(async (tx) => {
    const sessionIds = tx.select({ id: analyticsSessions.id }).from(analyticsSessions).where(sessionScope);
    const orphanEvents = await tx
      .delete(analyticsEvents)
      .where(visitorIds.length ? or(inArray(analyticsEvents.visitorId, visitorIds), inArray(analyticsEvents.sessionId, sessionIds)) : inArray(analyticsEvents.sessionId, sessionIds))
      .returning({ id: analyticsEvents.id });
    const deletedSessions = await tx.delete(analyticsSessions).where(sessionScope).returning({ id: analyticsSessions.id });
    await audit({
      action: "analytics.subject_data_erased",
      entityType: "user",
      entityId: userId,
      actorUserId,
      actorType: actor.kind === "staff" ? "staff" : "system",
      metadata: { sessions: deletedSessions.length, events: orphanEvents.length, ...(actor.kind === "system" ? { reason: actor.reason } : {}) },
      tx,
    });
    return { sessions: deletedSessions.length, events: orphanEvents.length };
  });
}
