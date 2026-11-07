"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { createFormAction, ok, type ActionResult, type ActionState } from "@/lib/actions";
import * as candidateActions from "@/modules/candidates/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import type { CandidateSession } from "@/modules/candidates/types";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";
import { CONTACT_METHODS, CONTACT_METHOD_KEY } from "./_lib/contact-method";

/**
 * People Portal profile actions. Each one re-authorises the candidate and checks the age gate
 * (DPDP Rules 2025: nothing beyond age confirmation is processed for a child until guardian consent
 * is recorded), then delegates to the candidates module action, which re-authorises again and owns
 * every business rule. The date of birth is never changed here: it is locked once the age step is
 * complete (corrections go through a data correction request on /talent/privacy).
 */

type FormState<T = undefined> = ActionState<T>;

async function gate(): Promise<CandidateSession> {
  const session = await requireCandidate();
  const ageGate = await getAgeGateForCandidate(session.candidate);
  if (ageGate.state !== "complete") redirect("/talent/onboarding");
  return session;
}

/** Editors only need the outcome; the saved row id stays on the server. */
function withoutData(result: ActionResult<unknown>): ActionResult {
  return result.ok ? { ok: true, message: result.message } : result;
}

// ---- Form actions -----------------------------------------------------------------------------

export async function savePersonal(prev: FormState, formData: FormData): Promise<ActionResult> {
  const session = await gate();
  // The stored date of birth always wins (the age gate decided on it).
  formData.set("dateOfBirth", session.candidate.dateOfBirth ?? "");
  return candidateActions.savePersonalAction(prev, formData);
}

export async function saveProfessional(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.saveProfessionalAction(prev, formData);
}

export async function savePreferences(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.savePreferencesAction(prev, formData);
}

export async function savePreferredLocations(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.savePreferredLocationsAction(prev, formData);
}

export async function setResume(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.setResumeAction(prev, formData);
}

export async function setPhoto(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.setPhotoAction(prev, formData);
}

export async function saveEducation(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return withoutData(await candidateActions.saveEducationAction(prev as ActionState<{ id: string }>, formData));
}

export async function saveExperience(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return withoutData(await candidateActions.saveExperienceAction(prev as ActionState<{ id: string }>, formData));
}

export async function saveSkills(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.saveSkillsAction(prev, formData);
}

export async function saveLanguages(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return candidateActions.saveLanguagesAction(prev, formData);
}

export async function saveCredential(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return withoutData(await candidateActions.saveCredentialAction(prev as ActionState<{ id: string }>, formData));
}

export async function saveDocument(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return withoutData(await candidateActions.saveDocumentAction(prev as ActionState<{ id: string }>, formData));
}

export async function savePortfolioItem(prev: FormState, formData: FormData): Promise<ActionResult> {
  await gate();
  return withoutData(await candidateActions.savePortfolioItemAction(prev as ActionState<{ id: string }>, formData));
}

/**
 * Preferred contact method. There is no profile column for it, so it is kept in the account's
 * preferences (users.preferences.talentContactMethod) next to other per-user choices.
 */
export const saveContactMethod = createFormAction(z.object({ method: z.enum(CONTACT_METHODS).optional() }), async ({ method }) => {
  const session = await gate();
  const value = JSON.stringify({ [CONTACT_METHOD_KEY]: method ?? null });
  await db
    .update(users)
    .set({ preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${value}::jsonb` })
    .where(eq(users.id, session.user.id));
  revalidatePath("/talent/profile");
  return ok(undefined, "Saved");
});

// ---- Item actions (buttons) -------------------------------------------------------------------

type IdInput = { id: string };

export async function deleteEducation(input: IdInput): Promise<ActionResult> {
  await gate();
  return candidateActions.deleteEducationAction(input);
}

export async function deleteExperience(input: IdInput): Promise<ActionResult> {
  await gate();
  return candidateActions.deleteExperienceAction(input);
}

export async function deleteCredential(input: IdInput): Promise<ActionResult> {
  await gate();
  return candidateActions.deleteCredentialAction(input);
}

export async function submitCredentialVerification(input: IdInput) {
  await gate();
  return candidateActions.submitCredentialVerificationAction(input);
}

export async function deleteDocument(input: IdInput): Promise<ActionResult> {
  await gate();
  return candidateActions.deleteDocumentAction(input);
}

export async function setDocumentSharing(input: { id: string; isShareableWithEmployers: boolean }): Promise<ActionResult> {
  await gate();
  return candidateActions.setDocumentSharingAction(input);
}

export async function submitDocumentVerification(input: IdInput) {
  await gate();
  return candidateActions.submitDocumentVerificationAction(input);
}

export async function deletePortfolioItem(input: IdInput): Promise<ActionResult> {
  await gate();
  return candidateActions.deletePortfolioItemAction(input);
}

export async function reorderExperience(input: { ids: string[] }): Promise<ActionResult> {
  await gate();
  return candidateActions.reorderExperienceAction(input);
}

export async function reorderEducation(input: { ids: string[] }): Promise<ActionResult> {
  await gate();
  return candidateActions.reorderEducationAction(input);
}
