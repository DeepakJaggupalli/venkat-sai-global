"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireCandidate } from "@/modules/candidates/guard";
import { ISSUED_DOCUMENT_KINDS } from "@/modules/documents/content";
import { requestDocument } from "@/modules/documents/service";
import { setCertificatePublicVerificationAction } from "@/modules/training/candidate-actions";

import { requireConsentedCandidate } from "../_lib/guard";

/** Switch the public code check of one of the caller's own certificates (ownership checked by the module). */
export const setCertificateVerificationAction = createAction(z.object({ certificateId: f.uuid(), enabled: z.boolean() }), async (input) => {
  // Turning the public check off is always allowed; turning it on publishes data and needs consent.
  if (input.enabled) await requireConsentedCandidate();
  else await requireCandidate();
  const result = await setCertificatePublicVerificationAction(input);
  if (result.ok) revalidatePath("/talent/certificates");
  return result;
});

/** Ask for a certificate or letter for a course or internship the caller finished (waits for staff approval). */
export const requestDocumentAction = createFormAction(
  z.object({
    option: z.string().regex(/^(enrolment|intern):[0-9a-f-]{36}$/i, "Choose the course or internship"),
    kind: z.enum(ISSUED_DOCUMENT_KINDS),
    note: f.optionalText(500),
  }),
  async ({ option, kind, note }) => {
    const { user, candidate } = await requireConsentedCandidate();
    const [source, sourceId] = option.split(":") as ["enrolment" | "intern", string];
    await requestDocument({ userId: user.id, candidateId: candidate.id }, { source, sourceId, kind, note });
    revalidatePath("/talent/certificates");
    return ok(undefined);
  },
);
