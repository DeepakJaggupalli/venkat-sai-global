import { sql, type SQL } from "drizzle-orm";

import type { TaskHandlers } from "./types";

/**
 * Platform housekeeping handlers ("system.*").
 *
 * system.cleanup (daily, see schedule.ts):
 *  - expired rate-limit buckets
 *  - dev outbox messages older than 30 days
 *  - succeeded tasks older than 14 days, dead tasks older than 90 days
 *  - safety net: purges the stored bytes of soft-deleted files whose grace period has passed
 *    (normally done by the per-file "files.purge" task)
 * Deletes run in batches so no single statement holds locks for long.
 */
const BATCH = 5000;
const MAX_BATCHES = 200;

async function deleteInBatches(statement: () => SQL): Promise<number> {
  const { db } = await import("@/db");
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const result = await db.execute(statement());
    const count = result.rowCount ?? 0;
    total += count;
    if (count < BATCH) break;
  }
  return total;
}

export const tasks: TaskHandlers = {
  "system.cleanup": async (_payload, ctx) => {
    const rateLimitBuckets = await deleteInBatches(
      () => sql`delete from rate_limit_buckets where key in (select key from rate_limit_buckets where expires_at < now() limit ${BATCH}::int)`,
    );
    const devOutbox = await deleteInBatches(
      () => sql`delete from dev_outbox where id in (select id from dev_outbox where created_at < now() - interval '30 days' limit ${BATCH}::int)`,
    );
    const succeededTasks = await deleteInBatches(
      () => sql`
        delete from background_jobs where id in (
          select id from background_jobs
          where status = 'succeeded' and coalesce(completed_at, created_at) < now() - interval '14 days'
          limit ${BATCH}::int
        )`,
    );
    const deadTasks = await deleteInBatches(
      () => sql`
        delete from background_jobs where id in (
          select id from background_jobs
          where status = 'dead' and coalesce(completed_at, created_at) < now() - interval '90 days'
          limit ${BATCH}::int
        )`,
    );

    let filesPurged = 0;
    const { listFilesDueForPurge, purgeDeletedFile } = await import("@/modules/files/service");
    for (const fileId of await listFilesDueForPurge(200)) {
      try {
        if ((await purgeDeletedFile(fileId)) === "purged") filesPurged += 1;
      } catch (error) {
        ctx.log("system.cleanup: failed to purge file bytes", { fileId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    ctx.log("system.cleanup finished", { rateLimitBuckets, devOutbox, succeededTasks, deadTasks, filesPurged });
  },
};
