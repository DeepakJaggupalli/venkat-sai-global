"use server";

import { createFormAction, ok } from "@/lib/actions";

import { submitPublicTicket } from "./_lib/submit-ticket";
import { publicTicketSchema } from "./_lib/ticket-schema";

/** Public help form (guests and signed-in visitors). Grievances use /grievance. */
export const submitSupportRequestAction = createFormAction(publicTicketSchema, async (input) => {
  const result = await submitPublicTicket({ ...input, grievanceType: input.category === "grievance" ? (input.grievanceType ?? "general") : undefined });
  return ok(result, "Thank you. We have received your request.");
});
