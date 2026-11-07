/**
 * English labels for job enumerations used across the Employer Portal (client-safe).
 * Business portals are English-only.
 */
import type { EmploymentType, ExperienceLevel, SalaryPeriod, WorkMode } from "@/db/schema/_constants";
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { MANUAL_CLOSE_REASONS, SCREENING_TYPE_OPTIONS, VISA_SPONSORSHIP_OPTIONS } from "@/modules/jobs/constants";

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
  apprenticeship: "Apprenticeship",
  freelance: "Freelance",
  gig: "Gig / shift work",
  project_based: "Project based",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = { on_site: "On site", remote: "Remote", hybrid: "Hybrid" };

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  fresher: "Fresher",
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead / supervisor",
  executive: "Executive",
};

export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> = {
  hour: "Per hour",
  day: "Per day",
  week: "Per week",
  month: "Per month",
  year: "Per year",
  project: "Per project",
};

export const VISA_SPONSORSHIP_LABELS: Record<(typeof VISA_SPONSORSHIP_OPTIONS)[number], string> = {
  provided: "Visa provided by the employer",
  not_provided: "Visa not provided",
  not_applicable: "Not applicable (no visa needed)",
};

export const SCREENING_TYPE_LABELS: Record<(typeof SCREENING_TYPE_OPTIONS)[number], string> = {
  text: "Short text answer",
  yes_no: "Yes or no",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  number: "Number",
};

export const CLOSE_REASON_LABELS: Record<(typeof MANUAL_CLOSE_REASONS)[number], string> = {
  filled: "All positions are filled",
  cancelled: "The hiring was cancelled",
  duplicate: "It duplicates another job",
  other: "Another reason",
};

export const JOB_STATUS_TAB_LABELS = {
  draft: "Drafts",
  pending_approval: "In review",
  changes_requested: "Changes requested",
  published: "Published",
  paused: "Paused",
  closed: "Closed",
  rejected: "Rejected",
  archived: "Archived",
} as const;

const options = <K extends string>(values: readonly K[], labels: Record<K, string>) => values.map((value) => ({ value, label: labels[value] }));

export const employmentTypeOptions = options(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS);
export const workModeOptions = options(WORK_MODES, WORK_MODE_LABELS);
export const experienceLevelOptions = options(EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_LABELS);
export const salaryPeriodOptions = options(SALARY_PERIODS, SALARY_PERIOD_LABELS);
export const visaOptions = options(VISA_SPONSORSHIP_OPTIONS, VISA_SPONSORSHIP_LABELS);
export const screeningTypeOptions = options(SCREENING_TYPE_OPTIONS, SCREENING_TYPE_LABELS);
export const closeReasonOptions = options(MANUAL_CLOSE_REASONS, CLOSE_REASON_LABELS);

/** Tri-state select values for "provided?" questions — blank means "not stated" (never guessed). */
export const triStateOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function triStateValue(value: boolean | null | undefined): string {
  return value === true ? "yes" : value === false ? "no" : "";
}
