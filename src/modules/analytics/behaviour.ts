import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { assertAnalyticsPermission, assertRange, CONVERSION_LIST, escapeLike, num, rangeBounds, ratio } from "./access";
import { ANALYTICS_EVENT_LABELS, CONVERSION_EVENTS, isAnalyticsEvent } from "./events";
import { normalizeAnalyticsPath } from "./privacy-rules";
import type { AnalyticsRange } from "./range";
import { eventsFilterSchema, heatmapQuerySchema, type EventsFilter, type HeatmapQuery } from "./schemas";
import type { CtaRow, EventCountRow, EventRow, FormAnalyticsRow, HeatmapPageRow, HeatmapResult, SearchAnalytics } from "./types";

/**
 * Behaviour dashboards: event explorer, form abandonment, job-search usage, heatmaps and CTA performance.
 * Every function requires analytics.view (event rows expose their session id only with analytics.sessions).
 */

const CONVERSION_SET: ReadonlySet<string> = new Set(CONVERSION_EVENTS);

function eventFilterSql(filter: EventsFilter): SQL {
  const parts: SQL[] = [];
  if (filter.name) parts.push(sql`e.name = ${filter.name}`);
  if (filter.source) parts.push(sql`e.source = ${filter.source}`);
  if (filter.path) {
    const trimmed = filter.path.trim();
    if (trimmed.endsWith("*")) {
      parts.push(sql`e.path like ${`${escapeLike(trimmed.slice(0, -1))}%`}`);
    } else {
      parts.push(sql`e.path = ${normalizeAnalyticsPath(trimmed) ?? trimmed}`);
    }
  }
  return parts.length ? sql`and ${sql.join(parts, sql` and `)}` : sql``;
}

/** Event explorer: newest first, filtered by name / source / path (exact, or prefix ending in "*"). */
export async function listEvents(
  staff: StaffContext,
  range: AnalyticsRange,
  filterInput: Partial<EventsFilter>,
  page: PageQuery,
): Promise<Paginated<EventRow>> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const filter = eventsFilterSchema.parse(filterInput ?? {});
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const where = sql`e.occurred_at >= ${start} and e.occurred_at < ${end} ${eventFilterSql(filter)}`;
  const pageSize = Math.min(Math.max(page.pageSize, 1), 200);
  const offset = Math.max(0, (page.page - 1) * pageSize);
  const [rows, total] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select e.id, e.name, e.source, e.path, e.props, e.occurred_at, e.session_id from analytics_events e
      where ${where} order by e.occurred_at desc, e.id desc limit ${pageSize} offset ${offset}
    `),
    db.execute<Record<string, unknown>>(sql`select count(*) as n from analytics_events e where ${where}`),
  ]);
  const showSessions = staffCan(staff, "analytics.sessions");
  const items: EventRow[] = rows.rows.map((r) => ({
    id: num(r.id),
    name: String(r.name),
    source: r.source === "server" ? "server" : "client",
    path: r.path ? String(r.path) : null,
    props: (r.props ?? {}) as EventRow["props"],
    occurredAt: new Date(r.occurred_at as string | Date),
    sessionId: showSessions && r.session_id ? String(r.session_id) : null,
  }));
  return paginated(items, num(total.rows[0]?.n), { page: page.page, pageSize });
}

/** Count per event name (and unique sessions) in the range. */
export async function getEventCounts(staff: StaffContext, range: AnalyticsRange): Promise<EventCountRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const result = await db.execute<Record<string, unknown>>(sql`
    select name, count(*) as n, count(distinct session_id) as sessions from analytics_events
    where occurred_at >= ${start} and occurred_at < ${end}
    group by name order by n desc, name
  `);
  return result.rows.map((r) => {
    const name = String(r.name);
    return {
      name,
      label: isAnalyticsEvent(name) ? ANALYTICS_EVENT_LABELS[name] : name,
      count: num(r.n),
      sessions: num(r.sessions),
      isConversion: CONVERSION_SET.has(name),
    };
  });
}

/**
 * Form analytics from form_started / form_submitted (props.formId, emitted by the tracker for forms marked
 * data-analytics-form). Abandonment = 1 − submitted ÷ started. Field values are never recorded.
 */
export async function getFormAnalytics(staff: StaffContext, range: AnalyticsRange): Promise<FormAnalyticsRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const result = await db.execute<Record<string, unknown>>(sql`
    select props->>'formId' as form_id,
      count(*) filter (where name = 'form_started') as started,
      count(*) filter (where name = 'form_submitted') as submitted
    from analytics_events
    where name in ('form_started', 'form_submitted') and props ? 'formId'
      and occurred_at >= ${start} and occurred_at < ${end}
    group by 1 order by started desc, form_id limit 200
  `);
  return result.rows.map((r) => {
    const started = num(r.started);
    const submitted = num(r.submitted);
    const completionRate = started > 0 ? Math.min(1, submitted / started) : submitted > 0 ? 1 : 0;
    return { formId: String(r.form_id), started, submitted, completionRate, abandonmentRate: started > 0 ? 1 - completionRate : 0 };
  });
}

/** Job listing pages whose whitelisted query parameters count as search filters. */
export const LISTING_PATHS = ["/jobs", "/talent/jobs"] as const;
/** Page-view props that are navigation, not filters. */
const NON_FILTER_KEYS = ["page", "sort", "tab", "view", "lang", "intent"] as const;

/**
 * Job-search usage: number of searches (job_search events), categories chosen and filter keys used —
 * from job_search / filter_applied event props (category, categoryId, filter, filters) and from the
 * whitelisted query parameters of listing page views. Never free text.
 */
export async function getSearchAnalytics(staff: StaffContext, range: AnalyticsRange): Promise<SearchAnalytics> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const listing = sql`(${sql.join(
    LISTING_PATHS.map((p) => sql`${p}`),
    sql`, `,
  )})`;
  const nonFilter = sql`(${sql.join(
    NON_FILTER_KEYS.map((k) => sql`${k}`),
    sql`, `,
  )})`;
  const [counts, categories, keys] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select count(*) filter (where name = 'job_search') as searches,
        count(*) filter (where name = 'page_view' and path in ${listing}) as listing_views
      from analytics_events where occurred_at >= ${start} and occurred_at < ${end}
    `),
    db.execute<Record<string, unknown>>(sql`
      select v as value, count(*) as n from (
        select coalesce(props->>'category', props->>'categorySlug', props->>'categoryId') as v from analytics_events
        where occurred_at >= ${start} and occurred_at < ${end}
          and (name in ('job_search', 'filter_applied') or (name = 'page_view' and path in ${listing}))
      ) x where v is not null and v <> '' group by v order by n desc, v limit 50
    `),
    db.execute<Record<string, unknown>>(sql`
      select k as key, count(*) as n from (
        select jsonb_object_keys(props) as k from analytics_events
        where name = 'page_view' and path in ${listing} and occurred_at >= ${start} and occurred_at < ${end}
        union all
        select props->>'filter' from analytics_events
        where name = 'filter_applied' and props ? 'filter' and occurred_at >= ${start} and occurred_at < ${end}
        union all
        select btrim(unnest(string_to_array(props->>'filters', ','))) from analytics_events
        where name in ('job_search', 'filter_applied') and props ? 'filters' and occurred_at >= ${start} and occurred_at < ${end}
      ) x where k is not null and k <> '' and k not in ${nonFilter} and k ~ '^[A-Za-z][A-Za-z0-9_]{0,39}$'
      group by k order by n desc, k limit 50
    `),
  ]);
  return {
    searches: num(counts.rows[0]?.searches),
    listingPageViews: num(counts.rows[0]?.listing_views),
    categories: categories.rows.map((r) => ({ value: String(r.value), count: num(r.n) })),
    filterKeys: keys.rows.map((r) => ({ key: String(r.key), count: num(r.n) })),
  };
}

const SCROLL_MILESTONES = [25, 50, 75, 90, 100] as const;
const X_BUCKET = 10;
const Y_BUCKET = 25;

/**
 * Click heatmap for one page and viewport bucket: points aggregated into 10‰ × 25 px cells, totals per
 * kind, most clicked elements (sanitised selectors) and scroll reach. `kind` limits the cells to one kind.
 */
export async function getHeatmap(staff: StaffContext, range: AnalyticsRange, input: HeatmapQuery): Promise<HeatmapResult> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const q = heatmapQuerySchema.parse(input);
  const path = normalizeAnalyticsPath(q.path) ?? q.path;
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const base = sql`path = ${path} and viewport_width_bucket = ${q.viewport} and occurred_at >= ${start} and occurred_at < ${end}`;
  const kindFilter = q.kind ? sql`and kind = ${q.kind}` : sql``;
  const [cells, totals, selectors, scroll] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select (x_pct / ${X_BUCKET}) * ${X_BUCKET} as x, (y_px / ${Y_BUCKET}) * ${Y_BUCKET} as y, count(*) as n
      from analytics_heatmap_points where ${base} ${kindFilter}
      group by 1, 2 order by n desc limit 5000
    `),
    db.execute<Record<string, unknown>>(sql`
      select count(*) filter (where kind = 'click') as clicks, count(*) filter (where kind = 'rage_click') as rage,
        count(*) filter (where kind = 'dead_click') as dead,
        percentile_disc(0.9) within group (order by doc_height) as doc_height
      from analytics_heatmap_points where ${base}
    `),
    db.execute<Record<string, unknown>>(sql`
      select selector, count(*) filter (where kind = 'click') as clicks, count(*) filter (where kind = 'rage_click') as rage,
        count(*) filter (where kind = 'dead_click') as dead
      from analytics_heatmap_points where ${base} and selector is not null
      group by selector order by clicks desc, rage desc, selector limit 25
    `),
    db.execute<Record<string, unknown>>(sql`
      select count(*) as sessions, avg(max_depth_pct) as avg_depth,
        ${sql.join(
          SCROLL_MILESTONES.map((m) => sql`count(*) filter (where max_depth_pct >= ${m}) as ${sql.raw(`reach_${m}`)}`),
          sql`, `,
        )}
      from analytics_scroll_depth where path = ${path} and occurred_at >= ${start} and occurred_at < ${end}
    `),
  ]);
  const t = totals.rows[0] ?? {};
  const sc = scroll.rows[0] ?? {};
  const scrollSessions = num(sc.sessions);
  return {
    path,
    viewport: q.viewport,
    range,
    totals: { clicks: num(t.clicks), rageClicks: num(t.rage), deadClicks: num(t.dead) },
    docHeight: t.doc_height === null || t.doc_height === undefined ? null : num(t.doc_height),
    cells: cells.rows.map((r) => ({ x: num(r.x), y: num(r.y), count: num(r.n) })),
    topSelectors: selectors.rows.map((r) => ({ selector: String(r.selector), clicks: num(r.clicks), rageClicks: num(r.rage), deadClicks: num(r.dead) })),
    scroll: {
      sessions: scrollSessions,
      avgMaxDepth: sc.avg_depth === null || sc.avg_depth === undefined ? null : Math.round(num(sc.avg_depth)),
      reach: SCROLL_MILESTONES.map((depth) => {
        const sessions = num(sc[`reach_${depth}`]);
        return { depth, sessions, share: ratio(sessions, scrollSessions) };
      }),
    },
  };
}

/** Pages with recorded clicks (heatmap page picker), optionally for one viewport bucket. */
export async function listHeatmapPages(staff: StaffContext, range: AnalyticsRange, opts: { viewport?: HeatmapQuery["viewport"]; limit?: number } = {}): Promise<HeatmapPageRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const viewport = opts.viewport ? heatmapQuerySchema.shape.viewport.parse(opts.viewport) : null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const result = await db.execute<Record<string, unknown>>(sql`
    select path, count(*) as clicks from analytics_heatmap_points
    where occurred_at >= ${start} and occurred_at < ${end} ${viewport ? sql`and viewport_width_bucket = ${viewport}` : sql``}
    group by path order by clicks desc, path limit ${limit}
  `);
  return result.rows.map((r) => ({ path: String(r.path), clicks: num(r.clicks) }));
}

/**
 * CTA performance from cta_click events (props.cta, set by data-analytics-cta or track()): clicks, unique
 * sessions, and sessions with a conversion after their first click on that CTA.
 */
export async function getCtaPerformance(staff: StaffContext, range: AnalyticsRange): Promise<CtaRow[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const result = await db.execute<Record<string, unknown>>(sql`
    with c as (
      select session_id, props->>'cta' as cta, min(occurred_at) as first_at, count(*) as clicks,
        array_remove(array_agg(distinct props->>'location'), null) as locations
      from analytics_events
      where name = 'cta_click' and props ? 'cta' and occurred_at >= ${start} and occurred_at < ${end}
      group by session_id, props->>'cta'
    )
    select c.cta, sum(c.clicks) as clicks, count(c.session_id) as sessions,
      count(*) filter (where c.session_id is not null and exists (
        select 1 from analytics_events e where e.session_id = c.session_id and e.name in ${CONVERSION_LIST} and e.occurred_at >= c.first_at
      )) as converted,
      (select array_agg(distinct l) from c c2, unnest(c2.locations) l where c2.cta = c.cta) as locations
    from c group by c.cta order by clicks desc, c.cta limit 100
  `);
  return result.rows.map((r) => {
    const sessions = num(r.sessions);
    const converted = num(r.converted);
    const locations = Array.isArray(r.locations) ? (r.locations as unknown[]).map(String).slice(0, 20) : [];
    return { cta: String(r.cta), clicks: num(r.clicks), sessions, convertedSessions: converted, conversionRate: ratio(converted, sessions), locations };
  });
}
