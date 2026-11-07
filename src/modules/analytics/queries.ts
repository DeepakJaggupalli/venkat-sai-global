import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { analyticsCampaigns, analyticsDailyMetrics, type AnalyticsDimension } from "@/db/schema";
import type { StaffContext } from "@/modules/identity/authz";

import {
  assertAnalyticsPermission,
  assertRange,
  CONVERSION_LIST,
  MEDIUM_SQL,
  num,
  rangeBounds,
  ratio,
  SOURCE_SQL,
  sqlList,
} from "./access";
import { enumerateDates, percentChange, type AnalyticsRange } from "./range";
import type {
  ActiveVisitors,
  AnalyticsKpis,
  AnalyticsOverview,
  BreakdownRow,
  CampaignDefinition,
  CampaignRow,
  CountryRow,
  DailyMetricPoint,
  ExitPageRow,
  LandingPageRow,
  PageRow,
  ReferrerRow,
  SourceRow,
  TechBreakdown,
  TimeSeriesPoint,
} from "./types";

/**
 * Traffic dashboards for /admin/analytics (Command Centre). Every function requires a StaffContext with
 * analytics.view and reads raw, pseudonymous data within its retention period. Sessions are attributed to
 * the day they started (reporting timezone); conversions are key events (CONVERSION_EVENTS) in those
 * sessions, plus server-side conversions recorded without a session (by event time) in totals.
 */

// ---------------------------------------------------------------------------
// Overview and time series
// ---------------------------------------------------------------------------

async function kpisFor(from: string, to: string, timeZone: string): Promise<AnalyticsKpis> {
  const { start, end } = rangeBounds(from, to, timeZone);
  const result = await db.execute<Record<string, unknown>>(sql`
    with s as (
      select id, visitor_id, is_new_visitor, page_views, is_bounce, duration_seconds
      from analytics_sessions where started_at >= ${start} and started_at < ${end}
    ), conv as (
      select e.session_id, count(*) as n from analytics_events e join s on s.id = e.session_id
      where e.name in ${CONVERSION_LIST} group by e.session_id
    )
    select
      (select count(*) from s) as sessions,
      (select count(distinct coalesce(visitor_id, id)) from s) as visitors,
      (select count(distinct coalesce(visitor_id, id)) from s where is_new_visitor) as new_visitors,
      (select coalesce(sum(page_views), 0) from s) as page_views,
      (select count(*) from s where is_bounce) as bounces,
      (select coalesce(sum(duration_seconds), 0) from s) as total_duration,
      (select coalesce(sum(n), 0) from conv) as session_conversions,
      (select count(*) from conv) as converted_sessions,
      (select count(*) from analytics_events where session_id is null and name in ${CONVERSION_LIST}
        and occurred_at >= ${start} and occurred_at < ${end}) as unattributed_conversions
  `);
  const r = result.rows[0] ?? {};
  const sessions = num(r.sessions);
  const pageViews = num(r.page_views);
  return {
    sessions,
    visitors: num(r.visitors),
    newVisitors: num(r.new_visitors),
    pageViews,
    bounceRate: ratio(num(r.bounces), sessions),
    avgSessionDuration: ratio(num(r.total_duration), sessions),
    pagesPerSession: ratio(pageViews, sessions),
    conversions: num(r.session_conversions) + num(r.unattributed_conversions),
    conversionRate: ratio(num(r.converted_sessions), sessions),
  };
}

/** Headline KPIs for the range and the previous period of equal length, with relative change. */
export async function getAnalyticsOverview(staff: StaffContext, range: AnalyticsRange): Promise<AnalyticsOverview> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const [current, previous] = await Promise.all([
    kpisFor(range.from, range.to, range.timeZone),
    kpisFor(range.previousFrom, range.previousTo, range.timeZone),
  ]);
  const change = Object.fromEntries(
    (Object.keys(current) as (keyof AnalyticsKpis)[]).map((k) => [k, percentChange(current[k], previous[k])]),
  ) as AnalyticsOverview["change"];
  return { range, current, previous, change };
}

/** One point per day of the range (missing days are zero). */
export async function getAnalyticsTimeSeries(staff: StaffContext, range: AnalyticsRange): Promise<TimeSeriesPoint[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const tz = range.timeZone;
  const [sessionRows, conversionRows] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select to_char((started_at at time zone ${tz})::date, 'YYYY-MM-DD') as day,
        count(*) as sessions, count(distinct coalesce(visitor_id, id)) as visitors,
        coalesce(sum(page_views), 0) as page_views, count(*) filter (where is_bounce) as bounces
      from analytics_sessions where started_at >= ${start} and started_at < ${end}
      group by 1
    `),
    db.execute<Record<string, unknown>>(sql`
      select to_char((coalesce(s.started_at, e.occurred_at) at time zone ${tz})::date, 'YYYY-MM-DD') as day, count(*) as conversions
      from analytics_events e left join analytics_sessions s on s.id = e.session_id
      where e.name in ${CONVERSION_LIST}
        and ((s.id is not null and s.started_at >= ${start} and s.started_at < ${end})
          or (e.session_id is null and e.occurred_at >= ${start} and e.occurred_at < ${end}))
      group by 1
    `),
  ]);
  const byDay = new Map(sessionRows.rows.map((r) => [String(r.day), r]));
  const convByDay = new Map(conversionRows.rows.map((r) => [String(r.day), num(r.conversions)]));
  return enumerateDates(range.from, range.to).map((date) => {
    const r = byDay.get(date);
    const sessions = num(r?.sessions);
    return {
      date,
      sessions,
      visitors: num(r?.visitors),
      pageViews: num(r?.page_views),
      conversions: convByDay.get(date) ?? 0,
      bounceRate: ratio(num(r?.bounces), sessions),
    };
  });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Most viewed pages (page_view events in the range) with unique sessions and average scroll depth. */
export async function getTopPages(staff: StaffContext, range: AnalyticsRange, opts: { limit?: number } = {}): Promise<PageRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const result = await db.execute<Record<string, unknown>>(sql`
    with pv as (
      select path, count(*) as page_views, count(distinct session_id) as sessions
      from analytics_events
      where name = 'page_view' and path is not null and occurred_at >= ${start} and occurred_at < ${end}
      group by path order by page_views desc limit ${limit}
    ), sd as (
      select d.path, avg(d.max_depth_pct) as avg_depth from analytics_scroll_depth d
      where d.path in (select path from pv) and d.occurred_at >= ${start} and d.occurred_at < ${end}
      group by d.path
    )
    select pv.path, pv.page_views, pv.sessions, sd.avg_depth from pv left join sd on sd.path = pv.path
    order by pv.page_views desc, pv.path
  `);
  return result.rows.map((r) => ({
    path: String(r.path),
    pageViews: num(r.page_views),
    sessions: num(r.sessions),
    avgScrollDepth: r.avg_depth === null || r.avg_depth === undefined ? null : Math.round(num(r.avg_depth)),
  }));
}

/** Entry pages: sessions, bounce rate, average duration and conversions per landing path. */
export async function getLandingPages(staff: StaffContext, range: AnalyticsRange, opts: { limit?: number } = {}): Promise<LandingPageRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const result = await db.execute<Record<string, unknown>>(sql`
    with s as (
      select id, landing_path, is_bounce, duration_seconds from analytics_sessions
      where started_at >= ${start} and started_at < ${end} and landing_path is not null
    ), conv as (
      select e.session_id, count(*) as n from analytics_events e join s on s.id = e.session_id
      where e.name in ${CONVERSION_LIST} group by e.session_id
    )
    select s.landing_path as path, count(*) as sessions, count(*) filter (where s.is_bounce) as bounces,
      coalesce(avg(s.duration_seconds), 0) as avg_duration, coalesce(sum(conv.n), 0) as conversions
    from s left join conv on conv.session_id = s.id
    group by s.landing_path order by sessions desc, path limit ${limit}
  `);
  return result.rows.map((r) => ({
    path: String(r.path),
    sessions: num(r.sessions),
    bounceRate: ratio(num(r.bounces), num(r.sessions)),
    avgSessionDuration: num(r.avg_duration),
    conversions: num(r.conversions),
  }));
}

/** Exit pages: sessions ending on a path, against that path's page views (exit rate). */
export async function getExitPages(staff: StaffContext, range: AnalyticsRange, opts: { limit?: number } = {}): Promise<ExitPageRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const result = await db.execute<Record<string, unknown>>(sql`
    with x as (
      select exit_path as path, count(*) as exits from analytics_sessions
      where started_at >= ${start} and started_at < ${end} and exit_path is not null
      group by exit_path order by exits desc limit ${limit}
    ), pv as (
      select path, count(*) as page_views from analytics_events
      where name = 'page_view' and path in (select path from x) and occurred_at >= ${start} and occurred_at < ${end}
      group by path
    )
    select x.path, x.exits, coalesce(pv.page_views, 0) as page_views from x left join pv on pv.path = x.path
    order by x.exits desc, x.path
  `);
  return result.rows.map((r) => {
    const exits = num(r.exits);
    const pageViews = Math.max(num(r.page_views), exits);
    return { path: String(r.path), exits, pageViews, exitRate: ratio(exits, pageViews) };
  });
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

/** Sessions by source / medium (utm_source → referrer domain → (direct)). */
export async function getTrafficSources(staff: StaffContext, range: AnalyticsRange, opts: { limit?: number } = {}): Promise<SourceRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const result = await db.execute<Record<string, unknown>>(sql`
    with conv as (
      select e.session_id, count(*) as n from analytics_events e
      join analytics_sessions s2 on s2.id = e.session_id
      where e.name in ${CONVERSION_LIST} and s2.started_at >= ${start} and s2.started_at < ${end}
      group by e.session_id
    )
    select ${SOURCE_SQL} as source, ${MEDIUM_SQL} as medium, count(*) as sessions,
      count(distinct coalesce(s.visitor_id, s.id)) as visitors, count(*) filter (where s.is_bounce) as bounces,
      coalesce(sum(conv.n), 0) as conversions
    from analytics_sessions s left join conv on conv.session_id = s.id
    where s.started_at >= ${start} and s.started_at < ${end}
    group by 1, 2 order by sessions desc, source limit ${limit}
  `);
  return result.rows.map((r) => ({
    source: String(r.source),
    medium: String(r.medium),
    sessions: num(r.sessions),
    visitors: num(r.visitors),
    bounceRate: ratio(num(r.bounces), num(r.sessions)),
    conversions: num(r.conversions),
  }));
}

/** Referring domains (sessions that arrived from another site). */
export async function getReferrers(staff: StaffContext, range: AnalyticsRange, opts: { limit?: number } = {}): Promise<ReferrerRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const result = await db.execute<Record<string, unknown>>(sql`
    with s as (
      select id, visitor_id, referrer_domain from analytics_sessions
      where started_at >= ${start} and started_at < ${end} and referrer_domain is not null
    ), conv as (
      select e.session_id, count(*) as n from analytics_events e join s on s.id = e.session_id
      where e.name in ${CONVERSION_LIST} group by e.session_id
    )
    select s.referrer_domain, count(*) as sessions, count(distinct coalesce(s.visitor_id, s.id)) as visitors,
      coalesce(sum(conv.n), 0) as conversions
    from s left join conv on conv.session_id = s.id
    group by s.referrer_domain order by sessions desc, s.referrer_domain limit ${limit}
  `);
  return result.rows.map((r) => ({
    referrerDomain: String(r.referrer_domain),
    sessions: num(r.sessions),
    visitors: num(r.visitors),
    conversions: num(r.conversions),
  }));
}

/**
 * UTM campaigns: traffic and conversions in the range, joined with the campaign descriptions and manual
 * cost. Cost per acquisition = total entered cost ÷ conversions over the campaign's whole retained history
 * (cost is entered per campaign, not per day). Campaigns described in the admin with no traffic are listed too.
 */
export async function getCampaignPerformance(staff: StaffContext, range: AnalyticsRange): Promise<CampaignRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const [trafficRows, definitions] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      with s as (
        select id, visitor_id, utm_campaign from analytics_sessions
        where started_at >= ${start} and started_at < ${end} and utm_campaign is not null
      ), conv as (
        select e.session_id, count(*) as n from analytics_events e join s on s.id = e.session_id
        where e.name in ${CONVERSION_LIST} group by e.session_id
      )
      select s.utm_campaign, count(*) as sessions, count(distinct coalesce(s.visitor_id, s.id)) as visitors,
        coalesce(sum(conv.n), 0) as conversions
      from s left join conv on conv.session_id = s.id group by s.utm_campaign
    `),
    db.select().from(analyticsCampaigns),
  ]);
  const keys = new Set<string>([...trafficRows.rows.map((r) => String(r.utm_campaign)), ...definitions.map((d) => d.utmCampaign)]);
  if (!keys.size) return [];
  const lifetime = await db.execute<Record<string, unknown>>(sql`
    select s.utm_campaign, e.name, count(*) as n from analytics_events e
    join analytics_sessions s on s.id = e.session_id
    where s.utm_campaign in ${sqlList([...keys])} and e.name in ${CONVERSION_LIST}
    group by s.utm_campaign, e.name
  `);
  const lifetimeByCampaign = new Map<string, Record<string, number>>();
  for (const r of lifetime.rows) {
    const key = String(r.utm_campaign);
    const entry = lifetimeByCampaign.get(key) ?? {};
    entry[String(r.name)] = num(r.n);
    lifetimeByCampaign.set(key, entry);
  }
  const traffic = new Map(trafficRows.rows.map((r) => [String(r.utm_campaign), r]));
  const defs = new Map(definitions.map((d) => [d.utmCampaign, d]));
  const rows: CampaignRow[] = [...keys].map((key) => {
    const t = traffic.get(key);
    const d = defs.get(key);
    const lifetimeConversions = lifetimeByCampaign.get(key) ?? {};
    const lifetimeConversionTotal = Object.values(lifetimeConversions).reduce((a, b) => a + b, 0);
    const costMinor = d?.costMinor ?? null;
    const perEvent = (n: number): number | null => (costMinor !== null && n > 0 ? Math.round(costMinor / n) : null);
    return {
      utmCampaign: key,
      campaignId: d?.id ?? null,
      name: d?.name ?? null,
      channel: d?.channel ?? null,
      startsOn: d?.startsOn ?? null,
      endsOn: d?.endsOn ?? null,
      sessions: num(t?.sessions),
      visitors: num(t?.visitors),
      conversions: num(t?.conversions),
      lifetimeConversions,
      lifetimeConversionTotal,
      costMinor,
      currency: d?.currency ?? null,
      costPerConversionMinor: perEvent(lifetimeConversionTotal),
      costPerEventMinor: Object.fromEntries(Object.entries(lifetimeConversions).map(([event, n]) => [event, perEvent(n)])),
    };
  });
  return rows.sort((a, b) => b.sessions - a.sessions || a.utmCampaign.localeCompare(b.utmCampaign));
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

async function breakdown(column: "device_type" | "browser" | "os", start: ReturnType<typeof rangeBounds>["start"], end: ReturnType<typeof rangeBounds>["end"]): Promise<BreakdownRow[]> {
  const columnSql = column === "device_type" ? sql`s.device_type` : column === "browser" ? sql`s.browser` : sql`s.os`;
  const result = await db.execute<Record<string, unknown>>(sql`
    select coalesce(${columnSql}, 'Unknown') as value, count(*) as sessions, count(distinct coalesce(s.visitor_id, s.id)) as visitors
    from analytics_sessions s where s.started_at >= ${start} and s.started_at < ${end}
    group by 1 order by sessions desc, value limit 50
  `);
  const total = result.rows.reduce((a, r) => a + num(r.sessions), 0);
  return result.rows.map((r) => ({ value: String(r.value), sessions: num(r.sessions), visitors: num(r.visitors), share: ratio(num(r.sessions), total) }));
}

/** Sessions by device type, browser family and operating system family. */
export async function getTechBreakdown(staff: StaffContext, range: AnalyticsRange): Promise<TechBreakdown> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const [devices, browsers, operatingSystems] = await Promise.all([
    breakdown("device_type", start, end),
    breakdown("browser", start, end),
    breakdown("os", start, end),
  ]);
  return { devices, browsers, operatingSystems };
}

/** Sessions by country (edge geo header; null = unknown). */
export async function getCountryBreakdown(staff: StaffContext, range: AnalyticsRange, opts: { limit?: number } = {}): Promise<CountryRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 250);
  const result = await db.execute<Record<string, unknown>>(sql`
    select s.country_code, c.name as country_name, count(*) as sessions, count(distinct coalesce(s.visitor_id, s.id)) as visitors
    from analytics_sessions s left join countries c on c.code = s.country_code
    where s.started_at >= ${start} and s.started_at < ${end}
    group by s.country_code, c.name order by sessions desc, s.country_code nulls last limit ${limit}
  `);
  const total = result.rows.reduce((a, r) => a + num(r.sessions), 0);
  return result.rows.map((r) => ({
    countryCode: r.country_code ? String(r.country_code).trim() : null,
    countryName: r.country_name ? String(r.country_name) : null,
    sessions: num(r.sessions),
    visitors: num(r.visitors),
    share: ratio(num(r.sessions), total),
  }));
}

/** Sessions seen in the last 5 minutes, and the pages they are on. */
export async function getActiveVisitors(staff: StaffContext): Promise<ActiveVisitors> {
  assertAnalyticsPermission(staff, "analytics.view");
  const result = await db.execute<Record<string, unknown>>(sql`
    select coalesce(exit_path, landing_path, '/') as path, count(*) as sessions
    from analytics_sessions where last_seen_at >= now() - interval '5 minutes'
    group by 1 order by sessions desc, path
  `);
  const pages = result.rows.map((r) => ({ path: String(r.path), sessions: num(r.sessions) }));
  return { sessions: pages.reduce((a, p) => a + p.sessions, 0), pages: pages.slice(0, 15), asOf: new Date() };
}

// ---------------------------------------------------------------------------
// Roll-ups and configuration lists
// ---------------------------------------------------------------------------

/**
 * Daily roll-up values (analytics_daily_metrics) for long-range trends, including days whose raw data has
 * been deleted. Missing days are zero. metric: "sessions", "page_views", "conversions:application_submitted"…
 */
export async function getDailyMetricSeries(
  staff: StaffContext,
  input: { metric: string; dimension?: AnalyticsDimension; dimensionValue?: string; from: string; to: string },
): Promise<DailyMetricPoint[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange({ preset: "custom", from: input.from, to: input.to, days: 0, previousFrom: input.from, previousTo: input.to, timeZone: "UTC" });
  if (!/^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$/.test(input.metric)) return [];
  const dimension = input.dimension ?? "all";
  const dimensionValue = dimension === "all" ? "" : (input.dimensionValue ?? "");
  const rows = await db
    .select({ date: analyticsDailyMetrics.date, value: analyticsDailyMetrics.value })
    .from(analyticsDailyMetrics)
    .where(
      and(
        eq(analyticsDailyMetrics.metric, input.metric as `conversions:${string}`),
        eq(analyticsDailyMetrics.dimension, dimension),
        eq(analyticsDailyMetrics.dimensionValue, dimensionValue),
        gte(analyticsDailyMetrics.date, input.from),
        lte(analyticsDailyMetrics.date, input.to),
      ),
    )
    .orderBy(asc(analyticsDailyMetrics.date));
  const byDate = new Map(rows.map((r) => [r.date, num(r.value)]));
  return enumerateDates(input.from, input.to).map((date) => ({ date, value: byDate.get(date) ?? 0 }));
}

/** Campaign descriptions (for the campaigns admin table). */
export async function listCampaigns(staff: StaffContext): Promise<CampaignDefinition[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  const rows = await db.select().from(analyticsCampaigns).orderBy(desc(analyticsCampaigns.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    utmCampaign: r.utmCampaign,
    name: r.name,
    channel: r.channel,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    costMinor: r.costMinor,
    currency: r.currency,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getCampaign(staff: StaffContext, id: string): Promise<CampaignDefinition | null> {
  assertAnalyticsPermission(staff, "analytics.view");
  const rows = await db.select().from(analyticsCampaigns).where(eq(analyticsCampaigns.id, id)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    utmCampaign: r.utmCampaign,
    name: r.name,
    channel: r.channel,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    costMinor: r.costMinor,
    currency: r.currency,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
