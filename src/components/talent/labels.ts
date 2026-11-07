/**
 * Enum → translated option helpers for People Portal forms (client-safe). Keys live in the
 * talent-profile namespace as `enum.<group>.<value>`.
 */
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import {
  CANDIDATE_AVAILABILITY_OPTIONS,
  CANDIDATE_VISIBILITY_OPTIONS,
  CREDENTIAL_TYPE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  EMIGRATION_CHECK_OPTIONS,
  CANDIDATE_GENDER_OPTIONS,
  LANGUAGE_PROFICIENCY_OPTIONS,
  PASSPORT_STATUS_OPTIONS,
  SKILL_LEVEL_OPTIONS,
} from "@/modules/candidates/constants";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export const ENUM_GROUPS = {
  experienceLevel: EXPERIENCE_LEVELS,
  employmentType: EMPLOYMENT_TYPES,
  workMode: WORK_MODES,
  salaryPeriod: SALARY_PERIODS,
  availability: CANDIDATE_AVAILABILITY_OPTIONS,
  visibility: CANDIDATE_VISIBILITY_OPTIONS,
  passportStatus: PASSPORT_STATUS_OPTIONS,
  emigration: EMIGRATION_CHECK_OPTIONS,
  gender: CANDIDATE_GENDER_OPTIONS,
  skillLevel: SKILL_LEVEL_OPTIONS,
  proficiency: LANGUAGE_PROFICIENCY_OPTIONS,
  documentType: DOCUMENT_TYPE_OPTIONS,
  credentialType: CREDENTIAL_TYPE_OPTIONS,
} as const;

export type EnumGroup = keyof typeof ENUM_GROUPS;

export function enumLabel(t: Translate, group: EnumGroup, value: string | null | undefined): string {
  if (!value) return "";
  return t(`enum.${group}.${value}`);
}

export function enumOptions(t: Translate, group: EnumGroup, exclude: readonly string[] = []): { value: string; label: string }[] {
  return (ENUM_GROUPS[group] as readonly string[]).filter((v) => !exclude.includes(v)).map((value) => ({ value, label: t(`enum.${group}.${value}`) }));
}

/** Intl locale for dates and numbers in the People Portal. */
export function intlLocaleOf(locale: string | null | undefined): string {
  if (locale === "hi") return "hi-IN";
  if (locale === "te") return "te-IN";
  return "en-IN";
}
