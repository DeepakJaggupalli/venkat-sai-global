"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import { jobAlertSchema, jobAlertToggleSchema } from "@/modules/jobs/schemas";
import { deleteJobAlert, saveJobAlert, setJobAlertActive } from "@/modules/jobs/saved-alerts-service";

/*
 * People Portal job alerts. Each action re-authorises the candidate; the jobs module scopes every alert
 * to the caller's user id (another user's alert id is "not found"). Messages are shown by the client in
 * the candidate's language, so results carry data only.
 */

export const saveAlertAction = createFormAction(jobAlertSchema, async (input) => {
  const { user } = await requireCandidate();
  const alert = await saveJobAlert(user, input);
  revalidatePath("/talent/alerts");
  return ok({ id: alert.id, created: !input.id });
});

export const toggleAlertAction = createAction(jobAlertToggleSchema, async ({ id, isActive }) => {
  const { user } = await requireCandidate();
  await setJobAlertActive(user, id, isActive);
  revalidatePath("/talent/alerts");
  return ok({ isActive });
});

export const deleteAlertAction = createAction(z.object({ id: z.uuid() }), async ({ id }) => {
  const { user } = await requireCandidate();
  await deleteJobAlert(user, id);
  revalidatePath("/talent/alerts");
  return ok();
});
