import type { TaskHandlers } from "@/server/tasks/types";

/** documents.auto_create (daily): make any missing automatic certificates and letters (they wait for approval). */
export const tasks: TaskHandlers = {
  "documents.auto_create": async (_payload, ctx) => {
    const { ensureAutoDocuments } = await import("./service");
    const created = await ensureAutoDocuments({ limit: 500 });
    ctx.log("documents.auto_create finished", { created });
  },
};
