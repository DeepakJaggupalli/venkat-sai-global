import "server-only";

import type { TaskHandlers } from "@/server/tasks/types";

import { reportingTimeZone } from "./access";
import { aggregateDailyMetrics } from "./aggregate";
import { runAnalyticsRetention } from "./retention";
import { aggregateDatesFor } from "./rollup";

/**
 * Background task handlers owned by the analytics module (registered in src/server/tasks/registry.ts,
 * scheduled in src/server/tasks/schedule.ts).
 *
 *  analytics.aggregate  hourly — recompute daily roll-ups for today and yesterday (reporting timezone).
 *                       Optional payload { dates: ["YYYY-MM-DD", …] } (≤ 62) recomputes those days instead
 *                       (backfill after a fix).
 *  analytics.retention  daily — delete raw events, heatmap points, scroll depth and sessions past the
 *                       analytics.retention_days_* settings.
 */

export const tasks: TaskHandlers = {
  "analytics.aggregate": async (payload, ctx) => {
    const timeZone = reportingTimeZone();
    const dates = aggregateDatesFor(payload, new Date(), timeZone);
    const summary = await aggregateDailyMetrics(dates, timeZone);
    ctx.log("Analytics roll-ups recomputed", { timeZone, days: summary });
  },

  "analytics.retention": async (_payload, ctx) => {
    const result = await runAnalyticsRetention();
    ctx.log("Analytics retention applied", {
      events: result.events,
      scrollDepth: result.scrollDepth,
      heatmapPoints: result.heatmapPoints,
      sessions: result.sessions,
    });
  },
};
