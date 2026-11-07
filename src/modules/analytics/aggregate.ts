import "server-only";

import { eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { analyticsDailyMetrics, type AnalyticsDimension } from "@/db/schema";

import { CONVERSION_LIST, MEDIUM_SQL, num, rangeBounds, SOURCE_SQL } from "./access";
import { isIsoDate } from "./range";
import { sessionMetricRows, type DailyMetricRow } from "./rollup";

export type { DailyMetricRow } from "./rollup";

/**
 * analytics.aggregate — daily roll-ups into analytics_daily_metrics (kept after raw data is deleted).
 * Sessions are attributed to the day they started in the reporting timezone. For every dimension below the
 * task writes sessions, visitors, new_visitors, page_views, bounces, bounce_rate, total_duration,
 * avg_duration and conversions:<event>; the path dimension holds page views / sessions / visitors per page
 * (by the day of the page view). Recomputing a day replaces its rows (idempotent).
 */

type SessionDimension = { dimension: Exclude<AnalyticsDimension, "path">; expr: SQL };

const SESSION_DIMENSIONS: SessionDimension[] = [
  { dimension: "all", expr: sql`''` },
  { dimension: "source", expr: SOURCE_SQL },
  { dimension: "medium", expr: MEDIUM_SQL },
  { dimension: "referrer", expr: sql`s.referrer_domain` },
  { dimension: "campaign", expr: sql`s.utm_campaign` },
  { dimension: "device", expr: sql`coalesce(s.device_type, 'other')` },
  { dimension: "browser", expr: sql`coalesce(s.browser, 'Unknown')` },
  { dimension: "os", expr: sql`coalesce(s.os, 'Unknown')` },
  { dimension: "country", expr: sql`coalesce(btrim(s.country_code), '(unknown)')` },
  { dimension: "locale", expr: sql`coalesce(s.locale, '(unknown)')` },
];

/** Most pages kept per day in the path dimension (by page views). */
const MAX_PATHS_PER_DAY = 1000;

function validValue(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= 1024;
}

/** Compute every metric row for one calendar day (reporting timezone). */
export async function computeDailyMetrics(date: string, timeZone: string): Promise<DailyMetricRow[]> {
  const { start, end } = rangeBounds(date, date, timeZone);
  const rows: DailyMetricRow[] = [];

  for (const dim of SESSION_DIMENSIONS) {
    const [aggregates, conversions] = await Promise.all([
      db.execute<Record<string, unknown>>(sql`
        with s as (select * from analytics_sessions where started_at >= ${start} and started_at < ${end})
        select ${dim.expr} as v, count(*) as sessions, count(distinct coalesce(s.visitor_id, s.id)) as visitors,
          count(distinct coalesce(s.visitor_id, s.id)) filter (where s.is_new_visitor) as new_visitors,
          coalesce(sum(s.page_views), 0) as page_views, count(*) filter (where s.is_bounce) as bounces,
          coalesce(sum(s.duration_seconds), 0) as total_duration
        from s group by 1
      `),
      db.execute<Record<string, unknown>>(sql`
        with s as (select * from analytics_sessions where started_at >= ${start} and started_at < ${end})
        select ${dim.expr} as v, e.name, count(*) as n
        from s join analytics_events e on e.session_id = s.id
        where e.name in ${CONVERSION_LIST}
        group by 1, 2
      `),
    ]);
    const convByValue = new Map<string, Record<string, number>>();
    for (const r of conversions.rows) {
      if (r.v === null || r.v === undefined) continue;
      const key = String(r.v);
      const entry = convByValue.get(key) ?? {};
      entry[String(r.name)] = (entry[String(r.name)] ?? 0) + num(r.n);
      convByValue.set(key, entry);
    }
    if (dim.dimension === "all") {
      // Server-side conversions recorded without a session count towards the day's totals.
      const unattributed = await db.execute<Record<string, unknown>>(sql`
        select name, count(*) as n from analytics_events
        where session_id is null and name in ${CONVERSION_LIST} and occurred_at >= ${start} and occurred_at < ${end}
        group by name
      `);
      const entry = convByValue.get("") ?? {};
      for (const r of unattributed.rows) entry[String(r.name)] = (entry[String(r.name)] ?? 0) + num(r.n);
      convByValue.set("", entry);
    }
    const seen = new Set<string>();
    for (const r of aggregates.rows) {
      if (r.v === null || r.v === undefined) continue;
      const value = dim.dimension === "all" ? "" : String(r.v);
      if ((dim.dimension !== "all" && value === "") || !validValue(value)) continue;
      seen.add(value);
      rows.push(
        ...sessionMetricRows(
          date,
          dim.dimension,
          value,
          {
            sessions: num(r.sessions),
            visitors: num(r.visitors),
            newVisitors: num(r.new_visitors),
            pageViews: num(r.page_views),
            bounces: num(r.bounces),
            totalDuration: num(r.total_duration),
          },
          convByValue.get(value) ?? {},
        ),
      );
    }
    if (dim.dimension === "all" && !seen.has("")) {
      rows.push(...sessionMetricRows(date, "all", "", { sessions: 0, visitors: 0, newVisitors: 0, pageViews: 0, bounces: 0, totalDuration: 0 }, convByValue.get("") ?? {}));
    }
  }

  const paths = await db.execute<Record<string, unknown>>(sql`
    select path, count(*) as page_views, count(distinct session_id) as sessions,
      count(distinct coalesce(visitor_id, session_id)) as visitors
    from analytics_events
    where name = 'page_view' and path is not null and occurred_at >= ${start} and occurred_at < ${end}
    group by path order by page_views desc limit ${MAX_PATHS_PER_DAY}
  `);
  for (const r of paths.rows) {
    const value = String(r.path);
    if (!value || !validValue(value)) continue;
    rows.push(
      { date, metric: "page_views", dimension: "path", dimensionValue: value, value: num(r.page_views) },
      { date, metric: "sessions", dimension: "path", dimensionValue: value, value: num(r.sessions) },
      { date, metric: "visitors", dimension: "path", dimensionValue: value, value: num(r.visitors) },
    );
  }
  return rows;
}

/** Recompute and replace the roll-ups of the given days. */
export async function aggregateDailyMetrics(dates: string[], timeZone: string): Promise<{ date: string; rows: number }[]> {
  const unique = [...new Set(dates)].filter(isIsoDate).sort();
  const summary: { date: string; rows: number }[] = [];
  for (const date of unique) {
    const rows = await computeDailyMetrics(date, timeZone);
    await db.transaction(async (tx) => {
      await tx.delete(analyticsDailyMetrics).where(eq(analyticsDailyMetrics.date, date));
      const computedAt = new Date();
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.insert(analyticsDailyMetrics).values(rows.slice(i, i + 1000).map((r) => ({ ...r, computedAt })));
      }
    });
    summary.push({ date, rows: rows.length });
  }
  return summary;
}
