import { z } from "zod";

import { f } from "@/lib/validation";
import { GRIEVANCE_TYPE_VALUES, TICKET_CATEGORY_VALUES } from "@/modules/operations/constants";

/**
 * Public support / grievance form (client-safe). Signed-in visitors raise the ticket on their account
 * (name and email come from it); guests must give a name and an email for the reply, enforced in the action.
 * `website` is the honeypot, `consentToContact` the required consent.
 */
export const publicTicketSchema = z.object({
  name: f.optionalText(120),
  email: f.optionalEmail(),
  phone: f.optionalPhone(),
  category: f.enumOf(TICKET_CATEGORY_VALUES, "Choose what your request is about"),
  subject: f.text({ label: "Subject", max: 200 }),
  message: f.text({ label: "Describe the issue", min: 10, max: 10_000 }),
  grievanceType: f.enumOf(GRIEVANCE_TYPE_VALUES).optional(),
  consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may contact you about your request" }),
  website: z.string().max(500).optional(),
  locale: z
    .string()
    .trim()
    .max(12)
    .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/)
    .optional()
    .catch(undefined),
});

export type PublicTicketInput = z.output<typeof publicTicketSchema>;

export type PublicTicketResult = { code: string | null; signedIn: boolean };

/** Field errors for a guest submission missing the reply details (pure). */
export function guestContactErrors(input: Pick<PublicTicketInput, "name" | "email">): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (!input.name) errors.name = ["Enter your name"];
  if (!input.email) errors.email = ["Enter your email address so we can reply"];
  return Object.keys(errors).length ? errors : null;
}
