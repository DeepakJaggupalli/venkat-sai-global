"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireCandidate } from "@/modules/candidates/guard";
import { createSupportTicket } from "@/modules/operations/support";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";
import { CAREER_SERVICES, CAREER_SERVICE_SUBJECTS } from "./_lib/services";

/**
 * Career service requests (resume review, career counselling, interview preparation) become support
 * tickets in the candidate_support category, so the Venkat Sai team answers them in the normal
 * support queue and the candidate follows them under /talent/support.
 */
const schema = z.object({
  service: z.enum(CAREER_SERVICES),
  message: f.text({ label: "Message", min: 10, max: 4000 }),
  preferredTimes: f.optionalText(300),
});

export const requestCareerService = createFormAction(schema, async (input) => {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect("/talent/onboarding");

  const body = [input.message, input.preferredTimes ? `Preferred times: ${input.preferredTimes}` : null, `Requested from: People Portal career services (${input.service})`]
    .filter(Boolean)
    .join("\n\n");
  const ticket = await createSupportTicket(
    { kind: "user", user: session.user, portal: "talent" },
    { category: "candidate_support", priority: "normal", subject: CAREER_SERVICE_SUBJECTS[input.service], message: body, attachmentFileIds: [], portal: "talent" },
  );
  revalidatePath("/talent/support");
  return ok({ id: ticket.id, code: ticket.code });
});
