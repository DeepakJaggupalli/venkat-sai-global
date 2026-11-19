import type { AdminFieldSpec } from "@/components/admin/action-form";
import type { SelectOption } from "@/components/shared/types";
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { humanize } from "@/lib/format";
import { APPLY_MODE_OPTIONS, VISA_SPONSORSHIP_OPTIONS } from "@/modules/jobs/constants";

/**
 * Field specs of the Command Centre job form, shared by /admin/jobs/new and /admin/jobs/[id]/edit so
 * both post the complete `jobFormSchema` (the module replaces the job's scalar fields from the form;
 * skills, locations and screening questions are posted by the list editors next to these fields).
 */

/** Loose defaults (jobFormDefaults() of the employer form fits); only scalar values and `benefits` are read. */
export type StaffJobFieldDefaults = { benefits?: string[] } & Record<string, unknown>;

export type StaffJobFieldOptions = {
  employers: SelectOption[];
  countries: SelectOption[];
  currencies: SelectOption[];
  industries: SelectOption[];
  categories: SelectOption[];
  educationLevels: SelectOption[];
};

const o = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const triOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const applyModeOptions: SelectOption[] = [
  { value: "platform", label: "Apply on Venkat Sai Global" },
  { value: "external_url", label: "Apply on the employer's own website" },
];

function scalar(v: unknown): string | number | boolean | null {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
}

/**
 * `mode: "edit"` leaves the employer out (the module keeps a job's organisation fixed after creation) and
 * shows the listing-end hint for published jobs.
 */
export function staffJobFields(defaults: StaffJobFieldDefaults, options: StaffJobFieldOptions, mode: "create" | "edit", opts: { published?: boolean } = {}): AdminFieldSpec[] {
  const d = (name: string) => scalar(defaults[name]);
  return [
    { name: "title", label: "Job title", required: true, defaultValue: d("title"), wide: true },
    { name: "summary", label: "Summary", optional: true, hint: "One or two lines shown on job cards", defaultValue: d("summary"), wide: true },
    { name: "descriptionHtml", label: "Description", kind: "richtext", optional: true, defaultValue: d("descriptionHtml") },
    { name: "responsibilities", label: "Responsibilities", kind: "textarea", optional: true, rows: 4, defaultValue: d("responsibilities") },
    { name: "qualificationsText", label: "Qualifications and certifications", kind: "textarea", optional: true, rows: 3, defaultValue: d("qualificationsText") },
    ...(mode === "create"
      ? [
          {
            name: "organizationId",
            label: "Employer",
            kind: "search-select",
            options: options.employers,
            optional: true,
            allowClear: true,
            defaultValue: d("organizationId"),
            hint: "Leave empty for a Venkat Sai-managed job for an unregistered or confidential client",
          } satisfies AdminFieldSpec,
        ]
      : []),
    { name: "employerReference", label: "Internal reference", optional: true, defaultValue: d("employerReference") },
    { name: "isConfidential", label: "Confidential client: candidates never see the employer's name, logo or page", kind: "checkbox", defaultValue: d("isConfidential") === true, wide: true },
    {
      name: "confidentialEmployerName",
      label: "Employer description shown to candidates",
      optional: true,
      hint: "For example “EPC contractor, Qatar”. Required for confidential jobs and when no employer is chosen.",
      defaultValue: d("confidentialEmployerName"),
      wide: true,
    },
    { name: "managedByVenkatSai", label: "Venkat Sai manages this hiring (applications come to our team)", kind: "checkbox", defaultValue: d("managedByVenkatSai") === true, wide: true },
    { name: "jobCategoryId", label: "Category", kind: "search-select", options: options.categories, optional: true, allowClear: true, defaultValue: d("jobCategoryId") },
    { name: "industryId", label: "Industry", kind: "search-select", options: options.industries, optional: true, allowClear: true, defaultValue: d("industryId") },
    { name: "employmentType", label: "Employment type", kind: "select", options: o(EMPLOYMENT_TYPES), defaultValue: d("employmentType") ?? "full_time" },
    { name: "workMode", label: "Work mode", kind: "select", options: o(WORK_MODES), defaultValue: d("workMode") ?? "on_site" },
    { name: "experienceLevel", label: "Experience level", kind: "select", options: o(EXPERIENCE_LEVELS), optional: true, allowClear: true, defaultValue: d("experienceLevel") },
    { name: "minEducationLevelId", label: "Minimum education", kind: "select", options: options.educationLevels, optional: true, allowClear: true, defaultValue: d("minEducationLevelId") },
    { name: "openings", label: "Openings", kind: "number", min: 1, defaultValue: d("openings") ?? 1 },
    { name: "experienceMinYears", label: "Minimum experience (years)", kind: "number", optional: true, min: 0, max: 50, defaultValue: d("experienceMinYears") },
    { name: "experienceMaxYears", label: "Maximum experience (years)", kind: "number", optional: true, min: 0, max: 50, defaultValue: d("experienceMaxYears") },
    { name: "countryCode", label: "Country", kind: "search-select", options: options.countries, optional: true, allowClear: true, defaultValue: d("countryCode"), hint: "Required unless the job is remote" },
    { name: "stateRegion", label: "State or region", optional: true, defaultValue: d("stateRegion") },
    { name: "city", label: "City", optional: true, defaultValue: d("city") },
    { name: "salaryMin", label: "Salary from", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: d("salaryMin") },
    { name: "salaryMax", label: "Salary to", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: d("salaryMax") },
    { name: "salaryCurrency", label: "Salary currency", kind: "search-select", options: options.currencies, optional: true, allowClear: true, defaultValue: d("salaryCurrency") },
    { name: "salaryPeriod", label: "Pay period", kind: "select", options: o(SALARY_PERIODS), optional: true, allowClear: true, defaultValue: d("salaryPeriod") },
    { name: "salaryVisible", label: "Show the salary to candidates", kind: "checkbox", defaultValue: d("salaryVisible") !== false, wide: true },
    { name: "benefits", label: "Benefits", kind: "tags", optional: true, max: 20, defaultValues: defaults.benefits ?? [], hint: "Only what the employer provides, for example Air ticket, Medical insurance. Press Enter after each.", placeholder: "Add a benefit", wide: true },
    { name: "visaSponsorship", label: "Visa", kind: "select", options: o(VISA_SPONSORSHIP_OPTIONS), defaultValue: d("visaSponsorship") ?? "not_applicable" },
    { name: "sponsorshipDetails", label: "Sponsorship details", optional: true, hint: "Only when a visa is provided: visa type, who pays and what is covered.", defaultValue: d("sponsorshipDetails") },
    { name: "contractDurationMonths", label: "Contract length (months)", kind: "number", optional: true, min: 1, max: 120, defaultValue: d("contractDurationMonths") },
    { name: "accommodationProvided", label: "Accommodation provided", kind: "select", options: triOptions, optional: true, allowClear: true, defaultValue: d("accommodationProvided") || null },
    { name: "foodProvided", label: "Food provided", kind: "select", options: triOptions, optional: true, allowClear: true, defaultValue: d("foodProvided") || null },
    { name: "transportProvided", label: "Transport provided", kind: "select", options: triOptions, optional: true, allowClear: true, defaultValue: d("transportProvided") || null },
    { name: "workingHours", label: "Working hours", optional: true, defaultValue: d("workingHours") },
    { name: "applicationDeadline", label: "Application deadline", kind: "date", optional: true, defaultValue: d("applicationDeadline") },
    {
      name: "expiresAt",
      label: "Listing end date",
      kind: "date",
      optional: true,
      defaultValue: d("expiresAt"),
      hint: opts.published ? "Leave empty to keep the current end date (change it with Extend on the job page)" : "Defaults to the standard listing length after publication",
    },
    { name: "startDate", label: "Expected start date", kind: "date", optional: true, defaultValue: d("startDate") },
    { name: "applyMode", label: "Application method", kind: "select", options: applyModeOptions.filter((a) => (APPLY_MODE_OPTIONS as readonly string[]).includes(a.value)), defaultValue: d("applyMode") ?? "platform" },
    { name: "externalApplyUrl", label: "External application link", optional: true, hint: "An https:// link, only for jobs applied for on the employer's website", defaultValue: d("externalApplyUrl") },
    { name: "recruitmentProcess", label: "Selection process", kind: "textarea", optional: true, defaultValue: d("recruitmentProcess") },
  ];
}
