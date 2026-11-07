"use server";

import { revalidatePath } from "next/cache";

import { createAction, ok } from "@/lib/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import { interviewResponseSchema } from "@/modules/recruitment/schemas";
import { asCandidate, respondToInterview } from "@/modules/recruitment/service";

/** Confirm, decline or ask to reschedule one of the caller's own interviews (scoped by the recruitment module). */
export const respondInterviewAction = createAction(interviewResponseSchema, async (input) => {
  const session = await requireCandidate();
  await respondToInterview(asCandidate(session), input);
  revalidatePath("/talent/interviews");
  revalidatePath("/talent/applications", "layout");
  revalidatePath("/talent");
  return ok({ response: input.response });
});
