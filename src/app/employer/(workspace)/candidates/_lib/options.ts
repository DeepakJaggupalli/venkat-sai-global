import "server-only";

import type { CandidateFilterOptions, CandidateFilterValues } from "@/components/employer-talent/candidate-filters";
import { AVAILABILITY_LABELS, LANGUAGE_PROFICIENCY_LABELS, VERIFICATION_LEVEL_LABELS } from "@/components/employer-talent/labels";
import { EMPLOYMENT_TYPE_LABELS, SALARY_PERIOD_LABELS, WORK_MODE_LABELS } from "@/components/employer/labels";
import { EMPLOYMENT_TYPES, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { CANDIDATE_AVAILABILITY_OPTIONS, CANDIDATE_VERIFICATION_LEVEL_OPTIONS, LANGUAGE_PROFICIENCY_OPTIONS } from "@/modules/candidates/constants";
import type { CandidateSearchFilters } from "@/modules/candidates/schemas";
import { countryOptions, currencyOptions, getSkillsByIds, listEducationLevels, listLanguages } from "@/modules/taxonomy/queries";

/** Options for the advanced search form; every list comes from reference data or schema enums. */
export async function loadCandidateFilterOptions(): Promise<CandidateFilterOptions> {
  const [countries, currencies, languages, educationLevels] = await Promise.all([countryOptions(), currencyOptions(), listLanguages(), listEducationLevels()]);
  return {
    countries,
    currencies,
    languages: languages.map((l) => ({ value: l.code, label: l.name })),
    educationLevels: educationLevels.map((e) => ({ value: e.id, label: e.name })),
    availability: CANDIDATE_AVAILABILITY_OPTIONS.filter((a) => a !== "not_looking").map((a) => ({ value: a, label: AVAILABILITY_LABELS[a] ?? a })),
    employmentTypes: EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] })),
    workModes: WORK_MODES.map((m) => ({ value: m, label: WORK_MODE_LABELS[m] })),
    salaryPeriods: SALARY_PERIODS.map((p) => ({ value: p, label: SALARY_PERIOD_LABELS[p] })),
    verificationLevels: CANDIDATE_VERIFICATION_LEVEL_OPTIONS.filter((l) => l !== "none").map((l) => ({ value: l, label: `At least: ${VERIFICATION_LEVEL_LABELS[l]}` })),
    proficiencies: LANGUAGE_PROFICIENCY_OPTIONS.map((p) => ({ value: p, label: LANGUAGE_PROFICIENCY_LABELS[p] ?? p })),
  };
}

/** Current (validated) filters → initial values of the form. */
export async function filterValuesFrom(filters: CandidateSearchFilters): Promise<CandidateFilterValues> {
  const skills = filters.skillIds.length ? await getSkillsByIds(filters.skillIds) : [];
  return {
    q: filters.q,
    skills: skills.map((s) => ({ value: s.id, label: s.name })),
    skillMatch: filters.skillMatch,
    verifiedSkillsOnly: Boolean(filters.verifiedSkillsOnly),
    experienceMinYears: filters.experienceMinYears,
    experienceMaxYears: filters.experienceMaxYears,
    countryCode: filters.countryCode,
    stateRegion: filters.stateRegion,
    city: filters.city,
    preferredCountryCode: filters.preferredCountryCode,
    availability: [...filters.availability],
    languageCodes: [...filters.languageCodes],
    minLanguageProficiency: filters.minLanguageProficiency,
    educationLevelId: filters.educationLevelId,
    verifiedCredentialsOnly: Boolean(filters.verifiedCredentialsOnly),
    assessedOnly: Boolean(filters.assessedOnly),
    employmentTypes: [...filters.employmentTypes],
    workModes: [...filters.workModes],
    openToOverseas: Boolean(filters.openToOverseas),
    passportValid: Boolean(filters.passportValid),
    salaryMax: filters.salaryMax,
    salaryCurrency: filters.salaryCurrency,
    salaryPeriod: filters.salaryPeriod,
    minVerificationLevel: filters.minVerificationLevel,
    activeWithinDays: filters.activeWithinDays,
    forOverseasRole: Boolean(filters.forOverseasRole),
    sort: filters.sort,
  };
}
