/**
 * Job postings plus candidate-side job tools (saved jobs, job alerts) and featured / boosted promotions.
 * Layer 10 — may import: taxonomy, core, identity, organizations, system, employers, partners,
 * candidates, operations. Never import from a later layer (see docs/DATA_MODEL.md → Layering).
 *
 * Fairness: by design there are no age, gender, religion, caste or marital-status requirement
 * columns — such criteria must never be filterable or rankable. Lawful destination-country
 * eligibility rules belong in `qualificationsText`, reviewed by staff at approval.
 * Truthfulness (spec 8.4): `infoSource` distinguishes Venkat Sai-verified information from
 * employer-supplied details, and `verifiedEmployer` is a snapshot taken at publication.
 * Candidates never pay to view or apply: nothing here gates applying behind payment.
 */
import { type SQL, sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  SALARY_PERIODS,
  WORK_MODES,
  type EmploymentType,
  type SalaryPeriod,
  type WorkMode,
} from "./_constants";
import {
  countryCode,
  createdAtOnly,
  currencyCode,
  emptyJsonArray,
  emptyJsonObject,
  moneyMinor,
  pk,
  timestamps,
  tstz,
  tsvector,
} from "./_shared";
import { organizations, users } from "./core";
import { requirementRequests } from "./operations";
import { countries, currencies, educationLevels, industries, jobCategories, skills } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Posting lifecycle. Named JOB_POSTING_STATUSES because system.ts already exports JOB_STATUSES
 * (background-job queue states) through the same schema barrel.
 *   draft → pending_approval → published ⇄ paused → closed → archived
 *   pending_approval → changes_requested (back to the poster) | rejected
 */
export const JOB_POSTING_STATUSES = [
  "draft",
  "pending_approval",
  "changes_requested",
  "published",
  "paused",
  "closed",
  "rejected",
  "archived",
] as const;
export type JobPostingStatus = (typeof JOB_POSTING_STATUSES)[number];

export const JOB_VISA_SPONSORSHIP_OPTIONS = ["provided", "not_provided", "not_applicable"] as const;
export type JobVisaSponsorship = (typeof JOB_VISA_SPONSORSHIP_OPTIONS)[number];

export const JOB_APPLY_MODES = ["platform", "external_url"] as const;
export type JobApplyMode = (typeof JOB_APPLY_MODES)[number];

/**
 * Spec 8.4: how far Venkat Sai has checked a posting's information (shown as a badge).
 * `verified` = checked by Venkat Sai staff; `employer_supplied` = published as provided by a
 * verified employer; `pending_review` = not yet reviewed.
 */
export const JOB_INFO_SOURCES = ["verified", "employer_supplied", "pending_review"] as const;
export type JobInfoSource = (typeof JOB_INFO_SOURCES)[number];

export const JOB_CLOSE_REASONS = ["filled", "cancelled", "expired", "duplicate", "other"] as const;
export type JobCloseReason = (typeof JOB_CLOSE_REASONS)[number];

export const SCREENING_QUESTION_TYPES = ["text", "yes_no", "single_choice", "multi_choice", "number"] as const;
export type ScreeningQuestionType = (typeof SCREENING_QUESTION_TYPES)[number];

export const JOB_ALERT_FREQUENCIES = ["daily", "weekly"] as const;
export type JobAlertFrequency = (typeof JOB_ALERT_FREQUENCIES)[number];

/** Channels a job alert may use (WhatsApp/SMS additionally require the matching consent). */
export const JOB_ALERT_CHANNELS = ["email", "in_app", "whatsapp", "sms"] as const;
export type JobAlertChannel = (typeof JOB_ALERT_CHANNELS)[number];

export const JOB_PROMOTION_TYPES = ["featured", "boosted", "homepage"] as const;
export type JobPromotionType = (typeof JOB_PROMOTION_TYPES)[number];

export const JOB_PROMOTION_SOURCES = ["subscription", "purchase", "admin"] as const;
export type JobPromotionSource = (typeof JOB_PROMOTION_SOURCES)[number];

// ---------------------------------------------------------------------------
// JSON shapes
// ---------------------------------------------------------------------------

export type ScreeningQuestionOption = { value: string; label: string };

/** A candidate's answer: text / single_choice → string, number → number, yes_no → boolean, multi_choice → string[]. */
export type ScreeningAnswerValue = string | number | boolean | string[];

/**
 * Answers that FLAG an application for human review. Knockout rules never auto-reject.
 *  - equals: flag when the answer equals `value` (e.g. "Do you hold a valid passport?" → false)
 *  - any_of: flag when the answer is (or, for multi_choice, contains) one of `values`
 *  - below / above: flag when a numeric answer is lower / higher than `value`
 */
export type ScreeningKnockoutRule =
  | { kind: "equals"; value: string | number | boolean }
  | { kind: "any_of"; values: string[] }
  | { kind: "below"; value: number }
  | { kind: "above"; value: number };

/** Saved search behind a job alert. Every key is optional; an empty object matches every new job. */
export type JobAlertCriteria = {
  keywords?: string;
  categoryIds?: string[];
  /** ISO-3166-1 alpha-2 codes. */
  countries?: string[];
  employmentTypes?: EmploymentType[];
  workModes?: WorkMode[];
  salaryMin?: { amountMinor: number; currency: string; period: SalaryPeriod };
  overseasOnly?: boolean;
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * A job posting (code VSG-JOB-xxxxxx). `organizationId` is null when Venkat Sai posts for a
 * confidential / managed client (then `managedByVenkatSai` must be true — CHECK). When
 * `isConfidential` is true, or there is no organisation, public pages show `confidentialEmployerName`
 * and must not expose anything identifying the organisation (name, logo, slug, id) — the search
 * vector deliberately contains no employer name for the same reason.
 *
 * Search: `skillsText` and `categoryNameCache` are denormalised by the jobs service (skill and
 * category names change rarely; generated columns cannot join or use array_to_string()).
 * Publishing requires a verified organisation (enforced in the service) and an approval
 * (approval type job_publication). Soft delete via `deletedAt`.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: pk(),
    code: text().notNull(),
    slug: text().notNull(),
    organizationId: uuid().references(() => organizations.id),
    /** Workforce requirement this posting fulfils (managed / bulk recruitment). */
    requirementId: uuid().references(() => requirementRequests.id, { onDelete: "set null" }),
    /**
     * Soft reference → recruitment.application_workflows.id (layer 12, later). Null = the
     * organisation's default workflow, else the platform default.
     */
    workflowId: uuid(),
    postedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    managedByVenkatSai: boolean().notNull().default(false),
    isConfidential: boolean().notNull().default(false),
    /** Shown instead of the organisation name when confidential, e.g. "EPC contractor, Qatar". */
    confidentialEmployerName: text(),
    /** The employer's own requisition reference (optional). */
    employerReference: text(),
    title: text().notNull(),
    summary: text(),
    /** Sanitised on write with sanitizeRichText(); render with <SafeHtml>. */
    descriptionHtml: text(),
    responsibilities: text(),
    qualificationsText: text(),
    jobCategoryId: uuid().references(() => jobCategories.id, { onDelete: "set null" }),
    industryId: uuid().references(() => industries.id, { onDelete: "set null" }),
    employmentType: text({ enum: EMPLOYMENT_TYPES }).notNull().default("full_time"),
    workMode: text({ enum: WORK_MODES }).notNull().default("on_site"),
    experienceLevel: text({ enum: EXPERIENCE_LEVELS }),
    experienceMinYears: smallint(),
    experienceMaxYears: smallint(),
    minEducationLevelId: uuid().references(() => educationLevels.id, { onDelete: "set null" }),
    openings: integer().notNull().default(1),
    salaryMinMinor: moneyMinor(),
    salaryMaxMinor: moneyMinor(),
    salaryCurrency: currencyCode().references(() => currencies.code),
    salaryPeriod: text({ enum: SALARY_PERIODS }),
    salaryVisible: boolean().notNull().default(true),
    benefits: text().array().notNull().$defaultFn(() => []),
    /** Primary work location; additional locations live in job_locations. Null for fully remote jobs. */
    countryCode: countryCode().references(() => countries.code),
    stateRegion: text(),
    city: text(),
    /**
     * Overseas-employment posting: the work location is outside the platform's configured home
     * country. Set by the jobs service from countryCode; drives the "Overseas jobs" filter and the
     * mobilisation workflow.
     */
    isOverseas: boolean().notNull().default(false),
    visaSponsorship: text({ enum: JOB_VISA_SPONSORSHIP_OPTIONS }).notNull().default("not_applicable"),
    sponsorshipDetails: text(),
    /** Tri-state: null = not stated by the employer (never guessed). */
    accommodationProvided: boolean(),
    foodProvided: boolean(),
    transportProvided: boolean(),
    contractDurationMonths: smallint(),
    workingHours: text(),
    /** Candidate-facing description of the selection process (trade test, interview rounds, medical...). */
    recruitmentProcess: text(),
    applicationDeadline: tstz(),
    startDate: date({ mode: "string" }),
    status: text({ enum: JOB_POSTING_STATUSES }).notNull().default("draft"),
    /** Latest reviewer note shown to the poster (changes requested / rejection reason). */
    moderationNote: text(),
    publishedAt: tstz(),
    closedAt: tstz(),
    closedReason: text({ enum: JOB_CLOSE_REASONS }),
    scheduledPublishAt: tstz(),
    expiresAt: tstz(),
    isFeatured: boolean().notNull().default(false),
    featuredUntil: tstz(),
    applyMode: text({ enum: JOB_APPLY_MODES }).notNull().default("platform"),
    externalApplyUrl: text(),
    screeningRequired: boolean().notNull().default(false),
    /** Snapshot of organizations.status = verified at publication. */
    verifiedEmployer: boolean().notNull().default(false),
    infoSource: text({ enum: JOB_INFO_SOURCES }).notNull().default("pending_review"),
    viewCount: integer().notNull().default(0),
    applicationCount: integer().notNull().default(0),
    /** Space-separated skill names (maintained by the jobs service from job_skills). */
    skillsText: text(),
    /** Job category name (maintained by the jobs service). */
    categoryNameCache: text(),
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL => sql`setweight(to_tsvector('simple'::regconfig, coalesce(${jobs.title}, '')), 'A')
        || setweight(to_tsvector('simple'::regconfig, coalesce(${jobs.categoryNameCache}, '') || ' ' || coalesce(${jobs.skillsText}, '')), 'B')
        || setweight(to_tsvector('simple'::regconfig, coalesce(${jobs.summary}, '')), 'C')
        || setweight(to_tsvector('simple'::regconfig, coalesce(${jobs.city}, '') || ' ' || coalesce(${jobs.stateRegion}, '')), 'D')`,
    ),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("jobs_code_uq").on(t.code),
    uniqueIndex("jobs_slug_uq").on(t.slug),
    index("jobs_org_status_idx").on(t.organizationId, t.status),
    index("jobs_requirement_idx").on(t.requirementId),
    index("jobs_posted_by_idx").on(t.postedByUserId),
    index("jobs_category_idx").on(t.jobCategoryId),
    index("jobs_industry_idx").on(t.industryId),
    index("jobs_min_education_idx").on(t.minEducationLevelId),
    index("jobs_salary_currency_idx").on(t.salaryCurrency),
    index("jobs_country_idx").on(t.countryCode, t.city),
    // Staff moderation queues (pending approval, changes requested...).
    index("jobs_status_idx").on(t.status, t.updatedAt),
    // Public job board: newest published, not deleted.
    index("jobs_published_idx")
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),
    index("jobs_featured_idx")
      .on(t.featuredUntil)
      .where(sql`${t.isFeatured} and ${t.status} = 'published' and ${t.deletedAt} is null`),
    index("jobs_expiry_idx").on(t.expiresAt).where(sql`${t.status} = 'published'`),
    index("jobs_scheduled_publish_idx").on(t.scheduledPublishAt).where(sql`${t.scheduledPublishAt} is not null`),
    index("jobs_search_idx").using("gin", t.searchVector),
    // Operator class via .op(): an SQL expression here makes drizzle-kit push re-create the index every run.
    index("jobs_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    check("jobs_owner_chk", sql`${t.organizationId} is not null or ${t.managedByVenkatSai}`),
    check("jobs_openings_chk", sql`${t.openings} > 0`),
    check("jobs_experience_years_chk", sql`${t.experienceMinYears} >= 0 and ${t.experienceMaxYears} >= 0`),
    check("jobs_experience_range_chk", sql`${t.experienceMaxYears} >= ${t.experienceMinYears}`),
    check("jobs_salary_amounts_chk", sql`${t.salaryMinMinor} >= 0 and ${t.salaryMaxMinor} >= 0`),
    check("jobs_salary_range_chk", sql`${t.salaryMaxMinor} >= ${t.salaryMinMinor}`),
    check(
      "jobs_salary_currency_chk",
      sql`(${t.salaryMinMinor} is null and ${t.salaryMaxMinor} is null) or (${t.salaryCurrency} is not null and ${t.salaryPeriod} is not null)`,
    ),
    check("jobs_contract_duration_chk", sql`${t.contractDurationMonths} > 0`),
    check("jobs_external_apply_chk", sql`${t.applyMode} <> 'external_url' or ${t.externalApplyUrl} is not null`),
  ],
);

/** Skills a job asks for (feeds matching and jobs.skillsText). */
export const jobSkills = pgTable(
  "job_skills",
  {
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    skillId: uuid()
      .notNull()
      .references(() => skills.id),
    isRequired: boolean().notNull().default(true),
    minYears: smallint(),
    sortOrder: integer().notNull().default(0),
    ...createdAtOnly,
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.skillId] }),
    index("job_skills_skill_idx").on(t.skillId),
    check("job_skills_min_years_chk", sql`${t.minYears} >= 0`),
  ],
);

/** Additional work locations for multi-location / multi-country postings, with openings per location. */
export const jobLocations = pgTable(
  "job_locations",
  {
    id: pk(),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    stateRegion: text(),
    city: text(),
    openings: integer(),
    sortOrder: integer().notNull().default(0),
    ...createdAtOnly,
  },
  (t) => [
    // One row per place; a missing region / city counts as one value (NULLS NOT DISTINCT semantics). An
    // expression index instead of `unique().nullsNotDistinct()` because drizzle-kit 0.31 introspects every
    // unique constraint as NULLS DISTINCT and re-creates it on each push. Plain columns are written as SQL too:
    // drizzle-kit treats every column of an index that has an expression as an expression. The leading
    // job_id column is a plain key column, so this index also serves the FK.
    uniqueIndex("job_locations_place_uq").on(
      sql`${t.jobId}`,
      sql`${t.countryCode}`,
      sql`coalesce(${t.stateRegion}, '')`,
      sql`coalesce(${t.city}, '')`,
    ),
    index("job_locations_country_idx").on(t.countryCode, t.city),
    check("job_locations_openings_chk", sql`${t.openings} > 0`),
  ],
);

/**
 * Screening questions asked at application time. `knockoutAnswer` only FLAGS an application for
 * human review — it must never auto-reject. Answers keep a snapshot of the question
 * (recruitment.application_answers), so editing or deleting a question never rewrites history.
 */
export const jobScreeningQuestions = pgTable(
  "job_screening_questions",
  {
    id: pk(),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    question: text().notNull(),
    helpText: text(),
    type: text({ enum: SCREENING_QUESTION_TYPES }).notNull(),
    /** Choices for single_choice / multi_choice (at least one, CHECK). */
    options: jsonb().$type<ScreeningQuestionOption[]>().notNull().default(emptyJsonArray),
    isRequired: boolean().notNull().default(true),
    knockoutAnswer: jsonb().$type<ScreeningKnockoutRule>(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("job_screening_questions_job_idx").on(t.jobId, t.sortOrder),
    check(
      "job_screening_questions_options_chk",
      sql`case when jsonb_typeof(${t.options}) <> 'array' then false when ${t.type} in ('single_choice', 'multi_choice') then jsonb_array_length(${t.options}) > 0 else true end`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Candidate-side tools
// ---------------------------------------------------------------------------

/** Jobs a signed-in user bookmarked. Private to that user. */
export const savedJobs = pgTable(
  "saved_jobs",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    ...createdAtOnly,
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] }), index("saved_jobs_job_idx").on(t.jobId)],
);

/**
 * Saved searches that send digests of newly published matching jobs (event job.alert_digest).
 * `lastRunAt` is the evaluation watermark (jobs published after it are new); `lastSentAt` records
 * the last digest actually delivered. Requested by the user, so not marketing — but WhatsApp/SMS
 * delivery still honours the channel consent and notification preferences.
 */
export const jobAlerts = pgTable(
  "job_alerts",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    criteria: jsonb().$type<JobAlertCriteria>().notNull().default(emptyJsonObject),
    frequency: text({ enum: JOB_ALERT_FREQUENCIES }).notNull().default("weekly"),
    /** JS array default: drizzle-kit renders it as '{"email","in_app"}', the form it introspects back (no push diff). */
    channels: text({ enum: JOB_ALERT_CHANNELS }).array().notNull().default(["email", "in_app"]),
    isActive: boolean().notNull().default(true),
    lastRunAt: tstz(),
    lastSentAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("job_alerts_user_idx").on(t.userId),
    index("job_alerts_due_idx").on(t.frequency, t.lastRunAt).where(sql`${t.isActive}`),
  ],
);

/**
 * Featured / boosted / homepage placement windows for a job. `referenceId` points at the
 * commercial record that paid for it (subscription entitlement, purchase) or is null for admin grants.
 */
export const jobPromotions = pgTable(
  "job_promotions",
  {
    id: pk(),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: text({ enum: JOB_PROMOTION_TYPES }).notNull(),
    startsAt: tstz().notNull().defaultNow(),
    endsAt: tstz(),
    sourceType: text({ enum: JOB_PROMOTION_SOURCES }).notNull(),
    /** Soft reference → commercial subscription / credit_ledger / invoice row (layer 13, later). */
    referenceId: uuid(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    cancelledAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("job_promotions_job_idx").on(t.jobId, t.type),
    index("job_promotions_active_idx").on(t.type, t.startsAt, t.endsAt).where(sql`${t.cancelledAt} is null`),
    index("job_promotions_created_by_idx").on(t.createdByUserId),
    check("job_promotions_window_chk", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
