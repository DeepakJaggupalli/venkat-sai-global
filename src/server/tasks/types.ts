/**
 * Background task contracts. A "task" is a unit of deferred work stored in the
 * `background_jobs` table (named "tasks" in code to avoid confusion with job postings).
 *
 * Each module exports its handlers from `src/modules/<module>/tasks.ts`:
 *
 *   export const tasks: TaskHandlers = {
 *     "notifications.dispatch": async (payload, ctx) => { ... },
 *   };
 *
 * Handlers must be idempotent (they can be retried after a crash) and throw to signal failure
 * (the processor retries with exponential backoff up to maxAttempts, then marks the task "dead").
 */
export type TaskContext = {
  taskId: number;
  attempt: number;
  /** Enqueue follow-up work from inside a handler. */
  log: (message: string, data?: Record<string, unknown>) => void;
};

export type TaskHandler = (payload: Record<string, unknown>, ctx: TaskContext) => Promise<void>;

export type TaskHandlers = Record<string, TaskHandler>;

/** Recurring task definition, enqueued by the scheduler (worker loop or /api/v1/cron/tick). */
export type RecurringTask = {
  type: string;
  everyMinutes: number;
  description: string;
};
