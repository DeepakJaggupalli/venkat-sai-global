"use server";

import { createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { getCurrentUser } from "@/modules/identity/session";
import { publicEnquirySchema } from "@/modules/operations/schemas";
import { submitPublicEnquiry } from "@/modules/operations/service";

/**
 * Public contact form. No sign-in needed: the operations module enforces the honeypot, per-IP and
 * per-contact rate limits and the consent rule, records the privacy-notice version, and records the
 * `contact_form_submitted` / `employer_enquiry_submitted` conversion server-side (so the page does not).
 * Signed-in visitors are linked to their account.
 */
export const sendContactEnquiryAction = createFormAction(publicEnquirySchema, async (input) => {
  const [meta, user] = await Promise.all([getRequestMeta(), getCurrentUser()]);
  const result = await submitPublicEnquiry({ ...input, sourcePage: input.sourcePage ?? "/contact" }, { ipHash: meta.ipHash, userId: user?.id ?? null });
  return ok({ code: result.code }, "Thank you. We have received your enquiry.");
});
