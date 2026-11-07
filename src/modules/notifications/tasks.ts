import "server-only";

import { redactTaskPayload } from "@/server/tasks/queue";
import type { TaskContext, TaskHandlers } from "@/server/tasks/types";

import { hasSecretLink } from "./channels";
import { dispatchNotification, dispatchToOrganization, dispatchToStaff, retryDelivery, type DispatchSummary } from "./dispatch";

/**
 * Background task handlers owned by the notifications module (registered in src/server/tasks/registry.ts).
 *
 *  notifications.dispatch        payload = NotifyInput (enqueued by notify())
 *  notifications.dispatch_staff  payload = NotifyInput without recipients + { permission } (notifyStaff())
 *  notifications.dispatch_org    payload = NotifyInput without recipients + { organizationId, permission? } (notifyOrganization())
 *  notifications.retry_delivery  payload = { deliveryId, recipient, event, data, link, … } (failed sends, backoff)
 *
 * All handlers are idempotent: rows are keyed by the dispatch key (notify's dedupeKey, else the task id),
 * so a crashed or retried task never duplicates notifications or re-sends delivered messages.
 *
 * Events with a secret link (channels.hasSecretLink, e.g. org.invitation) have `link` removed from the stored
 * payload once the handler has finished. A failed send keeps working: its retry task carries its own copy,
 * which is removed in turn when that retry has run.
 */
function dispatchKey(payload: Record<string, unknown>, ctx: TaskContext): string {
  const key = typeof payload.dedupeKey === "string" && payload.dedupeKey.trim() ? payload.dedupeKey.trim() : null;
  return key ?? `task:${ctx.taskId}`;
}

function logSummary(ctx: TaskContext, type: string, payload: Record<string, unknown>, summary: DispatchSummary) {
  ctx.log("Notification dispatched", { type, event: typeof payload.event === "string" ? payload.event : null, ...summary });
}

async function forgetSecretLink(payload: Record<string, unknown>, ctx: TaskContext): Promise<void> {
  if (hasSecretLink(payload.event) && "link" in payload) await redactTaskPayload(ctx.taskId, ["link"]);
}

export const tasks: TaskHandlers = {
  "notifications.dispatch": async (payload, ctx) => {
    const summary = await dispatchNotification(payload, { dispatchKey: dispatchKey(payload, ctx) });
    logSummary(ctx, "notifications.dispatch", payload, summary);
    await forgetSecretLink(payload, ctx);
  },
  "notifications.dispatch_staff": async (payload, ctx) => {
    const summary = await dispatchToStaff(payload, { dispatchKey: dispatchKey(payload, ctx) });
    logSummary(ctx, "notifications.dispatch_staff", payload, summary);
    await forgetSecretLink(payload, ctx);
  },
  "notifications.dispatch_org": async (payload, ctx) => {
    const summary = await dispatchToOrganization(payload, { dispatchKey: dispatchKey(payload, ctx) });
    logSummary(ctx, "notifications.dispatch_org", payload, summary);
    await forgetSecretLink(payload, ctx);
  },
  "notifications.retry_delivery": async (payload, ctx) => {
    const outcome = await retryDelivery(payload);
    ctx.log("Notification delivery retried", { deliveryId: typeof payload.deliveryId === "string" ? payload.deliveryId : null, outcome });
    await forgetSecretLink(payload, ctx);
  },
};
