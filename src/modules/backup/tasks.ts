import "server-only";

import type { TaskHandlers } from "@/server/tasks/types";

import { BACKUP_DAILY_TASK } from "./schemas";

/**
 * Background task handlers owned by the backup module (registered in src/server/tasks/registry.ts).
 *
 *  backup.daily_email  recurring (daily, src/server/tasks/schedule.ts): email the backup workbook (passport numbers
 *                      cut to the last 4 digits) to the backup address or the business inbox, once per day. Off when
 *                      the "backup.daily_email_enabled" setting is off. A failed send throws, so the queue retries.
 */
export const tasks: TaskHandlers = {
  [BACKUP_DAILY_TASK]: async (payload, ctx) => {
    // Loaded lazily: the service pulls in the database and the workbook writer.
    const { runDailyBackupEmail } = await import("./service");
    const outcome = await runDailyBackupEmail({ scheduledFor: payload.scheduledFor });
    ctx.log("Daily backup email finished", outcome.status === "sent" ? { status: outcome.status, attached: outcome.attached, sizeBytes: outcome.sizeBytes, provider: outcome.provider } : { status: outcome.status });
  },
};
