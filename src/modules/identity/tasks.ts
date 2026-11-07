import type { TaskHandlers } from "@/server/tasks/types";

import { cleanupIdentityData } from "./maintenance";

/**
 * Background task handlers owned by the identity module.
 * Task type names must be prefixed with "identity." (see src/server/tasks/schedule.ts for recurring ones).
 */
export const tasks: TaskHandlers = {
  /** Hourly: delete expired sessions and verification tokens expired/used more than 7 days ago. Idempotent. */
  "identity.cleanup": async (_payload, ctx) => {
    const result = await cleanupIdentityData();
    ctx.log("Identity cleanup finished", result);
  },
};
