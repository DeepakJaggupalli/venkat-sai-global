import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the jobs module.
 * Task type names must be prefixed with "jobs." (see src/server/tasks/schedule.ts for recurring ones).
 */
export const tasks: TaskHandlers = {};
