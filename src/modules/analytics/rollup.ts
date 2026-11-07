/**
 * Pure helpers of the daily roll-up (no database access; unit-tested in rollup.test.ts).
 */
import type { AnalyticsDailyMetric, AnalyticsDimension } from "@/db/schema/analytics";

import { addDays, isIsoDate, localDate } from "./range";

export type DailyMetricRow = { date: string; metric: AnalyticsDailyMetric; dimension: AnalyticsDimension; dimensionValue: string; value: number };

export type SessionAggregate = { sessions: number; visitors: number; newVisitors: number; pageViews: number; bounces: number; totalDuration: number };

function rate(part: number, whole: number): number {
  return whole > 0 ? Number((part / whole).toFixed(4)) : 0;
}

/** Metric rows for one dimension value from its session aggregates and conversion counts. */
export function sessionMetricRows(
  date: string,
  dimension: AnalyticsDimension,
  dimensionValue: string,
  agg: SessionAggregate,
  conversions: Record<string, number>,
): DailyMetricRow[] {
  const base = { date, dimension, dimensionValue };
  const rows: DailyMetricRow[] = [
    { ...base, metric: "sessions", value: agg.sessions },
    { ...base, metric: "visitors", value: agg.visitors },
    { ...base, metric: "new_visitors", value: agg.newVisitors },
    { ...base, metric: "page_views", value: agg.pageViews },
    { ...base, metric: "bounces", value: agg.bounces },
    { ...base, metric: "bounce_rate", value: rate(agg.bounces, agg.sessions) },
    { ...base, metric: "total_duration", value: agg.totalDuration },
    { ...base, metric: "avg_duration", value: rate(agg.totalDuration, agg.sessions) },
  ];
  for (const [event, n] of Object.entries(conversions)) {
    if (/^[a-z][a-z0-9_]*$/.test(event) && n > 0) rows.push({ ...base, metric: `conversions:${event}`, value: n });
  }
  return rows;
}

export const MAX_BACKFILL_DAYS = 62;

/** Days the analytics.aggregate task recomputes: payload.dates (backfill, ≤ 62) or yesterday + today. */
export function aggregateDatesFor(payload: Record<string, unknown>, now: Date, timeZone: string): string[] {
  const requested = Array.isArray(payload.dates) ? payload.dates.filter((d): d is string => typeof d === "string" && isIsoDate(d)) : [];
  if (requested.length) return [...new Set(requested)].sort().slice(-MAX_BACKFILL_DAYS);
  const today = localDate(now, timeZone);
  return [addDays(today, -1), today];
}
