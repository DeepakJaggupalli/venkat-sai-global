import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { fromMinorUnits } from "@/lib/format";
import { getCandidateByUserId } from "@/modules/candidates/guard";
import type { PersonalInput, PreferencesInput, ProfessionalInput } from "@/modules/candidates/schemas";
import type { CandidateProfileRow } from "@/modules/candidates/types";
import { getConsentState } from "@/modules/identity/consent";

import { parseOnboardingState, resolveAgeGate, type AgeGate, type OnboardingState } from "@/components/talent/onboarding/steps";

/**
 * Server helpers for the People Portal onboarding (route-private, server-only):
 *  - the age gate (date of birth on the candidate profile + the latest guardian_consent record),
 *  - onboarding progress in users.preferences.talentOnboarding (no dedicated column exists),
 *  - full section inputs built from the stored profile, because the candidates module's section
 *    saves REPLACE the whole section (an omitted optional field would be cleared).
 */

export const ONBOARDING_PATH = "/talent/onboarding";
const PREFERENCES_KEY = "talentOnboarding";

/** Is the latest guardian_consent record for this user granted? */
export async function isGuardianConsentGranted(userId: string): Promise<boolean> {
  const state = await getConsentState(userId, ["guardian_consent"]);
  return state.guardian_consent?.granted === true;
}

/** Age gate for a signed-in user. Never creates a candidate profile (safe in the layout). */
export async function getAgeGateForUser(userId: string): Promise<AgeGate> {
  const candidate = await getCandidateByUserId(userId);
  if (!candidate?.dateOfBirth) return { state: "needs_dob" };
  return resolveAgeGate(candidate.dateOfBirth, await isGuardianConsentGranted(userId));
}

/** Age gate for a loaded candidate profile. */
export async function getAgeGateForCandidate(candidate: CandidateProfileRow): Promise<AgeGate> {
  if (!candidate.dateOfBirth) return { state: "needs_dob" };
  return resolveAgeGate(candidate.dateOfBirth, await isGuardianConsentGranted(candidate.userId));
}

/** Path + query → is it the onboarding flow (exempt from the layout redirect)? */
export function isOnboardingPath(pathWithQuery: string): boolean {
  const path = pathWithQuery.split("?")[0] ?? "";
  return path === ONBOARDING_PATH || path.startsWith(`${ONBOARDING_PATH}/`);
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  return parseOnboardingState((row?.preferences as Record<string, unknown> | undefined)?.[PREFERENCES_KEY]);
}

/** Replace the onboarding progress, leaving every other preference key untouched. */
export async function saveOnboardingState(userId: string, state: OnboardingState): Promise<void> {
  const value = JSON.stringify({ [PREFERENCES_KEY]: state });
  await db
    .update(users)
    .set({ preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || ${value}::jsonb` })
    .where(eq(users.id, userId));
}

const orUndefined = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);

/** The stored personal section as a full save input (write-only passport number kept by leaving it blank). */
export function personalInputFrom(profile: CandidateProfileRow): PersonalInput {
  return {
    legalName: orUndefined(profile.legalName),
    dateOfBirth: orUndefined(profile.dateOfBirth),
    gender: orUndefined(profile.gender),
    genderSelfDescription: profile.gender === "self_described" ? orUndefined(profile.genderSelfDescription) : undefined,
    nationalityCode: orUndefined(profile.nationalityCode),
    currentCountryCode: orUndefined(profile.currentCountryCode),
    stateRegion: orUndefined(profile.stateRegion),
    city: orUndefined(profile.city),
    passportStatus: orUndefined(profile.passportStatus),
    passportNumber: undefined,
    clearPassportNumber: false,
    passportExpiry: orUndefined(profile.passportExpiry),
    emigrationCheckStatus: orUndefined(profile.emigrationCheckStatus),
  };
}

export function professionalInputFrom(profile: CandidateProfileRow): ProfessionalInput {
  const months = profile.totalExperienceMonths;
  return {
    headline: orUndefined(profile.headline),
    about: orUndefined(profile.about),
    careerObjective: orUndefined(profile.careerObjective),
    experienceLevel: orUndefined(profile.experienceLevel),
    experienceYears: months === null ? undefined : Math.floor(months / 12),
    experienceExtraMonths: months === null ? undefined : months % 12,
    currentJobTitle: orUndefined(profile.currentJobTitle),
    currentEmployerName: orUndefined(profile.currentEmployerName),
    industryId: orUndefined(profile.industryId),
    noticePeriodDays: orUndefined(profile.noticePeriodDays),
  };
}

export function preferencesInputFrom(profile: CandidateProfileRow): PreferencesInput {
  const hasSalary = profile.expectedSalaryMinor !== null && profile.expectedSalaryCurrency !== null && profile.expectedSalaryPeriod !== null;
  return {
    preferredCategoryIds: [...profile.preferredCategoryIds],
    preferredRoles: [...profile.preferredRoles],
    desiredEmploymentTypes: [...profile.desiredEmploymentTypes],
    preferredWorkModes: [...profile.preferredWorkModes],
    availability: orUndefined(profile.availability),
    availableFrom: orUndefined(profile.availableFrom),
    expectedSalaryAmount: hasSalary ? fromMinorUnits(Number(profile.expectedSalaryMinor), profile.expectedSalaryCurrency!) : undefined,
    expectedSalaryCurrency: hasSalary ? profile.expectedSalaryCurrency! : undefined,
    expectedSalaryPeriod: hasSalary ? profile.expectedSalaryPeriod! : undefined,
    willingToRelocate: profile.willingToRelocate,
    openToOverseas: profile.openToOverseas,
  };
}
