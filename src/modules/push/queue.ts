import "server-only";

import { after } from "next/server";

import type { DbOrTx } from "@/db";
import { integrations } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processDueTasks } from "@/server/tasks/processor";
import { enqueueTask } from "@/server/tasks/queue";

import { PUSH_QUEUE, REQUIREMENT_ALERT_TASK, tasks } from "./tasks";

/**
 * Called inside the publication transaction of a requirement poster (first publication only). The task is queued
 * in a savepoint, so a failure here can never block or roll back the publication. Inside a request, the push queue
 * is processed right after the response (after()); elsewhere (worker, scheduled publishing) the task queue runs it.
 */
export async function queueRequirementAlert(entryId: string, tx: DbOrTx): Promise<void> {
  try {
    if (!integrations.webPush()) return;
    await tx.transaction(async (sp) => {
      await enqueueTask(REQUIREMENT_ALERT_TASK, { entryId }, { tx: sp, queue: PUSH_QUEUE, dedupeKey: `push.requirement:${entryId}`, maxAttempts: 2 });
    });
  } catch (error) {
    logger.warn("Could not queue the requirement push alert", { entryId, error });
    return;
  }
  try {
    after(async () => {
      try {
        await processDueTasks({ queue: PUSH_QUEUE, concurrency: 1, handlers: tasks, timeoutMs: 55_000 });
      } catch (error) {
        logger.warn("Immediate push alert run failed; the task queue will retry", { entryId, error });
      }
    });
  } catch {
    // Not in a request scope: the worker / cron tick processes the queued task.
  }
}
