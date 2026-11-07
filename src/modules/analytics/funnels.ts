import "server-only";

import { asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { analyticsFunnels, type AnalyticsFunnelStep } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import type { StaffContext } from "@/modules/identity/authz";

import { assertAnalyticsPermission, assertRange, escapeLike, num, rangeBounds, ratio } from "./access";
import { validateFunnelSteps } from "./funnel-rules";
import type { AnalyticsRange } from "./range";
import type { FunnelGrouping } from "./schemas";
import type { FunnelDefinition, FunnelResult, FunnelStepResult } from "./types";

/**
 * Funnels: ordered steps evaluated over analytics_events. For each visitor (or session), step 1 is its
 * first matching event inside the range; every later step is the first matching event at or after the
 * previous step and no later than step 1 + windowDays. Visitors without a visitor id (server events
 * without a session) are not counted. Conversion and drop-off are reported per step.
 */

function toDefinition(row: typeof analyticsFunnels.$inferSelect): FunnelDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    steps: row.steps,
    windowDays: row.windowDays,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All funnel definitions (active first). */
export async function listFunnels(staff: StaffContext, opts: { activeOnly?: boolean } = {}): Promise<FunnelDefinition[]> {
  assertAnalyticsPermission(staff, "analytics.view");
  const rows = await db
    .select()
    .from(analyticsFunnels)
    .where(opts.activeOnly ? eq(analyticsFunnels.isActive, true) : undefined)
    .orderBy(desc(analyticsFunnels.isActive), asc(analyticsFunnels.name));
  return rows.map(toDefinition);
}

export async function getFunnel(staff: StaffContext, id: string): Promise<FunnelDefinition | null> {
  assertAnalyticsPermission(staff, "analytics.view");
  const rows = await db.select().from(analyticsFunnels).where(eq(analyticsFunnels.id, id)).limit(1);
  return rows[0] ? toDefinition(rows[0]) : null;
}

export { validateFunnelSteps } from "./funnel-rules";

/** SQL condition for one step over alias `e` (parameterised; path "*" suffix = prefix match). */
export function stepConditionSql(match: AnalyticsFunnelStep["match"]): SQL {
  const parts: SQL[] = [];
  if (match.event) parts.push(sql`e.name = ${match.event}`);
  if (match.path) {
    if (match.path.endsWith("*")) {
      const prefix = match.path.slice(0, -1);
      parts.push(prefix === "/" || prefix === "" ? sql`e.path is not null` : sql`e.path like ${`${escapeLike(prefix)}%`}`);
    } else {
      parts.push(sql`e.path = ${match.path}`);
    }
  }
  if (match.props && Object.keys(match.props).length) parts.push(sql`e.props @> ${JSON.stringify(match.props)}::jsonb`);
  return parts.length ? sql.join(parts, sql` and `) : sql`false`;
}

/**
 * Evaluate ordered steps over a range (also used to preview an unsaved funnel). Counts per step are
 * monotonic non-increasing by construction.
 */
export async function computeFunnelSteps(
  steps: AnalyticsFunnelStep[],
  windowDays: number,
  range: AnalyticsRange,
  groupBy: FunnelGrouping = "visitor",
): Promise<FunnelResult> {
  if (!validateFunnelSteps(steps)) throw new ActionError("This funnel's steps are not valid.", { code: "invalid_funnel" });
  assertRange(range);
  const window = Math.min(Math.max(Math.trunc(windowDays) || 1, 1), 366);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  const groupExpr = groupBy === "visitor" ? sql`coalesce(e.visitor_id, e.session_id)` : sql`e.session_id`;
  const windowInterval = `${window} days`;

  // Candidate events: anything that can match any step, between the range start and range end + window.
  const ctes: SQL[] = [
    sql`ev as (
      select ${groupExpr} as grp, e.name, e.path, e.props, e.occurred_at from analytics_events e
      where e.occurred_at >= ${start} and e.occurred_at < ${end} + ${windowInterval}::interval
        and ${groupExpr} is not null
        and (${sql.join(
          steps.map((s) => sql`(${stepConditionSql(s.match)})`),
          sql` or `,
        )})
    )`,
    sql`s1 as (
      select e.grp, min(e.occurred_at) as t1, min(e.occurred_at) as t from ev e
      where e.occurred_at < ${end} and ${stepConditionSql(steps[0]!.match)}
      group by e.grp
    )`,
  ];
  for (let i = 1; i < steps.length; i++) {
    const prev = sql.raw(`s${i}`);
    const cur = sql.raw(`s${i + 1}`);
    ctes.push(sql`${cur} as (
      select p.grp, p.t1, min(e.occurred_at) as t from ${prev} p
      join ev e on e.grp = p.grp and e.occurred_at >= p.t and e.occurred_at <= p.t1 + ${windowInterval}::interval
      where ${stepConditionSql(steps[i]!.match)}
      group by p.grp, p.t1
    )`);
  }
  const selects = steps.map((_, i) => sql`(select count(*) from ${sql.raw(`s${i + 1}`)}) as ${sql.raw(`c${i + 1}`)}`);
  const result = await db.execute<Record<string, unknown>>(sql`with ${sql.join(ctes, sql`, `)} select ${sql.join(selects, sql`, `)}`);
  const row = result.rows[0] ?? {};
  const counts = steps.map((_, i) => num(row[`c${i + 1}`]));
  const entered = counts[0] ?? 0;
  const results: FunnelStepResult[] = steps.map((step, i) => {
    const count = counts[i] ?? 0;
    const previous = i === 0 ? count : (counts[i - 1] ?? 0);
    const dropOff = i === 0 ? 0 : Math.max(0, previous - count);
    return {
      index: i,
      label: step.label,
      match: step.match,
      count,
      conversionFromStart: i === 0 ? (entered > 0 ? 1 : 0) : ratio(count, entered),
      conversionFromPrevious: i === 0 ? (count > 0 ? 1 : 0) : ratio(count, previous),
      dropOff,
      dropOffRate: i === 0 ? 0 : ratio(dropOff, previous),
    };
  });
  const completed = counts[counts.length - 1] ?? 0;
  return { range, groupBy, windowDays: window, steps: results, entered, completed, overallConversion: ratio(completed, entered) };
}

/** Evaluate a saved funnel for a range. */
export async function computeFunnel(staff: StaffContext, funnelId: string, range: AnalyticsRange, opts: { groupBy?: FunnelGrouping } = {}): Promise<FunnelResult> {
  assertAnalyticsPermission(staff, "analytics.view");
  const funnel = await getFunnel(staff, funnelId);
  if (!funnel) throw new ActionError("Funnel not found.", { code: "not_found" });
  return computeFunnelSteps(funnel.steps, funnel.windowDays, range, opts.groupBy ?? "visitor");
}

/** Preview unsaved steps (funnel editor). */
export async function previewFunnel(
  staff: StaffContext,
  input: { steps: AnalyticsFunnelStep[]; windowDays: number },
  range: AnalyticsRange,
  opts: { groupBy?: FunnelGrouping } = {},
): Promise<FunnelResult> {
  assertAnalyticsPermission(staff, "analytics.view");
  return computeFunnelSteps(input.steps, input.windowDays, range, opts.groupBy ?? "visitor");
}
