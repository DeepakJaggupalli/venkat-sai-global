import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the analytics module.
 * Task type names must be prefixed with "analytics." (see src/server/tasks/schedule.ts for recurring ones).
 */
export const tasks: TaskHandlers = {};
