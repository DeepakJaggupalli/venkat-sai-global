import "server-only";

import type { TaskHandlers } from "@/server/tasks/types";

import { sendRequirementAlert } from "./service";

export const REQUIREMENT_ALERT_TASK = "push.requirement_published";
/** Own queue, so the request that published a poster can run just this task right after its response. */
export const PUSH_QUEUE = "push";

/**
 * push.requirement_published { entryId } — queued by queueRequirementAlert() when a requirement poster is first
 * published (any path: phone publish, editor, approval, schedule). Sends the alert to matching subscribers.
 */
export const tasks: TaskHandlers = {
  [REQUIREMENT_ALERT_TASK]: async (payload, ctx) => {
    const entryId = typeof payload.entryId === "string" ? payload.entryId : null;
    if (!entryId) return;
    const counts = await sendRequirementAlert(entryId);
    ctx.log("Requirement push alert sent", counts);
  },
};
