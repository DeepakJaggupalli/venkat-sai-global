import "server-only";

import type { TaskHandlers } from "@/server/tasks/types";

import { runSlaWatch } from "./support";
import { runOperationsReminders } from "./work";

/**
 * Background task handlers owned by the operations module (registered in src/server/tasks/registry.ts).
 *
 *  support.sla_watch     recurring (hourly, src/server/tasks/schedule.ts): flag SLA breaches, escalate
 *                        grievances, notify assignees / the support team / grievance officers
 *  operations.reminders  task-due and lead follow-up reminders (schedule entry requested — see README)
 *
 * Both are idempotent: breach stamps are set once and every notification carries a dedupe key.
 */
export const tasks: TaskHandlers = {
  "support.sla_watch": async (_payload, ctx) => {
    const summary = await runSlaWatch(new Date());
    ctx.log("Support SLA watch finished", summary);
  },
  "operations.reminders": async (_payload, ctx) => {
    const summary = await runOperationsReminders(new Date());
    ctx.log("Operations reminders sent", summary);
  },
};
