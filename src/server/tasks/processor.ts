import "server-only";

import { randomBytes } from "node:crypto";
import { hostname } from "node:os";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";

import type { TaskContext, TaskHandlers } from "./types";

/**
 * Background task processor for the PostgreSQL queue (`background_jobs`).
 *
 * - Claiming: `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING`, so any
 *   number of workers / cron invocations can run side by side without double-processing.
 *   `attempts` is incremented when a task is claimed (it counts started runs, so a task that
 *   crashes the process still burns an attempt and cannot loop forever).
 * - Success → `succeeded`. Failure → `queued` again with exponential backoff + jitter, or `dead`
 *   once `attempts >= maxAttempts`. Unknown task types go straight to `dead`.
 * - Every handler runs with a timeout; tasks left `running` for more than 10 minutes (worker
 *   crashed / was killed) are recovered by recoverStaleTasks().
 */

export const DEFAULT_TASK_TIMEOUT_MS = 2 * 60_000;
/** Must stay well below STALE_LOCK_MINUTES so a live handler is never "recovered". */
const MAX_TASK_TIMEOUT_MS = 8 * 60_000;
export const STALE_LOCK_MINUTES = 10;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;
const MAX_ERROR_LENGTH = 4000;

export type ClaimedTask = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  queue: string;
};

export type TaskOutcome = "succeeded" | "retried" | "dead";

export type ProcessSummary = {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
  durationMs: number;
};

export type ProcessOptions = {
  /** Identifies the claimer in background_jobs.locked_by (default: host:pid:random). */
  workerId?: string;
  /** Restrict to one queue (default: every queue). */
  queue?: string;
  /** Tasks claimed and run in parallel per round (default 4). */
  concurrency?: number;
  /** Per-task timeout (default 2 minutes, capped at 8 minutes). */
  timeoutMs?: number;
  /** Handler registry override (tests). */
  handlers?: TaskHandlers;
};

export type ProcessUntilOptions = ProcessOptions & {
  /** Epoch ms after which no new tasks are claimed. */
  deadline: number;
  /** Do not claim new tasks when less than this remains before the deadline (default 15 s). */
  minRemainingMs?: number;
  /** A task started before the deadline may run this long past it (default 10 s). */
  graceMs?: number;
};

export function defaultWorkerId(prefix = "worker"): string {
  return `${prefix}:${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;
}

/**
 * Delay before retry number `attempt` (1-based count of runs so far): 30 s · 2^(attempt-1),
 * capped at 1 hour, with "equal jitter" (half fixed, half random) to spread retries out.
 */
export function computeRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const exp = RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attempt - 1, 20));
  const capped = Math.min(RETRY_MAX_MS, exp);
  return Math.round(capped / 2 + random() * (capped / 2));
}

/** Compact error text for background_jobs.last_error (no secrets should ever be in messages). */
export function formatTaskError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? error.stack.split("\n").slice(1, 6).join("\n") : "";
    return `${error.name}: ${error.message}${stack ? `\n${stack}` : ""}`.slice(0, MAX_ERROR_LENGTH);
  }
  return String(error).slice(0, MAX_ERROR_LENGTH);
}

export class TaskTimeoutError extends Error {
  constructor(ms: number) {
    super(`Task exceeded its ${Math.round(ms / 1000)}s timeout`);
    this.name = "TaskTimeoutError";
  }
}

async function withTimeout<T>(run: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TaskTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Claim up to `limit` due tasks for this worker. */
export async function claimTasks(workerId: string, limit: number, queue?: string): Promise<ClaimedTask[]> {
  if (limit <= 0) return [];
  const result = await db.execute<{ id: string | number; type: string; payload: Record<string, unknown> | null; attempts: number; max_attempts: number; queue: string }>(sql`
    update background_jobs
    set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id in (
      select id from background_jobs
      where status = 'queued' and run_at <= now() ${queue ? sql`and queue = ${queue}` : sql``}
      order by run_at asc, id asc
      limit ${limit}::int
      for update skip locked
    )
    returning id, type, payload, attempts, max_attempts, queue
  `);
  return result.rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    payload: r.payload ?? {},
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    queue: r.queue,
  }));
}

async function markSucceeded(task: ClaimedTask, workerId: string): Promise<void> {
  await db.execute(sql`
    update background_jobs
    set status = 'succeeded', completed_at = now(), locked_at = null, locked_by = null, last_error = null
    where id = ${task.id} and status = 'running' and locked_by = ${workerId}
  `);
}

async function markFailed(task: ClaimedTask, workerId: string, error: string, forceDead = false): Promise<TaskOutcome> {
  if (forceDead || task.attempts >= task.maxAttempts) {
    await db.execute(sql`
      update background_jobs
      set status = 'dead', completed_at = now(), locked_at = null, locked_by = null, last_error = ${error}
      where id = ${task.id} and status = 'running' and locked_by = ${workerId}
    `);
    return "dead";
  }
  const delayMs = computeRetryDelayMs(task.attempts);
  await db.execute(sql`
    update background_jobs
    set status = 'queued', run_at = now() + (${delayMs}::double precision * interval '1 millisecond'), locked_at = null, locked_by = null, last_error = ${error}
    where id = ${task.id} and status = 'running' and locked_by = ${workerId}
  `);
  return "retried";
}

/** Run one claimed task to completion (never throws). */
export async function runTask(task: ClaimedTask, opts: { workerId: string; timeoutMs: number; handlers: TaskHandlers }): Promise<TaskOutcome> {
  const handler = opts.handlers[task.type];
  if (!handler) {
    logger.error("No handler registered for task type", { taskId: task.id, type: task.type });
    return markFailed(task, opts.workerId, `No handler registered for task type "${task.type}"`, true);
  }
  const started = Date.now();
  const ctx: TaskContext = {
    taskId: task.id,
    attempt: task.attempts,
    log: (message, data) => logger.info(message, { taskId: task.id, type: task.type, attempt: task.attempts, ...data }),
  };
  try {
    await withTimeout(() => handler(task.payload, ctx), opts.timeoutMs);
    await markSucceeded(task, opts.workerId);
    logger.debug("Task succeeded", { taskId: task.id, type: task.type, ms: Date.now() - started });
    return "succeeded";
  } catch (error) {
    const outcome = await markFailed(task, opts.workerId, formatTaskError(error)).catch((dbError) => {
      logger.error("Failed to record task failure", { taskId: task.id, type: task.type, error: dbError });
      return "retried" as const;
    });
    const log = outcome === "dead" ? logger.error : logger.warn;
    log(outcome === "dead" ? "Task failed permanently" : "Task failed; will retry", {
      taskId: task.id,
      type: task.type,
      attempt: task.attempts,
      maxAttempts: task.maxAttempts,
      error,
    });
    return outcome;
  }
}

async function resolveOptions(opts: ProcessOptions) {
  return {
    workerId: opts.workerId ?? defaultWorkerId(),
    concurrency: Math.max(1, Math.min(opts.concurrency ?? 4, 50)),
    timeoutMs: Math.max(1000, Math.min(opts.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS, MAX_TASK_TIMEOUT_MS)),
    // Loaded lazily: the registry pulls in every module's task handlers.
    handlers: opts.handlers ?? (await import("./registry")).taskHandlers,
    queue: opts.queue,
  };
}

function emptySummary(): ProcessSummary {
  return { claimed: 0, succeeded: 0, retried: 0, dead: 0, durationMs: 0 };
}

function add(summary: ProcessSummary, outcomes: TaskOutcome[]) {
  summary.claimed += outcomes.length;
  for (const o of outcomes) summary[o] += 1;
}

/** One round: claim up to `concurrency` due tasks and run them in parallel. */
export async function processDueTasks(opts: ProcessOptions = {}): Promise<ProcessSummary> {
  const started = Date.now();
  const o = await resolveOptions(opts);
  const summary = emptySummary();
  const claimed = await claimTasks(o.workerId, o.concurrency, o.queue);
  if (claimed.length) {
    add(summary, await Promise.all(claimed.map((task) => runTask(task, o))));
  }
  summary.durationMs = Date.now() - started;
  return summary;
}

/** Keep processing rounds until the queue has nothing due or the deadline approaches (cron). */
export async function processUntil(opts: ProcessUntilOptions): Promise<ProcessSummary> {
  const started = Date.now();
  const o = await resolveOptions(opts);
  const minRemaining = opts.minRemainingMs ?? 15_000;
  const grace = opts.graceMs ?? 10_000;
  const summary = emptySummary();
  while (opts.deadline - Date.now() >= minRemaining) {
    const claimed = await claimTasks(o.workerId, o.concurrency, o.queue);
    if (!claimed.length) break;
    const timeoutMs = Math.max(1000, Math.min(o.timeoutMs, opts.deadline - Date.now() + grace));
    add(summary, await Promise.all(claimed.map((task) => runTask(task, { ...o, timeoutMs }))));
  }
  summary.durationMs = Date.now() - started;
  return summary;
}

/**
 * Re-queue tasks stuck in `running` (lock older than STALE_LOCK_MINUTES — the worker crashed or the
 * serverless function was frozen). Tasks out of attempts become `dead`. Returns how many were reset.
 */
export async function recoverStaleTasks(): Promise<{ requeued: number; dead: number }> {
  const result = await db.execute<{ status: string }>(sql`
    update background_jobs
    set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
        completed_at = case when attempts >= max_attempts then now() else null end,
        run_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = left(coalesce(last_error || E'\n', '') || ${`Recovered: the worker stopped while the task was running (lock older than ${STALE_LOCK_MINUTES} minutes).`}::text, ${MAX_ERROR_LENGTH}::int)
    where status = 'running' and locked_at < now() - (${STALE_LOCK_MINUTES}::double precision * interval '1 minute')
    returning status
  `);
  const dead = result.rows.filter((r) => r.status === "dead").length;
  const requeued = result.rows.length - dead;
  if (result.rows.length) logger.warn("Recovered stale background tasks", { requeued, dead });
  return { requeued, dead };
}
