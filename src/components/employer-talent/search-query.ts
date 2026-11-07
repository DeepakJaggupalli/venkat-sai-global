/**
 * Turns the advanced candidate-search form into a query string (client-safe, pure). Multi-value
 * controls post `name[]`; the search parser expects repeated `name` keys. Empty values and the page
 * number are dropped so a new search starts on page 1.
 */
export function buildCandidateSearchQuery(form: FormData): string {
  const params = new URLSearchParams();
  for (const [rawKey, rawValue] of form.entries()) {
    if (typeof rawValue !== "string") continue;
    const key = rawKey.endsWith("[]") ? rawKey.slice(0, -2) : rawKey;
    const value = rawValue.trim();
    if (!value || key === "page" || key.startsWith("$")) continue;
    params.append(key, value);
  }
  return params.toString();
}

/** Keys the advanced search form controls (used for "Reset" and active-filter counts). */
export const CANDIDATE_FILTER_KEYS = [
  "q",
  "skillIds",
  "skillMatch",
  "verifiedSkillsOnly",
  "experienceMinYears",
  "experienceMaxYears",
  "countryCode",
  "stateRegion",
  "city",
  "preferredCountryCode",
  "availability",
  "languageCodes",
  "minLanguageProficiency",
  "educationLevelId",
  "verifiedCredentialsOnly",
  "assessedOnly",
  "employmentTypes",
  "workModes",
  "openToOverseas",
  "passportValid",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "minVerificationLevel",
  "activeWithinDays",
  "forOverseasRole",
] as const;

export function countActiveCandidateFilters(params: Record<string, string | string[] | undefined>): number {
  let n = 0;
  for (const key of CANDIDATE_FILTER_KEYS) {
    if (key === "q" || key === "skillMatch") continue;
    const v = params[key];
    if (Array.isArray(v) ? v.some(Boolean) : Boolean(v)) n += 1;
  }
  return n;
}
