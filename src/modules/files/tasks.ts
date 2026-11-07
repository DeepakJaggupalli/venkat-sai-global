import { z } from "zod";

import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the files module.
 * Task type names must be prefixed with "files." (see src/server/tasks/schedule.ts for recurring ones).
 *
 *  - files.process  { fileId }  deferred malware scan + image variants (enqueued by storeFile when
 *                               processing is deferred or the scanner was unavailable at upload)
 *  - files.purge    { fileId }  delete the bytes of a soft-deleted file after the grace period
 *                               (enqueued by softDeleteFile with runAt = deletedAt + 30 days;
 *                               "system.cleanup" also sweeps overdue purges)
 *
 * The service is imported lazily so loading the task registry stays cheap.
 */
const payloadSchema = z.object({ fileId: z.uuid() });

export const tasks: TaskHandlers = {
  "files.process": async (payload, ctx) => {
    const { fileId } = payloadSchema.parse(payload);
    const { processStoredFile } = await import("./service");
    const result = await processStoredFile(fileId);
    ctx.log("files.process finished", { fileId, result });
  },

  "files.purge": async (payload, ctx) => {
    const { fileId } = payloadSchema.parse(payload);
    const { purgeDeletedFile } = await import("./service");
    const result = await purgeDeletedFile(fileId);
    ctx.log("files.purge finished", { fileId, result });
  },
};
