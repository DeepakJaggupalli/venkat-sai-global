import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the content module.
 * Task type names must be prefixed with "content." (see src/server/tasks/schedule.ts for recurring ones).
 */
export const tasks: TaskHandlers = {};
