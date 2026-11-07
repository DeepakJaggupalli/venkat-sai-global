import "server-only";

import { and, asc, count, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { analyticsEvents, analyticsScrollDepth, analyticsSessions } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit, logDataAccess } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertAnalyticsPermission, assertRange, rangeBounds } from "./access";
import { isRandomId } from "./consent";
import type { AnalyticsRange } from "./range";
import type { SessionListRow, SessionTimeline } from "./types";

/**
 * Session diagnostics (analytics.sessions — a sensitive permission). Sessions are pseudonymous; the only
 * link to a person is userId on signed-in sessions with analytics consent, which is returned by
 * getSessionTimeline only, with an audit entry and a data_access_logs record.
 */

type SessionRow = typeof analyticsSessions.$inferSelect;

function toListRow(s: SessionRow): SessionListRow {
  return {
    id: s.id,
    startedAt: s.startedAt,
    lastSeenAt: s.lastSeenAt,
    landingPath: s.landingPath,
    exitPath: s.exitPath,
    source: s.utmSource ?? s.referrerDomain ?? "(direct)",
    deviceType: s.deviceType,
    browser: s.browser,
    os: s.os,
    countryCode: s.countryCode ? s.countryCode.trim() : null,
    pageViews: s.pageViews,
    events: s.events,
    durationSeconds: s.durationSeconds,
    isBounce: s.isBounce,
    isSignedIn: s.userId !== null,
    consentLevel: s.consentLevel,
  };
}

export type SessionListFilter = { landingPath?: string; deviceType?: "mobile" | "tablet" | "desktop" | "other"; signedInOnly?: boolean; minPageViews?: number };

/** Recent sessions (newest first) for picking one to diagnose. No user ids are returned here. */
export async function listSessions(staff: StaffContext, range: AnalyticsRange, filter: SessionListFilter, page: PageQuery): Promise<Paginated<SessionListRow>> {
  assertAnalyticsPermission(staff, "analytics.sessions");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const conditions: SQL[] = [gte(analyticsSessions.startedAt, sql`${start}`), lt(analyticsSessions.startedAt, sql`${end}`)];
  if (filter.landingPath && filter.landingPath.startsWith("/") && filter.landingPath.length <= 1024) {
    conditions.push(eq(analyticsSessions.landingPath, filter.landingPath));
  }
  if (filter.deviceType) conditions.push(eq(analyticsSessions.deviceType, filter.deviceType));
  if (filter.signedInOnly) conditions.push(sql`${analyticsSessions.userId} is not null`);
  if (filter.minPageViews && Number.isFinite(filter.minPageViews)) conditions.push(gte(analyticsSessions.pageViews, Math.trunc(filter.minPageViews)));
  const where = and(...conditions);
  const pageSize = Math.min(Math.max(page.pageSize, 1), 100);
  const offset = Math.max(0, (page.page - 1) * pageSize);
  const [rows, total] = await Promise.all([
    db.select().from(analyticsSessions).where(where).orderBy(desc(analyticsSessions.startedAt)).limit(pageSize).offset(offset),
    db.select({ value: count() }).from(analyticsSessions).where(where),
  ]);
  return paginated(rows.map(toListRow), total[0]?.value ?? 0, { page: page.page, pageSize });
}

/**
 * Full timeline of one session (events in order, scroll depth). Audited (`analytics.session_viewed`) and
 * recorded in data_access_logs, with the linked user as subject when the session was signed in.
 */
export async function getSessionTimeline(sessionId: string, staff: StaffContext, opts: { reason?: string } = {}): Promise<SessionTimeline> {
  assertAnalyticsPermission(staff, "analytics.sessions");
  if (!isRandomId(sessionId)) throw new ActionError("Session not found.", { code: "not_found" });
  const [session] = await db.select().from(analyticsSessions).where(eq(analyticsSessions.id, sessionId)).limit(1);
  if (!session) throw new ActionError("Session not found.", { code: "not_found" });

  const [events, scroll] = await Promise.all([
    db
      .select({
        id: analyticsEvents.id,
        name: analyticsEvents.name,
        source: analyticsEvents.source,
        path: analyticsEvents.path,
        props: analyticsEvents.props,
        occurredAt: analyticsEvents.occurredAt,
      })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.sessionId, sessionId))
      .orderBy(asc(analyticsEvents.occurredAt), asc(analyticsEvents.id))
      .limit(2000),
    db
      .select({ path: analyticsScrollDepth.path, maxDepthPct: analyticsScrollDepth.maxDepthPct, occurredAt: analyticsScrollDepth.occurredAt })
      .from(analyticsScrollDepth)
      .where(eq(analyticsScrollDepth.sessionId, sessionId))
      .orderBy(asc(analyticsScrollDepth.occurredAt)),
  ]);

  await logDataAccess({
    actorUserId: staff.user.id,
    subjectType: "analytics_session",
    subjectId: sessionId,
    subjectUserId: session.userId,
    dataCategory: "analytics",
    accessType: "view",
    reason: opts.reason ?? "Session diagnostics",
  });
  await audit({
    action: "analytics.session_viewed",
    entityType: "analytics_session",
    entityId: sessionId,
    actorUserId: staff.user.id,
    actorType: "staff",
    metadata: { signedIn: session.userId !== null, events: events.length },
  });

  return {
    session: {
      ...toListRow(session),
      visitorId: session.visitorId,
      userId: session.userId,
      referrerDomain: session.referrerDomain,
      utm: { source: session.utmSource, medium: session.utmMedium, campaign: session.utmCampaign, term: session.utmTerm, content: session.utmContent },
      locale: session.locale,
      isNewVisitor: session.isNewVisitor,
    },
    events,
    scroll,
  };
}
