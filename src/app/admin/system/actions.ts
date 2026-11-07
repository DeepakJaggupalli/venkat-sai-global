"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";

import { anyDevTransport } from "../settings/integrations/_lib/integration-status";
import { clearOutbox, deleteTasks, retryAllDead, retryTasks, runRecurringNow } from "./_lib/system";

const ids = z.array(z.number().int().positive()).min(1).max(200);

function refresh() {
  revalidatePath("/admin/system");
  revalidatePath("/admin/system/tasks");
}

export const retryTasksAction = createAction(z.object({ ids }), async (input) => {
  await requireStaff("system.jobs");
  const n = await retryTasks(input.ids);
  refresh();
  if (!n) throw new ActionError("Only failed or dead tasks can be retried.");
  return ok(undefined, n === 1 ? "Task queued again" : `${n} tasks queued again`);
});

export const retryAllDeadAction = createAction(z.object({ type: z.string().max(100).optional() }), async ({ type }) => {
  await requireStaff("system.jobs");
  const n = await retryAllDead(type);
  refresh();
  return ok(undefined, n ? `${n} dead task${n === 1 ? "" : "s"} queued again` : "No dead tasks to retry");
});

export const deleteTasksAction = createAction(z.object({ ids }), async (input) => {
  await requireStaff("system.jobs");
  const n = await deleteTasks(input.ids);
  refresh();
  if (!n) throw new ActionError("Only finished tasks (dead, failed or succeeded) can be deleted.");
  return ok(undefined, n === 1 ? "Task deleted" : `${n} tasks deleted`);
});

export const runRecurringNowAction = createAction(z.object({ type: z.string().max(100) }), async ({ type }) => {
  await requireStaff("system.jobs");
  const queued = await runRecurringNow(type);
  refresh();
  return ok(undefined, queued ? "Queued. The worker picks it up within a minute." : "Already queued in the last minute");
});

export const clearOutboxAction = createAction(z.object({}), async () => {
  await requireStaff("system.dev_outbox");
  if (!anyDevTransport()) throw new ActionError("The development outbox is not in use.");
  const n = await clearOutbox();
  revalidatePath("/admin/system/dev-outbox");
  return ok(undefined, `${n} message${n === 1 ? "" : "s"} removed`);
});
