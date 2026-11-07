import "server-only";

import { ActionError } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { getCurrentUser } from "@/modules/identity/session";
import { GUEST_TICKET_CATEGORIES } from "@/modules/operations/constants";
import { createSupportTicket } from "@/modules/operations/service";

import { guestContactErrors, type PublicTicketInput, type PublicTicketResult } from "./ticket-schema";

/**
 * Raise a ticket from a public page. Signed-in visitors get a ticket on their account (portal "public",
 * followed up in their portal's support section); guests get a guest ticket answered by email. The
 * operations module applies the guest honeypot, rate limits, grievance register code and SLA timelines.
 */
export async function submitPublicTicket(input: PublicTicketInput): Promise<PublicTicketResult> {
  if (!GUEST_TICKET_CATEGORIES.includes(input.category)) {
    throw new ActionError("Please correct the highlighted fields.", { fieldErrors: { category: ["Choose what your request is about"] } });
  }
  const user = await getCurrentUser();

  if (user) {
    // Bots do not hold sessions, but a filled trap still means "not a person": accept silently.
    if (input.website?.trim()) return { code: null, signedIn: true };
    const limit = await rateLimit(`public-ticket:user:${user.id}`, 5, 3600);
    if (!limit.allowed) throw new ActionError("You have sent several requests in a short time. Please wait a little and try again.");
    const result = await createSupportTicket(
      { kind: "user", user, portal: "public" },
      {
        category: input.category,
        priority: "normal",
        subject: input.subject,
        message: input.message,
        attachmentFileIds: [],
        portal: "public",
        grievanceType: input.grievanceType,
      },
    );
    return { code: result.grievanceCode ?? result.code, signedIn: true };
  }

  const missing = guestContactErrors(input);
  if (missing) throw new ActionError("Please correct the highlighted fields.", { fieldErrors: missing });
  const meta = await getRequestMeta();
  const result = await createSupportTicket(
    { kind: "guest", name: input.name!, email: input.email!, phone: input.phone ?? null, locale: input.locale ?? null, ipHash: meta.ipHash },
    {
      name: input.name!,
      email: input.email!,
      phone: input.phone,
      category: input.category,
      subject: input.subject,
      message: input.message,
      grievanceType: input.grievanceType,
      consentToContact: true,
      website: input.website,
      locale: input.locale,
    },
  );
  return { code: result.grievanceCode ?? result.code, signedIn: false };
}
