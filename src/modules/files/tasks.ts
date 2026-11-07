import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the files module.
 * Task type names must be prefixed with "files." (see src/server/tasks/schedule.ts for recurring ones).
 */
export const tasks: TaskHandlers = {};
