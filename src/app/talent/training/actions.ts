"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireCandidate } from "@/modules/candidates/guard";
import { applyToBatchAction, withdrawEnrolmentAction } from "@/modules/training/candidate-actions";
import { applyToBatchSchema } from "@/modules/training/schemas";

/**
 * People Portal enrolment actions. They add the portal's declaration check and refresh every training page,
 * then delegate to the training module's actions (feature flag, rate limit, ownership and seat rules live there).
 */

const applyFormSchema = applyToBatchSchema.extend({
  declaration: f.bool().refine((v) => v, "Confirm the declaration"),
});

export const applyToBatchFormAction = createFormAction(applyFormSchema, async (_input, formData) => {
  await requireCandidate();
  const result = await applyToBatchAction(null, formData);
  if (result.ok) revalidatePath("/talent/training", "layout");
  return result;
});

export const withdrawEnrolmentFormAction = createAction(z.object({ enrolmentId: f.uuid(), reason: f.optionalText(500) }), async (input) => {
  await requireCandidate();
  const result = await withdrawEnrolmentAction(input);
  if (result.ok) revalidatePath("/talent/training", "layout");
  return result;
});
