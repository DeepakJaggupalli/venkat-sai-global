"use server";

import { z } from "zod";

import { createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { f } from "@/lib/validation";
import { applyForInternship } from "@/modules/documents/service";
import { getCurrentSession } from "@/modules/identity/session";

const applySchema = z.object({
  programmeId: f.uuid(),
  fullName: f.text({ min: 2, max: 120, label: "Your name" }),
  phone: f.phone(),
  email: f.optionalEmail(),
  institutionName: f.optionalText(200),
  consentToContact: f.bool(),
  website: z.string().optional(),
});

/** /internships/{id} "Apply" (no account needed). Honeypot, rate limits and duplicate check in the service. */
export const applyForInternshipAction = createFormAction<typeof applySchema, { programmeTitle: string }>(applySchema, async (input) => {
  const [meta, session] = await Promise.all([getRequestMeta(), getCurrentSession().catch(() => null)]);
  return ok(await applyForInternship(input, { ipHash: meta.ipHash, userId: session?.user.id ?? null }));
});
