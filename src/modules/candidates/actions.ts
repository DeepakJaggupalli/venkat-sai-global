"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import { selfActor } from "./actor";
import { setEducationVerification, setExperienceVerification, saveEducation, deleteEducation, reorderEducation, saveExperience, deleteExperience, reorderExperience } from "./career-service";
import { deleteCandidateCredential, deleteCandidateDocument, saveCandidateCredential, saveCandidateDocument, setDocumentSharing, submitCredentialForVerification, submitDocumentForVerification } from "./documents-service";
import { requireCandidate } from "./guard";
import { deletePortfolioItem, reorderPortfolio, savePortfolioItem } from "./portfolio-service";
import { updateCandidateConsents, updatePrivacySettings, updateVisibility } from "./privacy-service";
import { setCandidatePhoto, setCandidateResume, updateJobPreferences, updatePersonalDetails, updateProfessionalSummary } from "./profile-service";
import {
  candidateConsentsSchema,
  credentialSchema,
  documentSchema,
  documentSharingSchema,
  educationSchema,
  experienceSchema,
  fileRefSchema,
  idSchema,
  itemVerificationSchema,
  languagesSchema,
  personalSchema,
  portfolioItemSchema,
  preferencesSchema,
  preferredLocationsSchema,
  privacySettingsSchema,
  professionalSchema,
  reorderSchema,
  revealSchema,
  skillsSchema,
  visibilitySchema,
} from "./schemas";
import { removeCandidateSkill, replaceCandidateLanguages, replaceCandidateSkills, replacePreferredLocations } from "./skills-service";
import type { CandidateViewer } from "./types";
import { getCandidateView } from "./viewer";

/**
 * Server Actions for the People Portal profile editor (/talent/profile, /talent/privacy) and a few
 * staff / organisation actions. Thin: authorise → validate (schemas.ts) → service → revalidate.
 * Messages are English; the People Portal translates by action outcome and error `code`.
 */

const PROFILE = "/talent/profile";
const DASHBOARD = "/talent";
const PRIVACY = "/talent/privacy";

function refreshProfile(...extra: string[]): void {
  revalidatePath(PROFILE);
  revalidatePath(DASHBOARD);
  for (const path of extra) revalidatePath(path);
}

async function me() {
  return selfActor(await requireCandidate());
}

// ---------------------------------------------------------------------------
// Profile sections
// ---------------------------------------------------------------------------

export const savePersonalAction = createFormAction(personalSchema, async (input) => {
  await updatePersonalDetails(await me(), input);
  refreshProfile();
  return ok(undefined, "Personal details saved");
});

export const saveProfessionalAction = createFormAction(professionalSchema, async (input) => {
  await updateProfessionalSummary(await me(), input);
  refreshProfile();
  return ok(undefined, "Professional summary saved");
});

export const savePreferencesAction = createFormAction(preferencesSchema, async (input) => {
  await updateJobPreferences(await me(), input);
  refreshProfile("/talent/jobs");
  return ok(undefined, "Job preferences saved");
});

export const setResumeAction = createFormAction(fileRefSchema, async ({ fileId }) => {
  await setCandidateResume(await me(), fileId ?? null);
  refreshProfile();
  return ok(undefined, fileId ? "Resume saved" : "Resume removed");
});

export const setPhotoAction = createFormAction(fileRefSchema, async ({ fileId }) => {
  await setCandidatePhoto(await me(), fileId ?? null);
  refreshProfile();
  return ok(undefined, fileId ? "Photo saved" : "Photo removed");
});

// ---------------------------------------------------------------------------
// Education & experience
// ---------------------------------------------------------------------------

export const saveEducationAction = createFormAction(educationSchema, async (input) => {
  const row = await saveEducation(await me(), input);
  refreshProfile();
  return ok({ id: row.id }, "Education saved");
});

export const deleteEducationAction = createAction(idSchema, async ({ id }) => {
  await deleteEducation(await me(), id);
  refreshProfile();
  return ok(undefined, "Education removed");
});

export const reorderEducationAction = createAction(reorderSchema, async ({ ids }) => {
  await reorderEducation(await me(), ids);
  refreshProfile();
  return ok();
});

export const saveExperienceAction = createFormAction(experienceSchema, async (input) => {
  const row = await saveExperience(await me(), input);
  refreshProfile();
  return ok({ id: row.id }, "Work experience saved");
});

export const deleteExperienceAction = createAction(idSchema, async ({ id }) => {
  await deleteExperience(await me(), id);
  refreshProfile();
  return ok(undefined, "Work experience removed");
});

export const reorderExperienceAction = createAction(reorderSchema, async ({ ids }) => {
  await reorderExperience(await me(), ids);
  refreshProfile();
  return ok();
});

// ---------------------------------------------------------------------------
// Skills, languages, locations
// ---------------------------------------------------------------------------

export const saveSkillsAction = createFormAction(skillsSchema, async (input) => {
  await replaceCandidateSkills(await me(), input);
  refreshProfile("/talent/jobs");
  return ok(undefined, "Skills saved");
});

export const removeSkillAction = createAction(z.object({ skillId: z.uuid() }), async ({ skillId }) => {
  await removeCandidateSkill(await me(), skillId);
  refreshProfile();
  return ok(undefined, "Skill removed");
});

export const saveLanguagesAction = createFormAction(languagesSchema, async (input) => {
  await replaceCandidateLanguages(await me(), input);
  refreshProfile();
  return ok(undefined, "Languages saved");
});

export const savePreferredLocationsAction = createFormAction(preferredLocationsSchema, async (input) => {
  await replacePreferredLocations(await me(), input);
  refreshProfile("/talent/jobs");
  return ok(undefined, "Preferred locations saved");
});

// ---------------------------------------------------------------------------
// Credentials, documents, portfolio
// ---------------------------------------------------------------------------

export const saveCredentialAction = createFormAction(credentialSchema, async (input) => {
  const row = await saveCandidateCredential(await me(), input);
  refreshProfile();
  return ok({ id: row.id }, "Credential saved");
});

export const deleteCredentialAction = createAction(idSchema, async ({ id }) => {
  await deleteCandidateCredential(await me(), id);
  refreshProfile();
  return ok(undefined, "Credential removed");
});

export const submitCredentialVerificationAction = createAction(idSchema, async ({ id }) => {
  const result = await submitCredentialForVerification(await me(), id);
  refreshProfile();
  return ok(result, "Sent for verification");
});

export const saveDocumentAction = createFormAction(documentSchema, async (input) => {
  const row = await saveCandidateDocument(await me(), input);
  refreshProfile();
  return ok({ id: row.id }, "Document saved");
});

export const deleteDocumentAction = createAction(idSchema, async ({ id }) => {
  await deleteCandidateDocument(await me(), id);
  refreshProfile();
  return ok(undefined, "Document removed");
});

export const setDocumentSharingAction = createAction(documentSharingSchema, async ({ id, isShareableWithEmployers }) => {
  await setDocumentSharing(await me(), id, isShareableWithEmployers);
  refreshProfile(PRIVACY);
  return ok(undefined, isShareableWithEmployers ? "Employers you apply to can now open this document" : "This document is now private");
});

export const submitDocumentVerificationAction = createAction(idSchema, async ({ id }) => {
  const result = await submitDocumentForVerification(await me(), id);
  refreshProfile();
  return ok(result, "Sent for verification");
});

export const savePortfolioItemAction = createFormAction(portfolioItemSchema, async (input) => {
  const row = await savePortfolioItem(await me(), input);
  refreshProfile();
  return ok({ id: row.id }, "Portfolio item saved");
});

export const deletePortfolioItemAction = createAction(idSchema, async ({ id }) => {
  await deletePortfolioItem(await me(), id);
  refreshProfile();
  return ok(undefined, "Portfolio item removed");
});

export const reorderPortfolioAction = createAction(reorderSchema, async ({ ids }) => {
  await reorderPortfolio(await me(), ids);
  refreshProfile();
  return ok();
});

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

export const savePrivacySettingsAction = createFormAction(privacySettingsSchema, async (input) => {
  await updatePrivacySettings(await me(), input);
  refreshProfile(PRIVACY);
  return ok(undefined, "Privacy settings saved");
});

export const saveVisibilityAction = createFormAction(visibilitySchema, async (input) => {
  await updateVisibility(await me(), input);
  refreshProfile(PRIVACY);
  return ok(undefined, "Profile visibility saved");
});

export const saveCandidateConsentsAction = createFormAction(candidateConsentsSchema, async (input) => {
  await updateCandidateConsents(await me(), input);
  revalidatePath(PRIVACY);
  return ok(undefined, "Your choices were saved");
});

// ---------------------------------------------------------------------------
// Staff and organisations
// ---------------------------------------------------------------------------

/**
 * Reveal a candidate's contact details (logged with logDataAccess). `as` selects the capacity the
 * signed-in user acts in; the privacy rules (policy.ts) decide whether contact may be revealed.
 */
export const revealCandidateContactAction = createAction(revealSchema, async ({ candidateId, as, reason }) => {
  let viewer: CandidateViewer;
  if (as === "staff") viewer = { kind: "staff", ctx: await requireStaff("candidates.view_contact") };
  else if (as === "employer") viewer = { kind: "employer", ctx: await requireOrgMember("employer") };
  else viewer = { kind: "partner", ctx: await requireOrgMember("recruitment_partner") };

  const actorKey = viewer.kind === "staff" ? `staff:${viewer.ctx.user.id}` : `org:${viewer.ctx.organization.id}:${viewer.ctx.user.id}`;
  const limit = await rateLimit(`candidate-contact-reveal:${actorKey}`, 100, 60 * 60);
  if (!limit.allowed) throw new ActionError("You have revealed many contact details in a short time. Please try again later.", { code: "rate_limited" });

  const view = await getCandidateView(candidateId, viewer, { revealContact: true, reason: reason ?? null });
  if (!view || view.contact.state !== "full") {
    throw new ActionError("Contact details are not available for this profile.", { code: "contact_unavailable" });
  }
  return ok({ email: view.contact.email, phone: view.contact.phone });
});

export const verifyEducationAction = createAction(itemVerificationSchema, async (input) => {
  const staff = await requireStaff("candidates.verify");
  const row = await setEducationVerification(staff, input);
  revalidatePath(`/admin/candidates/${row.candidateId}`);
  return ok(undefined, "Verification saved");
});

export const verifyExperienceAction = createAction(itemVerificationSchema, async (input) => {
  const staff = await requireStaff("candidates.verify");
  const row = await setExperienceVerification(staff, input);
  revalidatePath(`/admin/candidates/${row.candidateId}`);
  return ok(undefined, "Verification saved");
});
