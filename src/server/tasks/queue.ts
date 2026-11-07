import "server-only";

import { sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { backgroundJobs } from "@/db/schema";

export type EnqueueOptions = {
  /** Run no earlier than this time (default: now). */
  runAt?: Date;
  /** Idempotency: while a task with this key exists (any status), a second enqueue is ignored. */
  dedupeKey?: string;
  maxAttempts?: number;
  queue?: string;
  /** Enqueue inside an existing transaction so the task only exists if the transaction commits. */
  tx?: DbOrTx;
};

/**
 * Enqueue a background task. Returns the task id, or null when skipped by dedupeKey.
 *
 *   await enqueueTask("notifications.dispatch", { ... });
 *   await enqueueTask("files.process", { fileId }, { dedupeKey: `files.process:${fileId}` });
 */
export async function enqueueTask(type: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): Promise<number | null> {
  const executor = opts.tx ?? db;
  const rows = await executor
    .insert(backgroundJobs)
    .values({
      type,
      payload,
      queue: opts.queue ?? "default",
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
      dedupeKey: opts.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: backgroundJobs.dedupeKey })
    .returning({ id: backgroundJobs.id });
  return rows[0]?.id ?? null;
}

/**
 * Remove top-level keys from a task's stored payload — for secrets (e.g. a single-use link) a handler no longer
 * needs once it has done its work, so they do not stay in background_jobs until cleanup. Call it last in the handler.
 */
export async function redactTaskPayload(taskId: number, keys: readonly string[]): Promise<void> {
  if (!keys.length) return;
  const list = sql.join(
    keys.map((k) => sql`${k}`),
    sql`, `,
  );
  await db.execute(sql`update background_jobs set payload = payload - array[${list}]::text[] where id = ${taskId}`);
}

/** Counts by status (admin system monitor). */
export async function taskQueueStats() {
  const res = await db.execute<{ status: string; count: string }>(
    sql`select status, count(*)::text as count from background_jobs group by status`,
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, Number(r.count)])) as Record<string, number>;
}
