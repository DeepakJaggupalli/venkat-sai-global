/** Pure helpers for the requirement trade-line editor (client-safe). Lines post as `lines:json`. */
export type RequirementLineDraft = {
  key: string;
  id?: string;
  jobCategoryId: string;
  roleTitle: string;
  positions: string;
  experienceMinYears: string;
  experienceMaxYears: string;
  qualification: string;
  requiredSkills: string[];
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  notes: string;
};

let seq = 0;
export const emptyLine = (currency = ""): RequirementLineDraft => ({
  key: `line${Date.now().toString(36)}${(seq++).toString(36)}`,
  jobCategoryId: "",
  roleTitle: "",
  positions: "1",
  experienceMinYears: "",
  experienceMaxYears: "",
  qualification: "",
  requiredSkills: [],
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: currency,
  salaryPeriod: "",
  notes: "",
});

const blankToUndefined = (v: string) => (v.trim() === "" ? undefined : v.trim());

/** Serialise lines for `lines:json` (blank strings become undefined so optional fields validate). */
export function serializeLines(lines: readonly RequirementLineDraft[]) {
  return lines.map((l) => ({
    ...(l.id ? { id: l.id } : {}),
    jobCategoryId: blankToUndefined(l.jobCategoryId),
    roleTitle: l.roleTitle.trim(),
    positions: l.positions.trim() === "" ? undefined : l.positions.trim(),
    experienceMinYears: blankToUndefined(l.experienceMinYears),
    experienceMaxYears: blankToUndefined(l.experienceMaxYears),
    qualification: blankToUndefined(l.qualification),
    requiredSkills: l.requiredSkills,
    salaryMin: blankToUndefined(l.salaryMin),
    salaryMax: blankToUndefined(l.salaryMax),
    salaryCurrency: blankToUndefined(l.salaryCurrency),
    salaryPeriod: blankToUndefined(l.salaryPeriod),
    notes: blankToUndefined(l.notes),
  }));
}
