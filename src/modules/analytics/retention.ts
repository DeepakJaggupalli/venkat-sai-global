import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { getSettings } from "@/modules/settings";

/**
 * analytics.retention — deletes raw analytics data older than the retention settings
 * (analytics.retention_days_events / _heatmaps / _sessions). Daily roll-ups and consent receipts are kept.
 * Deletes run in batches so a large backlog never holds long locks; deleting a session cascades to its
 * events and scroll-depth rows.
 */

const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_TABLE = 400;
/** Retention can never be configured below one day (protects against a mistyped 0). */
const MIN_DAYS = 1;

export type RetentionPolicy = { eventsDays: number; heatmapsDays: number; sessionsDays: number };
export type RetentionResult = { events: number; scrollDepth: number; heatmapPoints: number; sessions: number; cutoffs: Record<keyof RetentionPolicy, Date> };

function clampDays(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_DAYS, Math.min(Math.trunc(n), 3650));
}

/** Retention days from settings (falling back to the catalogue defaults). */
export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  const s = await getSettings(["analytics.retention_days_events", "analytics.retention_days_heatmaps", "analytics.retention_days_sessions"]);
  return {
    eventsDays: clampDays(s["analytics.retention_days_events"], 395),
    heatmapsDays: clampDays(s["analytics.retention_days_heatmaps"], 90),
    sessionsDays: clampDays(s["analytics.retention_days_sessions"], 395),
  };
}

async function deleteInBatches(statement: (cutoff: Date) => SQL, cutoff: Date): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
    const result = await db.execute(statement(cutoff));
    const deleted = result.rowCount ?? 0;
    total += deleted;
    if (deleted < BATCH_SIZE) break;
  }
  return total;
}

/** Apply the retention policy as of `now`. */
export async function runAnalyticsRetention(policy?: RetentionPolicy, now: Date = new Date()): Promise<RetentionResult> {
  const p = policy ?? (await getRetentionPolicy());
  const day = 86_400_000;
  const cutoffs = {
    eventsDays: new Date(now.getTime() - clampDays(p.eventsDays, 395) * day),
    heatmapsDays: new Date(now.getTime() - clampDays(p.heatmapsDays, 90) * day),
    sessionsDays: new Date(now.getTime() - clampDays(p.sessionsDays, 395) * day),
  };

  const events = await deleteInBatches(
    (cutoff) => sql`delete from analytics_events where id in (select id from analytics_events where occurred_at < ${cutoff} limit ${BATCH_SIZE})`,
    cutoffs.eventsDays,
  );
  const scrollDepth = await deleteInBatches(
    (cutoff) => sql`delete from analytics_scroll_depth where id in (select id from analytics_scroll_depth where occurred_at < ${cutoff} limit ${BATCH_SIZE})`,
    cutoffs.eventsDays,
  );
  const heatmapPoints = await deleteInBatches(
    (cutoff) => sql`delete from analytics_heatmap_points where id in (select id from analytics_heatmap_points where occurred_at < ${cutoff} limit ${BATCH_SIZE})`,
    cutoffs.heatmapsDays,
  );
  // A session is deleted once it is past session retention (its remaining events and scroll rows cascade).
  const sessions = await deleteInBatches(
    (cutoff) => sql`delete from analytics_sessions where id in (select id from analytics_sessions where last_seen_at < ${cutoff} limit ${BATCH_SIZE})`,
    cutoffs.sessionsDays,
  );
  return { events, scrollDepth, heatmapPoints, sessions, cutoffs };
}
