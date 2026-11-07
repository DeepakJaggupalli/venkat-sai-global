"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { candidateSkills } from "@/db/schema";
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { ActionError, createFormAction } from "@/lib/actions";
import { f } from "@/lib/validation";
import { audit } from "@/modules/audit";
import { CANDIDATE_AVAILABILITY_OPTIONS, CANDIDATE_VISIBILITY_OPTIONS } from "@/modules/candidates/constants";
import { requireCandidate } from "@/modules/candidates/guard";
import { preferencesSchema } from "@/modules/candidates/schemas";
import {
  enqueueCandidateRefresh,
  replaceCandidateSkills,
  selfActor,
  setCandidateResume,
  updateJobPreferences,
  updatePersonalDetails,
  updateProfessionalSummary,
  updateVisibility,
} from "@/modules/candidates/service";
import type { CandidateSession } from "@/modules/candidates/types";
import { recordConsent } from "@/modules/identity/consent";
import { currentPolicyVersions } from "@/modules/identity/service";

import {
  ONBOARDING_GOALS,
  allowedGoals,
  markStep,
  stepAfter,
  type AgeGate,
  type OnboardingState,
  type OnboardingStep,
  ONBOARDING_STEPS,
} from "@/components/talent/onboarding/steps";

import {
  ONBOARDING_PATH,
  getAgeGateForCandidate,
  getOnboardingState,
  personalInputFrom,
  preferencesInputFrom,
  professionalInputFrom,
  saveOnboardingState,
} from "./_lib/state";

/**
 * Onboarding Server Actions. Each one re-authorises with requireCandidate() (layouts do not protect
 * actions), checks the age gate, saves through the candidates module services (merging with the
 * stored section, because section saves replace the whole section) and moves to the next step.
 */

const toArray = (v: unknown): unknown[] => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);
const enumList = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(toArray, z.array(z.enum(values, { error: "Choose a valid option" }))).transform((v) => [...new Set(v)]);

const isoDate = z
  .string({ error: "Date is required" })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Enter a valid date");

function stepHref(step: OnboardingStep | "done"): string {
  return `${ONBOARDING_PATH}?step=${step}`;
}

function refresh(): void {
  revalidatePath("/talent", "layout");
}

/** Signed-in candidate whose age gate is complete (the steps after it are unavailable otherwise). */
async function requireGatedCandidate(): Promise<{ session: CandidateSession; gate: Extract<AgeGate, { state: "complete" }>; state: OnboardingState }> {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect(ONBOARDING_PATH);
  return { session, gate, state: await getOnboardingState(session.user.id) };
}

async function finishStep(userId: string, state: OnboardingState, step: OnboardingStep, how: "completed" | "skipped"): Promise<never> {
  let next = markStep(state, step, how);
  const after = stepAfter(step);
  if (!after && !next.finishedAt) next = { ...next, finishedAt: new Date().toISOString() };
  await saveOnboardingState(userId, next);
  refresh();
  redirect(stepHref(after ?? "done"));
}

// ---------------------------------------------------------------------------
// Age gate
// ---------------------------------------------------------------------------

const dobSchema = z.object({
  dateOfBirth: isoDate.superRefine((v, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    if (v > today) ctx.addIssue({ code: "custom", message: "Date of birth cannot be in the future" });
    if (v < "1900-01-01") ctx.addIssue({ code: "custom", message: "Enter a valid date of birth" });
  }),
});

export const saveDateOfBirthAction = createFormAction(dobSchema, async ({ dateOfBirth }) => {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  // Once the gate is complete the date of birth is locked here: corrections go through a data
  // correction request, so a child cannot step around the guardian requirement by retyping it.
  if (gate.state === "complete") throw new ActionError("Your date of birth is already recorded.", { code: "dob_locked" });
  await updatePersonalDetails(selfActor(session), { ...personalInputFrom(session.candidate), dateOfBirth });
  refresh();
  redirect(ONBOARDING_PATH);
});

const GUARDIAN_RELATIONSHIPS = ["parent", "legal_guardian"] as const;

const guardianSchema = z
  .object({
    guardianName: f.text({ max: 150, label: "Guardian name", min: 2 }),
    relationship: z.enum(GUARDIAN_RELATIONSHIPS, { error: "Choose a valid option" }),
    guardianEmail: f.optionalEmail(),
    guardianPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,20}$/, "Enter a valid phone number with country code")
      .optional(),
    consent: f.bool(),
  })
  .superRefine((v, ctx) => {
    if (!v.guardianEmail && !v.guardianPhone) ctx.addIssue({ code: "custom", path: ["guardianEmail"], message: "guardian_contact_required" });
    if (!v.consent) ctx.addIssue({ code: "custom", path: ["consent"], message: "guardian_consent_required" });
  });

export const saveGuardianConsentAction = createFormAction(guardianSchema, async (input) => {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "needs_guardian") throw new ActionError("Guardian consent is not needed for this account.", { code: "guardian_not_needed" });
  const versions = await currentPolicyVersions();
  await db.transaction(async (tx) => {
    // The record the candidates module looks for (minor-sql.ts, refs.ts): purpose guardian_consent,
    // granted, on the candidate's user. Guardian details are kept as consent evidence only.
    await recordConsent(
      {
        userId: session.user.id,
        purpose: "guardian_consent",
        granted: true,
        source: "talent_onboarding",
        policyVersion: versions.privacy,
        contextType: "candidate",
        contextId: session.candidate.id,
        evidence: {
          guardianName: input.guardianName,
          relationship: input.relationship,
          guardianEmail: input.guardianEmail ?? null,
          guardianPhone: input.guardianPhone?.replace(/[\s-]/g, "") ?? null,
          statement: "guardian_consent_v1",
          candidateAgeAtConsent: gate.age,
          recordedAt: new Date().toISOString(),
        },
      },
      tx,
    );
    // Relationship only — never guardian contact details in the audit trail.
    await audit({ action: "candidate.guardian_consent_recorded", entityType: "candidate", entityId: session.candidate.id, metadata: { relationship: input.relationship }, tx });
    await enqueueCandidateRefresh(session.candidate.id, tx);
  });
  refresh();
  redirect(stepHref("goals"));
});

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const saveGoalsAction = createFormAction(z.object({ goals: enumList(ONBOARDING_GOALS) }), async ({ goals }) => {
  const { session, gate, state } = await requireGatedCandidate();
  const allowed = allowedGoals(gate.minor);
  const chosen = goals.filter((g) => allowed.includes(g));

  // Goals that map onto job preferences; everything else only tailors the portal.
  const prefs = preferencesInputFrom(session.candidate);
  const wantsInternship = chosen.includes("internship") && !prefs.desiredEmploymentTypes.includes("internship");
  const wantsOverseas = chosen.includes("overseas") && !gate.minor && !prefs.openToOverseas;
  if (wantsInternship || wantsOverseas) {
    await updateJobPreferences(selfActor(session), {
      ...prefs,
      desiredEmploymentTypes: wantsInternship ? [...prefs.desiredEmploymentTypes, "internship"] : prefs.desiredEmploymentTypes,
      openToOverseas: wantsOverseas ? true : prefs.openToOverseas,
    });
  }
  await finishStep(session.user.id, { ...state, goals: chosen }, "goals", "completed");
});

const basicsSchema = z.object({
  currentCountryCode: f.countryCode().optional(),
  stateRegion: f.optionalText(120),
  city: f.optionalText(120),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  preferredCategoryIds: preferencesSchema.shape.preferredCategoryIds,
  preferredRoles: preferencesSchema.shape.preferredRoles,
});

export const saveBasicsAction = createFormAction(basicsSchema, async (input) => {
  const { session, state } = await requireGatedCandidate();
  const actor = selfActor(session);
  const personal = await updatePersonalDetails(actor, {
    ...personalInputFrom(session.candidate),
    currentCountryCode: input.currentCountryCode,
    stateRegion: input.stateRegion,
    city: input.city,
  });
  const professional = await updateProfessionalSummary(actor, { ...professionalInputFrom(personal), experienceLevel: input.experienceLevel });
  await updateJobPreferences(actor, { ...preferencesInputFrom(professional), preferredCategoryIds: input.preferredCategoryIds, preferredRoles: input.preferredRoles });
  await finishStep(session.user.id, state, "basics", "completed");
});

const skillsStepSchema = z.object({
  skillIds: z.preprocess(toArray, z.array(z.uuid("Choose a skill from the list")).max(50, "Add at most 50 skills")).transform((v) => [...new Set(v)]),
});

export const saveSkillsStepAction = createFormAction(skillsStepSchema, async ({ skillIds }) => {
  const { session, state } = await requireGatedCandidate();
  // Keep level, years and primary flags of skills already on the profile; new picks start blank.
  const existing = await db
    .select({ skillId: candidateSkills.skillId, level: candidateSkills.level, yearsExperience: candidateSkills.yearsExperience, isPrimary: candidateSkills.isPrimary })
    .from(candidateSkills)
    .where(eq(candidateSkills.candidateId, session.candidate.id));
  const byId = new Map(existing.map((s) => [s.skillId, s]));
  await replaceCandidateSkills(selfActor(session), {
    skills: skillIds.map((skillId) => {
      const kept = byId.get(skillId);
      return { skillId, level: kept?.level ?? null, yearsExperience: kept?.yearsExperience ?? null, isPrimary: kept?.isPrimary ?? false };
    }),
  });
  await finishStep(session.user.id, state, "skills", "completed");
});

const availabilitySchema = z
  .object({
    availability: z.enum(CANDIDATE_AVAILABILITY_OPTIONS).optional(),
    desiredEmploymentTypes: enumList(EMPLOYMENT_TYPES),
    preferredWorkModes: enumList(WORK_MODES),
    willingToRelocate: f.bool(),
    openToOverseas: f.bool(),
    expectedSalaryAmount: f.optionalAmount(),
    expectedSalaryCurrency: f.currencyCode().optional(),
    expectedSalaryPeriod: z.enum(SALARY_PERIODS).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.expectedSalaryAmount !== undefined) {
      if (!v.expectedSalaryCurrency) ctx.addIssue({ code: "custom", path: ["expectedSalaryCurrency"], message: "Choose a currency" });
      if (!v.expectedSalaryPeriod) ctx.addIssue({ code: "custom", path: ["expectedSalaryPeriod"], message: "Choose a pay period" });
    }
  });

export const saveAvailabilityAction = createFormAction(availabilitySchema, async (input) => {
  const { session, gate, state } = await requireGatedCandidate();
  const prefs = preferencesInputFrom(session.candidate);
  const hasSalary = input.expectedSalaryAmount !== undefined;
  await updateJobPreferences(selfActor(session), {
    ...prefs,
    availability: input.availability,
    availableFrom: input.availability === prefs.availability ? prefs.availableFrom : undefined,
    desiredEmploymentTypes: input.desiredEmploymentTypes,
    preferredWorkModes: input.preferredWorkModes,
    willingToRelocate: input.willingToRelocate,
    // Children are never offered overseas work (the service refuses it too).
    openToOverseas: gate.minor ? false : input.openToOverseas,
    expectedSalaryAmount: hasSalary ? input.expectedSalaryAmount : undefined,
    expectedSalaryCurrency: hasSalary ? input.expectedSalaryCurrency : undefined,
    expectedSalaryPeriod: hasSalary ? input.expectedSalaryPeriod : undefined,
  });
  await finishStep(session.user.id, state, "availability", "completed");
});

export const saveResumeStepAction = createFormAction(z.object({ fileId: f.optionalUuid() }), async ({ fileId }) => {
  const { session, state } = await requireGatedCandidate();
  if (fileId) await setCandidateResume(selfActor(session), fileId);
  await finishStep(session.user.id, state, "resume", fileId || session.candidate.resumeFileId ? "completed" : "skipped");
});

const visibilityStepSchema = z.object({
  visibility: z.enum(CANDIDATE_VISIBILITY_OPTIONS, { error: "Choose who can find your profile" }),
  isOpenToWork: f.bool(),
});

export const saveVisibilityStepAction = createFormAction(visibilityStepSchema, async (input) => {
  const { session, state } = await requireGatedCandidate();
  await updateVisibility(selfActor(session), input);
  await finishStep(session.user.id, state, "visibility", "completed");
});

export const skipStepAction = createFormAction(z.object({ step: z.enum(ONBOARDING_STEPS) }), async ({ step }) => {
  const { session, state } = await requireGatedCandidate();
  await finishStep(session.user.id, state, step, "skipped");
});
