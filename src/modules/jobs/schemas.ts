/**
 * Zod schemas for job forms, lifecycle actions, search and alerts (client-safe).
 *
 * The job form posts FormData: scalar fields as inputs, and list editors as JSON
 * (`skills:json`, `locations:json`, `screeningQuestions:json`, `benefits:json` or `benefits[]`).
 * Salary amounts are typed in major units ("2500.50") and converted to minor units by the service
 * with the job's currency. Dates are YYYY-MM-DD (deadlines mean "end of that day" in the platform
 * time zone); scheduled publication accepts a datetime-local value.
 */
import { z } from "zod";

import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { sp, spAll, type SearchParams } from "@/lib/http";
import { f } from "@/lib/validation";

import {
  ALERT_CHANNEL_OPTIONS,
  ALERT_FREQUENCY_OPTIONS,
  APPLY_MODE_OPTIONS,
  INFO_SOURCE_OPTIONS,
  JOB_LIMITS,
  JOB_STATUS_OPTIONS,
  MANUAL_CLOSE_REASONS,
  PROMOTION_TYPE_OPTIONS,
  SCREENING_TYPE_OPTIONS,
  VISA_SPONSORSHIP_OPTIONS,
} from "./constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toArray = (v: unknown): unknown[] => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);
const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

function enumArray<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(toArray, z.array(z.enum(values, { error: "Choose a valid option" })).max(values.length)).transform(dedupe);
}

function uuidList(max: number) {
  return z.preprocess(toArray, z.array(z.uuid("Invalid identifier")).max(max, `Choose at most ${max}`)).transform(dedupe);
}

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** YYYY-MM-DD (kept as a string; the service applies the platform time zone). */
export const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").refine(isRealDate, "Enter a valid date");

/** datetime-local ("2026-12-01T09:30") or a full ISO timestamp. */
export const dateTimeInput = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/, "Enter a valid date and time");

/** Tri-state select: "yes" | "no" | "" → true | false | null (null = not stated, never guessed). */
const triState = z.preprocess((v) => (v === "yes" || v === true || v === "true" ? true : v === "no" || v === false || v === "false" ? false : null), z.boolean().nullable());

const jsonBool = (fallback: boolean) => z.preprocess((v) => (v === undefined || v === null || v === "" ? fallback : v === true || v === "true" || v === "on" || v === "1"), z.boolean());

// ---------------------------------------------------------------------------
// Job form
// ---------------------------------------------------------------------------

export const screeningOptionSchema = z.object({
  value: z.string().trim().min(1, "Option value is required").max(60),
  label: z.string().trim().min(1, "Option text is required").max(120),
});

export const knockoutRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("equals"), value: z.union([z.string().max(120), z.number(), z.boolean()]) }),
  z.object({ kind: z.literal("any_of"), values: z.array(z.string().max(60)).min(1).max(JOB_LIMITS.optionsPerQuestion) }),
  z.object({ kind: z.literal("below"), value: z.number() }),
  z.object({ kind: z.literal("above"), value: z.number() }),
]);

export const screeningQuestionSchema = z
  .object({
    id: z.uuid().optional(),
    question: z.string().trim().min(5, "Write the question").max(300, "Keep the question under 300 characters"),
    helpText: z.string().trim().max(500).optional().nullable(),
    type: z.enum(SCREENING_TYPE_OPTIONS, { error: "Choose an answer type" }),
    options: z.array(screeningOptionSchema).max(JOB_LIMITS.optionsPerQuestion).default([]),
    isRequired: jsonBool(true),
    /** Flags an application for human review — never rejects it automatically. */
    knockout: knockoutRuleSchema.nullable().optional(),
  })
  .superRefine((q, ctx) => {
    const isChoice = q.type === "single_choice" || q.type === "multi_choice";
    if (isChoice && q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices" });
    if (!isChoice && q.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Only choice questions have options" });
    const values = q.options.map((o) => o.value);
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Each choice needs a different value" });
    const k = q.knockout;
    if (!k) return;
    const ok =
      (q.type === "yes_no" && k.kind === "equals" && typeof k.value === "boolean") ||
      (q.type === "number" && (k.kind === "below" || k.kind === "above" || (k.kind === "equals" && typeof k.value === "number"))) ||
      (isChoice && k.kind === "any_of" && k.values.every((v) => values.includes(v))) ||
      (q.type === "single_choice" && k.kind === "equals" && typeof k.value === "string" && values.includes(k.value));
    if (!ok) ctx.addIssue({ code: "custom", path: ["knockout"], message: "This review rule does not fit the answer type" });
  });
export type ScreeningQuestionInput = z.output<typeof screeningQuestionSchema>;

export const jobSkillInputSchema = z.object({
  skillId: z.uuid("Choose a skill from the list"),
  isRequired: jsonBool(true),
  minYears: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).max(50).nullable()),
});

export const jobLocationInputSchema = z.object({
  countryCode: f.countryCode(),
  stateRegion: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  openings: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(1).max(100_000).nullable()),
});

const jsonList = <T extends z.ZodType>(item: T, max: number, label: string) =>
  z.preprocess(toArray, z.array(item).max(max, `Add at most ${max} ${label}`));

export const jobFormSchema = z
  .object({
    title: f.text({ min: 3, max: JOB_LIMITS.titleMax, label: "Job title" }),
    summary: f.optionalText(300),
    descriptionHtml: f.longText(20_000),
    responsibilities: f.longText(5000),
    qualificationsText: f.longText(5000),
    jobCategoryId: f.optionalUuid(),
    industryId: f.optionalUuid(),
    employmentType: z.enum(EMPLOYMENT_TYPES, { error: "Choose an employment type" }).default("full_time"),
    workMode: z.enum(WORK_MODES, { error: "Choose a work mode" }).default("on_site"),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    experienceMinYears: f.optionalInt({ min: 0, max: 50 }),
    experienceMaxYears: f.optionalInt({ min: 0, max: 50 }),
    minEducationLevelId: f.optionalUuid(),
    openings: f.optionalInt({ min: 1, max: 100_000 }).transform((v) => v ?? 1),
    salaryMin: f.optionalAmount(),
    salaryMax: f.optionalAmount(),
    salaryCurrency: f.currencyCode().optional(),
    salaryPeriod: z.enum(SALARY_PERIODS).optional(),
    salaryVisible: f.bool(),
    benefits: z
      .preprocess(toArray, z.array(z.string().trim().min(1).max(100, "Keep each benefit under 100 characters")).max(JOB_LIMITS.benefits, `Add at most ${JOB_LIMITS.benefits} benefits`))
      .transform(dedupe),
    countryCode: f.countryCode().optional(),
    stateRegion: f.optionalText(120),
    city: f.optionalText(120),
    locations: jsonList(jobLocationInputSchema, JOB_LIMITS.locations, "locations"),
    visaSponsorship: z.enum(VISA_SPONSORSHIP_OPTIONS).default("not_applicable"),
    sponsorshipDetails: f.optionalText(1000),
    accommodationProvided: triState,
    foodProvided: triState,
    transportProvided: triState,
    contractDurationMonths: f.optionalInt({ min: 1, max: 120 }),
    workingHours: f.optionalText(200),
    recruitmentProcess: f.longText(3000),
    applicationDeadline: dateOnly.optional(),
    /** Listing end date (defaults to the configured listing duration after publication). */
    expiresAt: dateOnly.optional(),
    startDate: dateOnly.optional(),
    applyMode: z.enum(APPLY_MODE_OPTIONS).default("platform"),
    externalApplyUrl: z
      .string()
      .trim()
      .max(500, "Keep the link under 500 characters")
      .pipe(z.url("Enter a valid link"))
      .refine((v) => v.startsWith("https://"), "Use an https:// link")
      .optional(),
    screeningRequired: f.bool(),
    screeningQuestions: jsonList(screeningQuestionSchema, JOB_LIMITS.screeningQuestions, "screening questions"),
    skills: jsonList(jobSkillInputSchema, JOB_LIMITS.skills, "skills"),
    isConfidential: f.bool(),
    confidentialEmployerName: f.optionalText(150),
    employerReference: f.optionalText(80),
    // Staff only (ignored for employers):
    organizationId: f.optionalUuid(),
    managedByVenkatSai: f.bool(),
    requirementId: f.optionalUuid(),
    workflowId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.experienceMinYears !== undefined && v.experienceMaxYears !== undefined && v.experienceMaxYears < v.experienceMinYears) {
      ctx.addIssue({ code: "custom", path: ["experienceMaxYears"], message: "Maximum experience must be at least the minimum" });
    }
    const hasSalary = v.salaryMin !== undefined || v.salaryMax !== undefined;
    if (hasSalary && !v.salaryCurrency) ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Choose the salary currency" });
    if (hasSalary && !v.salaryPeriod) ctx.addIssue({ code: "custom", path: ["salaryPeriod"], message: "Choose the pay period" });
    if (v.salaryMin !== undefined && v.salaryMax !== undefined && v.salaryMax < v.salaryMin) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "Maximum salary must be at least the minimum" });
    }
    for (const key of ["salaryMin", "salaryMax"] as const) {
      if ((v[key] ?? 0) > 1_000_000_000) ctx.addIssue({ code: "custom", path: [key], message: "Enter a realistic amount" });
    }
    if (v.workMode !== "remote" && !v.countryCode) ctx.addIssue({ code: "custom", path: ["countryCode"], message: "Choose the country where the work is" });
    if (v.applyMode === "external_url" && !v.externalApplyUrl) ctx.addIssue({ code: "custom", path: ["externalApplyUrl"], message: "Add the application link" });
    if (v.isConfidential && !v.confidentialEmployerName) {
      ctx.addIssue({ code: "custom", path: ["confidentialEmployerName"], message: "Describe the employer without naming it (e.g. \"EPC contractor, Qatar\")" });
    }
    if (v.visaSponsorship !== "provided" && v.sponsorshipDetails) {
      ctx.addIssue({ code: "custom", path: ["sponsorshipDetails"], message: "Only needed when a visa is provided" });
    }
    if (v.applicationDeadline && v.expiresAt && v.expiresAt < v.applicationDeadline) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "The listing cannot end before the application deadline" });
    }
    const skillIds = v.skills.map((s) => s.skillId);
    if (new Set(skillIds).size !== skillIds.length) ctx.addIssue({ code: "custom", path: ["skills"], message: "Each skill can be added once" });
    const places = v.locations.map((l) => `${l.countryCode}|${(l.stateRegion ?? "").toLowerCase()}|${(l.city ?? "").toLowerCase()}`);
    if (new Set(places).size !== places.length) ctx.addIssue({ code: "custom", path: ["locations"], message: "Each location can be added once" });
    if (v.screeningRequired && !v.screeningQuestions.length) ctx.addIssue({ code: "custom", path: ["screeningQuestions"], message: "Add at least one screening question" });
  });
export type JobFormInput = z.output<typeof jobFormSchema>;
/** Loose input shape (form values before parsing) — every key optional. */
export type JobFormValues = Partial<z.input<typeof jobFormSchema>>;

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

export const jobIdSchema = z.object({ id: z.uuid("Invalid job") });

export const submitJobSchema = z.object({
  id: z.uuid(),
  /** Go live at this time once approved (optional). */
  scheduledPublishAt: dateTimeInput.optional(),
});

export const publishJobSchema = z.object({
  id: z.uuid(),
  scheduledPublishAt: dateTimeInput.optional(),
  /** Staff confirm they checked the information (badge "Verified by Venkat Sai"). */
  infoVerified: f.bool(),
});

export const closeJobSchema = z.object({
  id: z.uuid(),
  reason: z.enum(MANUAL_CLOSE_REASONS, { error: "Choose why you are closing the job" }),
});

export const extendJobSchema = z
  .object({
    id: z.uuid(),
    applicationDeadline: dateOnly.optional(),
    expiresAt: dateOnly.optional(),
  })
  .refine((v) => v.applicationDeadline || v.expiresAt, { message: "Choose a new deadline or listing end date", path: ["applicationDeadline"] });

export const rescheduleJobSchema = z.object({ id: z.uuid(), scheduledPublishAt: dateTimeInput });

export const promoteJobSchema = z.object({ id: z.uuid(), days: f.int({ min: 1, max: JOB_LIMITS.maxPromotionDays }) });

export const featureJobSchema = z.object({
  id: z.uuid(),
  type: z.enum(PROMOTION_TYPE_OPTIONS).default("featured"),
  until: dateOnly,
});

export const unfeatureJobSchema = z.object({ id: z.uuid(), type: z.enum(PROMOTION_TYPE_OPTIONS).optional() });

export const infoSourceSchema = z.object({ id: z.uuid(), infoSource: z.enum(INFO_SOURCE_OPTIONS) });

/** Recruiting-agent details on an overseas job: a partner's verified licence, or details staff checked themselves. */
export const recruitingAgentSchema = z
  .object({
    id: z.uuid(),
    mode: z.enum(["licence", "manual", "clear"]),
    licenceId: f.optionalUuid(),
    name: f.optionalText(200),
    certificateNumber: f.optionalText(80),
    validUntil: dateOnly.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "licence" && !v.licenceId) ctx.addIssue({ code: "custom", path: ["licenceId"], message: "Choose the partner licence" });
    if (v.mode === "manual") {
      if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "Enter the agent's name as on the certificate" });
      if (!v.certificateNumber) ctx.addIssue({ code: "custom", path: ["certificateNumber"], message: "Enter the certificate number" });
    }
  });
export type RecruitingAgentInput = z.output<typeof recruitingAgentSchema>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const JOB_SORTS = ["relevance", "newest", "closing", "salary"] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export const jobSearchFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    categoryIds: uuidList(20),
    industryIds: uuidList(20),
    /** Free text matched against city / state of the job and its extra locations. */
    location: z.string().trim().max(120).optional(),
    countryCodes: z.preprocess(toArray, z.array(f.countryCode()).max(30)).transform(dedupe),
    overseas: f.bool(),
    /** The searcher's years of experience: jobs whose range includes it (or that state none). */
    experienceYears: f.optionalInt({ min: 0, max: 60 }),
    experienceLevels: enumArray(EXPERIENCE_LEVELS),
    salaryMin: f.optionalAmount(),
    salaryMax: f.optionalAmount(),
    salaryCurrency: f.currencyCode().optional(),
    salaryPeriod: z.enum(SALARY_PERIODS).optional(),
    /** Highest qualification the searcher holds: jobs requiring at most this level (or none). */
    educationLevelId: f.optionalUuid(),
    employmentTypes: enumArray(EMPLOYMENT_TYPES),
    workModes: enumArray(WORK_MODES),
    verifiedOnly: f.bool(),
    postedWithinDays: f.optionalInt({ min: 1, max: 365 }),
    closingWithinDays: f.optionalInt({ min: 1, max: 90 }),
    featuredOnly: f.bool(),
    skillIds: uuidList(20),
    // Employer / admin audiences only:
    statuses: enumArray(JOB_STATUS_OPTIONS),
    organizationId: f.optionalUuid(),
    managedOnly: f.bool(),
    infoSource: z.enum(INFO_SOURCE_OPTIONS).optional(),
    includeDeleted: f.bool(),
    sort: z.enum(JOB_SORTS).default("relevance"),
    page: f.optionalInt({ min: 1, max: 10_000 }).transform((v) => v ?? 1),
    pageSize: f.optionalInt({ min: 1, max: 50 }).transform((v) => v ?? 20),
  })
  .superRefine((v, ctx) => {
    if ((v.salaryMin !== undefined || v.salaryMax !== undefined) && (!v.salaryCurrency || !v.salaryPeriod)) {
      ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Choose a currency and pay period to filter by salary" });
    }
    if (v.salaryMin !== undefined && v.salaryMax !== undefined && v.salaryMax < v.salaryMin) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "Maximum must be at least the minimum" });
    }
  });
export type JobSearchFilters = z.output<typeof jobSearchFiltersSchema>;
export type JobSearchFiltersInput = Partial<z.input<typeof jobSearchFiltersSchema>>;

const JOB_ARRAY_PARAMS = ["categoryIds", "industryIds", "countryCodes", "experienceLevels", "employmentTypes", "workModes", "statuses", "skillIds"] as const;

/** Short public URL aliases (/jobs?type=internship&overseas=1&country=AE&category=…). */
const PARAM_ALIASES: Record<string, string> = { type: "employmentTypes", mode: "workModes", country: "countryCodes", category: "categoryIds", industry: "industryIds" };

/**
 * URL search params → validated job filters. Unknown or invalid values are dropped (a bad link never
 * errors the page). Accepts repeated or comma-separated values and the short aliases above.
 */
export function parseJobSearchParams(params: SearchParams | undefined): JobSearchFilters {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(jobSearchFiltersSchema.shape)) {
    raw[key] = (JOB_ARRAY_PARAMS as readonly string[]).includes(key) ? spAll(params, key) : sp(params, key);
  }
  for (const [alias, key] of Object.entries(PARAM_ALIASES)) {
    const values = spAll(params, alias);
    if (values.length) raw[key] = [...(raw[key] as string[]), ...values];
  }
  // Drop offending keys (and the values that depend on them) until the rest parses.
  const dependents: Record<string, string[]> = { salaryCurrency: ["salaryMin", "salaryMax"], salaryPeriod: ["salaryMin", "salaryMax"] };
  for (let attempt = 0; attempt < 5; attempt++) {
    const parsed = jobSearchFiltersSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key !== "string") continue;
      delete raw[key];
      for (const dependent of dependents[key] ?? []) delete raw[dependent];
    }
  }
  return jobSearchFiltersSchema.parse({});
}

// ---------------------------------------------------------------------------
// Saved jobs and alerts
// ---------------------------------------------------------------------------

export const savedJobSchema = z.object({ jobId: z.uuid() });

export const jobAlertCriteriaSchema = z.object({
  keywords: z.string().trim().max(200).optional(),
  categoryIds: uuidList(10),
  countries: z.preprocess(toArray, z.array(f.countryCode()).max(20)).transform(dedupe),
  employmentTypes: enumArray(EMPLOYMENT_TYPES),
  workModes: enumArray(WORK_MODES),
  overseasOnly: f.bool(),
  salaryMin: f.optionalAmount(),
  salaryCurrency: f.currencyCode().optional(),
  salaryPeriod: z.enum(SALARY_PERIODS).optional(),
});

export const jobAlertSchema = jobAlertCriteriaSchema
  .extend({
    id: f.optionalUuid(),
    name: f.text({ max: 80, label: "Alert name" }),
    frequency: z.enum(ALERT_FREQUENCY_OPTIONS).default("weekly"),
    channels: z
      .preprocess(toArray, z.array(z.enum(ALERT_CHANNEL_OPTIONS)).max(ALERT_CHANNEL_OPTIONS.length))
      .transform(dedupe)
      .refine((c) => c.length > 0, "Choose at least one way to receive alerts"),
    isActive: jsonBool(true),
  })
  .superRefine((v, ctx) => {
    if (v.salaryMin !== undefined && (!v.salaryCurrency || !v.salaryPeriod)) {
      ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Choose a currency and pay period" });
    }
  });
export type JobAlertInput = z.output<typeof jobAlertSchema>;

export const jobAlertToggleSchema = z.object({ id: z.uuid(), isActive: f.bool() });
