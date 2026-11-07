"use server";

import { createFormAction, ok } from "@/lib/actions";

import { submitPublicTicket } from "../support/_lib/submit-ticket";
import { publicTicketSchema } from "../support/_lib/ticket-schema";

/**
 * Grievance form: always a formal grievance ticket (category "grievance"), which the operations module
 * registers with a GRV code and the acknowledgement / resolution deadlines from settings.
 */
export const submitGrievanceAction = createFormAction(publicTicketSchema, async (input) => {
  const result = await submitPublicTicket({ ...input, category: "grievance", grievanceType: input.grievanceType ?? "general" });
  return ok(result, "Thank you. Your grievance has been registered.");
});
