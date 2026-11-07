"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireCandidate } from "@/modules/candidates/guard";
import { setCertificatePublicVerificationAction } from "@/modules/training/candidate-actions";

/** Switch the public code check of one of the caller's own certificates (ownership checked by the module). */
export const setCertificateVerificationAction = createAction(z.object({ certificateId: f.uuid(), enabled: z.boolean() }), async (input) => {
  await requireCandidate();
  const result = await setCertificatePublicVerificationAction(input);
  if (result.ok) revalidatePath("/talent/certificates");
  return result;
});
