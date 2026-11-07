"use server";

import { revalidatePath } from "next/cache";

import { createAction, ok } from "@/lib/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import { interviewResponseSchema } from "@/modules/recruitment/schemas";
import { asCandidate, respondToInterview } from "@/modules/recruitment/service";

import { requireConsentedCandidate } from "../_lib/guard";

/** Confirm, decline or ask to reschedule one of the caller's own interviews (scoped by the recruitment module). */
export const respondInterviewAction = createAction(interviewResponseSchema, async (input) => {
  // Declining is always allowed; confirming or rescheduling continues processing and needs consent.
  const session = input.response === "declined" ? await requireCandidate() : await requireConsentedCandidate();
  await respondToInterview(asCandidate(session), input);
  revalidatePath("/talent/interviews");
  revalidatePath("/talent/applications", "layout");
  revalidatePath("/talent");
  return ok({ response: input.response });
});
