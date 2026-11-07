"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { f } from "@/lib/validation";
import { assertGuardianConsentIfMinor, requireCandidate } from "@/modules/candidates/guard";
import { isFeatureEnabled } from "@/modules/settings";

import { registerForCampusDrive, withdrawCampusDriveRegistration } from "./campus";
import { requireCandidateActor } from "./candidate";
import { setCertificatePublicVerification, verifyCertificateByCode } from "./certificates";
import { applyToBatch, withdrawEnrolment } from "./enrolments";
import { confirmPlacementOutcome } from "./outcomes";
import { applyToBatchSchema, campusRegistrationSchema, verifyCertificateCodeSchema } from "./schemas";

/** Server Actions for candidates (People Portal) and the public certificate check. */

/** Applying or registering shares a child's contact details with an institution or employer: refused until a guardian consents (DPDP Act s.9). */
async function assertCandidateMayShare(): Promise<void> {
  await assertGuardianConsentIfMinor((await requireCandidate()).candidate);
}

async function assertTrainingEnabled(): Promise<void> {
  if (!(await isFeatureEnabled("talent.training", { portal: "talent" }))) throw new ActionError("Training enrolment is not available at the moment.");
}

export const applyToBatchAction = createFormAction(applyToBatchSchema, async ({ batchId }) => {
  await assertTrainingEnabled();
  const candidate = await requireCandidateActor();
  await assertCandidateMayShare();
  const limited = await rateLimit(`training-apply:${candidate.userId}`, 30, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("You have sent many applications today. Please try again tomorrow.");
  const enrolment = await applyToBatch(candidate, batchId);
  revalidatePath("/talent/training");
  return ok(
    { id: enrolment.id, status: enrolment.status },
    enrolment.status === "waitlisted" ? "The batch is full, so you are on the waitlist. We will let you know if a place opens." : "Application sent. The training provider will confirm your place.",
  );
});

export const withdrawEnrolmentAction = createAction(z.object({ enrolmentId: f.uuid(), reason: f.optionalText(500) }), async ({ enrolmentId, reason }) => {
  const candidate = await requireCandidateActor();
  await withdrawEnrolment(candidate, enrolmentId, reason);
  revalidatePath("/talent/training");
  return ok(undefined, "Your enrolment was withdrawn.");
});

export const registerForCampusDriveAction = createFormAction(campusRegistrationSchema, async ({ driveId, consentToShare }) => {
  const candidate = await requireCandidateActor();
  await assertCandidateMayShare();
  const limited = await rateLimit(`campus-register:${candidate.userId}`, 30, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("Too many registrations today. Please try again tomorrow.");
  await registerForCampusDrive(candidate, driveId, { consentToShare });
  revalidatePath("/talent/training");
  return ok(undefined, "You are registered for the drive.");
});

export const withdrawCampusDriveRegistrationAction = createAction(z.object({ registrationId: f.uuid() }), async ({ registrationId }) => {
  const candidate = await requireCandidateActor();
  await withdrawCampusDriveRegistration(candidate, registrationId);
  revalidatePath("/talent/training");
  return ok(undefined, "Registration withdrawn.");
});

export const confirmPlacementOutcomeAction = createAction(z.object({ outcomeId: f.uuid() }), async ({ outcomeId }) => {
  const candidate = await requireCandidateActor();
  await confirmPlacementOutcome(candidate, outcomeId);
  revalidatePath("/talent/training");
  return ok(undefined, "Thank you for confirming.");
});

export const setCertificatePublicVerificationAction = createAction(z.object({ certificateId: f.uuid(), enabled: z.boolean() }), async ({ certificateId, enabled }) => {
  const candidate = await requireCandidateActor();
  await setCertificatePublicVerification(candidate, certificateId, enabled);
  revalidatePath("/talent/certificates");
  return ok(undefined, enabled ? "Employers can verify this certificate with its code." : "Public verification of this certificate is switched off.");
});

/** Public certificate check (rate-limited per IP). Returns only what is printed on the certificate. */
export const verifyCertificateAction = createFormAction(verifyCertificateCodeSchema, async ({ code }) => {
  const meta = await getRequestMeta();
  const limited = await rateLimit(`certificate-verify:${meta.ipHash ?? "unknown"}`, 30, 10 * 60);
  if (!limited.allowed) throw new ActionError("Too many checks from your network. Please wait a few minutes and try again.");
  const result = await verifyCertificateByCode(code);
  return ok(result, result.found ? undefined : "No certificate matches this code. Check the code and try again.");
});
