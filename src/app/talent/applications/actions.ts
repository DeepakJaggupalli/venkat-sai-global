"use server";

import { revalidatePath } from "next/cache";

import { createAction, ok } from "@/lib/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import { respondToOfferSchema, submitChecklistItemSchema, withdrawApplicationSchema } from "@/modules/recruitment/schemas";
import { asCandidate, respondToOffer, submitChecklistItem, withdrawApplication } from "@/modules/recruitment/service";

/*
 * People Portal application actions. Each re-authorises the candidate and passes a candidate actor, so
 * the recruitment module scopes every id to the caller's own applications, offers and checklist items.
 */

function refresh(applicationId?: string) {
  revalidatePath("/talent/applications");
  if (applicationId) revalidatePath(`/talent/applications/${applicationId}`);
  revalidatePath("/talent/interviews");
  revalidatePath("/talent");
}

export const withdrawAction = createAction(withdrawApplicationSchema, async (input) => {
  const session = await requireCandidate();
  await withdrawApplication(asCandidate(session), input.applicationId, { reason: input.reason });
  refresh(input.applicationId);
  return ok();
});

export const respondOfferAction = createAction(respondToOfferSchema, async (input) => {
  const session = await requireCandidate();
  await respondToOffer(asCandidate(session), input);
  refresh();
  revalidatePath("/talent/applications", "layout");
  return ok({ response: input.response });
});

export const submitChecklistAction = createAction(submitChecklistItemSchema, async (input) => {
  const session = await requireCandidate();
  await submitChecklistItem(asCandidate(session), input);
  revalidatePath("/talent/applications", "layout");
  return ok();
});
