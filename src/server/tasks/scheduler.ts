import "server-only";

import { logger } from "@/lib/logger";

import { RECURRING_TASKS } from "./schedule";
import type { RecurringTask, TaskHandlers } from "./types";

/**
 * Recurring task scheduler. Each RECURRING_TASKS entry is enqueued at most once per interval:
 *   bucket    = floor(epochMinutes / everyMinutes)
 *   dedupeKey = `${type}:${bucket}`
 * The unique index on background_jobs.dedupe_key makes this safe to call from any number of
 * workers / cron invocations at once (and as often as you like). Types with no registered handler
 * yet are skipped instead of piling up as dead tasks.
 * (The queue and the handler registry are imported lazily so the pure helpers load without a DB.)
 */

/** Recurring runs get fewer retries: the next interval runs the task again anyway. */
const RECURRING_MAX_ATTEMPTS = 3;

export function scheduleBucket(now: Date, everyMinutes: number): number {
  if (!Number.isFinite(everyMinutes) || everyMinutes < 1) throw new Error(`Invalid schedule interval: ${everyMinutes}`);
  const epochMinutes = Math.floor(now.getTime() / 60_000);
  return Math.floor(epochMinutes / Math.floor(everyMinutes));
}

export function recurringDedupeKey(task: Pick<RecurringTask, "type" | "everyMinutes">, now: Date): string {
  return `${task.type}:${scheduleBucket(now, task.everyMinutes)}`;
}

export type ScheduleSummary = {
  enqueued: string[];
  alreadyScheduled: string[];
  skippedNoHandler: string[];
};

export async function enqueueRecurringTasks(opts: { now?: Date; tasks?: readonly RecurringTask[]; handlers?: TaskHandlers } = {}): Promise<ScheduleSummary> {
  const now = opts.now ?? new Date();
  const handlers = opts.handlers ?? (await import("./registry")).taskHandlers;
  const { enqueueTask } = await import("./queue");
  const summary: ScheduleSummary = { enqueued: [], alreadyScheduled: [], skippedNoHandler: [] };
  for (const task of opts.tasks ?? RECURRING_TASKS) {
    if (!handlers[task.type]) {
      summary.skippedNoHandler.push(task.type);
      continue;
    }
    try {
      const id = await enqueueTask(task.type, { scheduledFor: now.toISOString() }, {
        dedupeKey: recurringDedupeKey(task, now),
        runAt: now,
        maxAttempts: RECURRING_MAX_ATTEMPTS,
      });
      (id === null ? summary.alreadyScheduled : summary.enqueued).push(task.type);
    } catch (error) {
      logger.error("Failed to enqueue recurring task", { type: task.type, error });
    }
  }
  if (summary.enqueued.length) logger.info("Scheduled recurring tasks", { enqueued: summary.enqueued });
  return summary;
}
