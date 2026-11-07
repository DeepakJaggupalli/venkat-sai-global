/**
 * Recruitment domain: configurable application workflows, applications and their append-only stage
 * history, screening answers, internal notes, talent lists, profile unlocks, interviews, offers,
 * placements, overseas mobilisation, and the recruitment-partner workflow (assignments,
 * submissions, attribution, duplicate detection).
 * Layer 12 — may import every earlier layer (… + jobs, training). Never import from a later layer
 * (see docs/DATA_MODEL.md → Layering).
 *
 * State model
 *  - Pipeline stages are DATA (application_workflows → workflow_stages), not enums. Each stage maps
 *    onto one fixed WORKFLOW_STAGE_CATEGORIES value; business rules key off the category — never a
 *    stage's key or name — so employer pipelines (spec 9.5) and candidate labels (spec 8.5) stay
 *    configurable.
 *  - applications.currentStageId says where an application is; a composite FK guarantees the stage
 *    belongs to the application's workflow. applications.status is the coarse
 *    lifecycle the recruitment service derives from the stage category (joined → hired,
 *    rejected → rejected, withdrawn → withdrawn, closed → closed, anything else → active); it is a
 *    column so lists, counts and partial indexes stay cheap.
 *  - Every move appends one application_stage_history row (never updated) with an internal note
 *    and an optional candidate-visible note.
 *  - Placement → mobilisation tracks overseas deployment: medical, visa, India emigration clearance
 *    (eMigrate, for ECR passport holders), pre-departure orientation (PDOS) and travel.
 *
 * Privacy
 *  - Internal notes, interview feedback, ratings, knockout flags and rejection reasons are never
 *    shown to candidates; candidate-facing text lives only in `candidate*` columns.
 *  - Employers see an application only once it is shared with them (`sharedWithEmployerAt`); for
 *    Venkat Sai-managed jobs that happens after internal screening.
 *  - Partners only ever see their own assignments, submissions and attributions; a composite FK
 *    ties every submission to an assignment of the same partner.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, smallint, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { SALARY_PERIODS } from "./_constants";
import { countryCode, createdAtOnly, currencyCode, emptyJsonArray, emptyJsonObject, moneyMinor, pk, timestamps, tstz } from "./_shared";
import { candidateProfiles } from "./candidates";
import { files, organizations, users } from "./core";
import { consentRecords } from "./identity";
import {
  jobScreeningQuestions,
  jobs,
  type ScreeningAnswerValue,
  type ScreeningQuestionOption,
  type ScreeningQuestionType,
} from "./jobs";
import { requirementRequests } from "./operations";
import { countries, currencies } from "./taxonomy";
import { skillAssessments } from "./training";

/** Stand-in for NULL inside unique expression indexes (scope "platform" = no organisation). */
const NIL_UUID = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

// Foreign keys declared with foreignKey({ name }) instead of .references() have an explicit name
// because the generated one would exceed PostgreSQL's 63-byte identifier limit (silently truncated,
// which makes later drizzle-kit pushes drop and re-create the constraint).

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Fixed vocabulary every configurable stage maps onto (in pipeline order).
 * Terminal categories: joined, closed, rejected, withdrawn.
 */
export const WORKFLOW_STAGE_CATEGORIES = [
  "applied",
  "screening",
  "assessment",
  "interview",
  "decision",
  "offer",
  "pre_joining",
  "joined",
  "closed",
  "rejected",
  "withdrawn",
] as const;
export type WorkflowStageCategory = (typeof WORKFLOW_STAGE_CATEGORIES)[number];

/** Coarse lifecycle derived from the current stage's category (see file header). */
export const APPLICATION_STATUSES = ["active", "hired", "rejected", "withdrawn", "closed"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_SOURCES = ["direct", "partner", "staff_assigned", "campus", "referral", "import"] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

/** Who performed an action on an application. */
export const APPLICATION_ACTOR_TYPES = ["staff", "employer", "partner", "candidate", "system"] as const;
export type ApplicationActorType = (typeof APPLICATION_ACTOR_TYPES)[number];

/** Internal notes are never shown to candidates, whatever the visibility. */
export const APPLICATION_NOTE_VISIBILITIES = ["staff_only", "staff_and_employer", "staff_and_partner"] as const;
export type ApplicationNoteVisibility = (typeof APPLICATION_NOTE_VISIBILITIES)[number];

/**
 * Structured, job-related rejection reasons for reporting and partner feedback. Deliberately contains
 * no personal characteristic (age, gender, religion, caste, nationality...): decisions must be
 * explainable by job-related criteria. Free-text detail stays internal.
 */
export const APPLICATION_REJECTION_REASONS = [
  "skills_mismatch",
  "experience_mismatch",
  "qualification_mismatch",
  "assessment_not_passed",
  "interview_not_passed",
  "documents_incomplete",
  "salary_mismatch",
  "location_mismatch",
  "availability_mismatch",
  "no_response",
  "no_show",
  "position_filled",
  "job_closed",
  "duplicate",
  "other",
] as const;
export type ApplicationRejectionReason = (typeof APPLICATION_REJECTION_REASONS)[number];

export const TALENT_LIST_KINDS = ["shortlist", "saved_candidates", "project", "talent_pool"] as const;
export type TalentListKind = (typeof TALENT_LIST_KINDS)[number];

export const INTERVIEW_MODES = ["in_person", "video", "phone", "trade_test"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_STATUSES = ["scheduled", "rescheduled", "completed", "cancelled", "no_show"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_OUTCOMES = ["pending", "passed", "failed", "on_hold"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

/** The candidate's answer to an interview invitation. */
export const INTERVIEW_CANDIDATE_RESPONSES = ["pending", "confirmed", "declined", "reschedule_requested"] as const;
export type InterviewCandidateResponse = (typeof INTERVIEW_CANDIDATE_RESPONSES)[number];

export const INTERVIEW_PARTICIPANT_ROLES = ["interviewer", "observer", "coordinator"] as const;
export type InterviewParticipantRole = (typeof INTERVIEW_PARTICIPANT_ROLES)[number];

export const INTERVIEW_RECOMMENDATIONS = ["strong_yes", "yes", "maybe", "no"] as const;
export type InterviewRecommendation = (typeof INTERVIEW_RECOMMENDATIONS)[number];

export const OFFER_STATUSES = ["draft", "issued", "accepted", "declined", "withdrawn", "expired"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const PLACEMENT_STATUSES = ["pending_joining", "mobilising", "joined", "replacement_required", "cancelled", "completed"] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const MOBILISATION_STATUSES = [
  "not_started",
  "documents_pending",
  "medical",
  "visa_processing",
  "emigration_clearance",
  "travel_booked",
  "departed",
  "arrived",
  "completed",
  "on_hold",
  "cancelled",
] as const;
export type MobilisationStatus = (typeof MOBILISATION_STATUSES)[number];

export const MOBILISATION_VISA_STATUSES = [
  "not_required",
  "not_started",
  "documents_pending",
  "applied",
  "approved",
  "issued",
  "rejected",
  "cancelled",
] as const;
export type MobilisationVisaStatus = (typeof MOBILISATION_VISA_STATUSES)[number];

/** Pre-employment medical (e.g. GCC-approved medical centres). Outcome only — never diagnoses. */
export const MOBILISATION_MEDICAL_STATUSES = ["not_required", "pending", "scheduled", "fit", "unfit", "expired"] as const;
export type MobilisationMedicalStatus = (typeof MOBILISATION_MEDICAL_STATUSES)[number];

/**
 * India emigration clearance via eMigrate (needed for ECR passport holders going to ECR-notified
 * countries). `not_assessed` until staff check the passport category and destination.
 */
export const EMIGRATION_CLEARANCE_STATUSES = ["not_assessed", "not_required", "pending", "applied", "granted", "rejected"] as const;
export type EmigrationClearanceStatus = (typeof EMIGRATION_CLEARANCE_STATUSES)[number];

export const MOBILISATION_CHECKLIST_CATEGORIES = ["document", "medical", "visa", "emigration", "insurance", "travel", "orientation", "other"] as const;
export type MobilisationChecklistCategory = (typeof MOBILISATION_CHECKLIST_CATEGORIES)[number];

export const MOBILISATION_CHECKLIST_STATUSES = ["pending", "submitted", "verified", "not_applicable", "rejected"] as const;
export type MobilisationChecklistStatus = (typeof MOBILISATION_CHECKLIST_STATUSES)[number];

/** Who must act on a checklist item. */
export const MOBILISATION_RESPONSIBLE_PARTIES = ["candidate", "venkat_sai", "employer", "partner"] as const;
export type MobilisationResponsibleParty = (typeof MOBILISATION_RESPONSIBLE_PARTIES)[number];

export const PARTNER_ASSIGNMENT_STATUSES = ["active", "paused", "completed", "revoked"] as const;
export type PartnerAssignmentStatus = (typeof PARTNER_ASSIGNMENT_STATUSES)[number];

export const PARTNER_SUBMISSION_STATUSES = ["submitted", "under_review", "duplicate", "accepted", "rejected", "withdrawn"] as const;
export type PartnerSubmissionStatus = (typeof PARTNER_SUBMISSION_STATUSES)[number];

export const CANDIDATE_ATTRIBUTION_STATUSES = ["active", "expired", "disputed", "revoked"] as const;
export type CandidateAttributionStatus = (typeof CANDIDATE_ATTRIBUTION_STATUSES)[number];

/** `passport_number` = exact match on candidate_profiles.passportNumberHash (keyed blind index). */
export const DUPLICATE_MATCH_FIELDS = ["email", "phone", "passport_number", "passport_last4", "name_dob"] as const;
export type DuplicateMatchField = (typeof DUPLICATE_MATCH_FIELDS)[number];

export const DUPLICATE_FLAG_STATUSES = ["open", "confirmed_duplicate", "not_duplicate", "merged"] as const;
export type DuplicateFlagStatus = (typeof DUPLICATE_FLAG_STATUSES)[number];

export const DUPLICATE_FLAG_SOURCES = ["system", "staff", "partner_submission"] as const;
export type DuplicateFlagSource = (typeof DUPLICATE_FLAG_SOURCES)[number];

// ---------------------------------------------------------------------------
// JSON shapes
// ---------------------------------------------------------------------------

/** Candidate-facing stage copy per UI locale, e.g. { hi: { label: "…" }, te: { label: "…" } }. Falls back to candidateLabel. */
export type WorkflowStageTranslations = Partial<Record<string, { label?: string; description?: string }>>;

/** Optional provenance details, by source. */
export type ApplicationSourceDetails = {
  campusDriveId?: string;
  referrerName?: string;
  referrerUserId?: string;
  importBatchId?: string;
};

/** A screening answer that matched a knockout rule (flag for human review, never an auto-reject). */
export type ApplicationKnockoutFlag = {
  questionId: string | null;
  question: string;
  answer: ScreeningAnswerValue;
  reason: string;
};

/** The question exactly as the candidate saw it. */
export type ScreeningQuestionSnapshot = {
  question: string;
  type: ScreeningQuestionType;
  options: ScreeningQuestionOption[];
  isRequired: boolean;
};

/** Structured interview scorecard line (structured criteria reduce bias in feedback). */
export type InterviewScorecardEntry = { criterion: string; score: number; maxScore: number; comment?: string };

/** The partner's own commission terms for an assignment (visible to that partner only). */
export type PartnerCommissionTerms = {
  model?: "fixed_per_placement" | "percent_of_fee" | "none" | "custom";
  amountMinor?: number;
  currency?: string;
  /** 1000 = 10%. */
  percentBasisPoints?: number;
  payableAfterDays?: number;
  notes?: string;
};

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

/**
 * A configurable hiring pipeline. organizationId null = platform workflow (the recruitment seed
 * installs the default one, looked up by `key`); set = an employer's own workflow (later phase).
 * At most one default per scope. Workflows referenced by applications cannot be deleted —
 * deactivate them instead.
 */
export const applicationWorkflows = pgTable(
  "application_workflows",
  {
    id: pk(),
    organizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    /** Stable identifier for seeds and code, e.g. "standard", "overseas". */
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    isDefault: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    // One key per scope (platform = no organisation). Expression index instead of
    // `unique().nullsNotDistinct()`, which drizzle-kit 0.31 re-creates on every push; the plain column is
    // written as SQL as well (docs/SCHEMA_NOTES.md).
    uniqueIndex("application_workflows_org_key_uq").on(sql`coalesce(${t.organizationId}, ${NIL_UUID})`, sql`${t.key}`),
    index("application_workflows_org_idx").on(t.organizationId),
    uniqueIndex("application_workflows_default_uq")
      .on(sql`coalesce(${t.organizationId}, ${NIL_UUID})`)
      .where(sql`${t.isDefault}`),
    index("application_workflows_created_by_idx").on(t.createdByUserId),
  ],
);

/**
 * Ordered stages of a workflow. `name` is the staff / employer pipeline label; `candidateLabel`
 * (+ translations) is what the People Portal shows. Stages referenced by applications or history
 * cannot be deleted (restrict) — retire them with isActive = false. Closed / rejected / withdrawn
 * stages are always terminal and only terminal categories may be terminal (CHECK).
 */
export const workflowStages = pgTable(
  "workflow_stages",
  {
    id: pk(),
    workflowId: uuid()
      .notNull()
      .references(() => applicationWorkflows.id, { onDelete: "cascade" }),
    /** Stable identifier within the workflow, e.g. "submitted", "trade_test", "visa_processing". */
    key: text().notNull(),
    name: text().notNull(),
    category: text({ enum: WORKFLOW_STAGE_CATEGORIES }).notNull(),
    sortOrder: integer().notNull().default(0),
    candidateLabel: text().notNull(),
    candidateDescription: text(),
    candidateTranslations: jsonb().$type<WorkflowStageTranslations>().notNull().default(emptyJsonObject),
    isTerminal: boolean().notNull().default(false),
    /** Send application.status_changed to the candidate when an application enters this stage. */
    notifyCandidate: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    /** Expected maximum days in this stage; drives "stuck application" alerts for staff. */
    slaDays: smallint(),
    ...timestamps,
  },
  (t) => [
    unique("workflow_stages_workflow_key_uq").on(t.workflowId, t.key),
    // Target of the composite FK from applications (current stage must belong to the application's workflow).
    unique("workflow_stages_id_workflow_uq").on(t.id, t.workflowId),
    index("workflow_stages_workflow_order_idx").on(t.workflowId, t.sortOrder),
    check("workflow_stages_sla_chk", sql`${t.slaDays} > 0`),
    check(
      "workflow_stages_terminal_chk",
      sql`(${t.category} not in ('closed', 'rejected', 'withdrawn') or ${t.isTerminal}) and (not ${t.isTerminal} or ${t.category} in ('joined', 'closed', 'rejected', 'withdrawn'))`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * A candidate's application to a job (code VSG-APP-xxxxxx), unique per (job, candidate) — a
 * re-application reopens the existing row. Freezes what the employer sees (`profileSnapshot`,
 * `resumeFileId`), records the consent that allowed sharing and any partner attribution.
 * Privacy: rating, knockout flags, rejection reasons and notes are internal; candidates see the
 * stage's candidateLabel and candidate-visible history notes only. `profileSnapshot` must exclude
 * encrypted identifiers, date of birth and gender.
 */
export const applications = pgTable(
  "applications",
  {
    id: pk(),
    code: text().notNull(),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    /**
     * Must be a stage of `workflowId` — composite FK applications_current_stage_fk. Declared before
     * workflowId on purpose: drizzle-kit reads composite-FK columns back in table column order or in
     * alphabetical order (plan-dependent), so the FK's column lists must follow both orders on both tables
     * or `drizzle-kit push` re-creates it (docs/SCHEMA_NOTES.md §2, rule 5).
     */
    currentStageId: uuid().notNull(),
    workflowId: uuid()
      .notNull()
      .references(() => applicationWorkflows.id),
    status: text({ enum: APPLICATION_STATUSES }).notNull().default("active"),
    source: text({ enum: APPLICATION_SOURCES }).notNull().default("direct"),
    sourceDetails: jsonb().$type<ApplicationSourceDetails>().notNull().default(emptyJsonObject),
    /** Recruitment partner credited with the application (required when source = partner). */
    partnerOrganizationId: uuid().references(() => organizations.id),
    /** Candidate, partner member or staff user who submitted it. */
    submittedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Venkat Sai recruiter owning the application (managed jobs). */
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    coverLetter: text(),
    /** Resume as submitted (snapshot; later profile changes do not alter it). */
    resumeFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** Frozen profile at submission; shape versioned by the recruitment module. */
    profileSnapshot: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    expectedSalaryMinor: moneyMinor(),
    expectedSalaryCurrency: currencyCode().references(() => currencies.code),
    expectedSalaryPeriod: text({ enum: SALARY_PERIODS }),
    /** When the candidate agreed to share the profile with this employer. */
    consentToShareAt: tstz(),
    /** Ledger row (purpose share_profile_with_employers, context = this application). */
    consentRecordId: uuid().references(() => consentRecords.id, { onDelete: "set null" }),
    /** Null = not visible to the employer yet (e.g. Venkat Sai internal screening on managed jobs). */
    sharedWithEmployerAt: tstz(),
    sharedWithEmployerByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Internal 1–5 rating (never shown to the candidate). */
    rating: smallint(),
    isShortlisted: boolean().notNull().default(false),
    knockoutFlags: jsonb().$type<ApplicationKnockoutFlag[]>().notNull().default(emptyJsonArray),
    withdrawnAt: tstz(),
    /** Candidate-provided. */
    withdrawalReason: text(),
    rejectedAt: tstz(),
    rejectionReasonCode: text({ enum: APPLICATION_REJECTION_REASONS }),
    /** Internal detail; candidate-facing wording goes in the stage-history candidateVisibleNote. */
    rejectionReason: text(),
    hiredAt: tstz(),
    lastStageChangedAt: tstz().notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_code_uq").on(t.code),
    unique("applications_job_candidate_uq").on(t.jobId, t.candidateId),
    foreignKey({
      columns: [t.currentStageId, t.workflowId],
      foreignColumns: [workflowStages.id, workflowStages.workflowId],
      name: "applications_current_stage_fk",
    }),
    // Employer / staff pipeline board for a job (kanban columns).
    index("applications_job_stage_idx").on(t.jobId, t.currentStageId),
    index("applications_candidate_idx").on(t.candidateId, t.createdAt),
    index("applications_workflow_idx").on(t.workflowId),
    // "Stuck in stage" SLA checks and stage counts.
    index("applications_stage_idx").on(t.currentStageId, t.lastStageChangedAt),
    index("applications_partner_idx").on(t.partnerOrganizationId, t.createdAt),
    index("applications_submitted_by_idx").on(t.submittedByUserId),
    index("applications_assigned_to_idx").on(t.assignedToUserId, t.status),
    index("applications_resume_file_idx").on(t.resumeFileId),
    index("applications_consent_idx").on(t.consentRecordId),
    index("applications_shared_by_idx").on(t.sharedWithEmployerByUserId),
    index("applications_salary_currency_idx").on(t.expectedSalaryCurrency),
    check("applications_rating_chk", sql`${t.rating} between 1 and 5`),
    check(
      "applications_expected_salary_chk",
      sql`${t.expectedSalaryMinor} is null or (${t.expectedSalaryMinor} >= 0 and ${t.expectedSalaryCurrency} is not null and ${t.expectedSalaryPeriod} is not null)`,
    ),
    check("applications_partner_source_chk", sql`${t.source} <> 'partner' or ${t.partnerOrganizationId} is not null`),
    check(
      "applications_status_dates_chk",
      sql`(${t.status} <> 'withdrawn' or ${t.withdrawnAt} is not null) and (${t.status} <> 'rejected' or ${t.rejectedAt} is not null) and (${t.status} <> 'hired' or ${t.hiredAt} is not null)`,
    ),
  ],
);

/**
 * Append-only pipeline history (never updated or deleted, except with the application itself).
 * `note` is internal; `candidateVisibleNote` is the only text a candidate may see.
 * fromStageId is null for the initial entry.
 */
export const applicationStageHistory = pgTable(
  "application_stage_history",
  {
    id: pk(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStageId: uuid().references(() => workflowStages.id),
    toStageId: uuid()
      .notNull()
      .references(() => workflowStages.id),
    changedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    changedByType: text({ enum: APPLICATION_ACTOR_TYPES }).notNull(),
    /** Employer or partner organisation the actor acted for (null for staff, candidate, system). */
    changedByOrganizationId: uuid(),
    note: text(),
    candidateVisibleNote: text(),
    ...createdAtOnly,
  },
  (t) => [
    index("application_stage_history_application_idx").on(t.applicationId, t.createdAt),
    index("application_stage_history_from_stage_idx").on(t.fromStageId),
    // Funnel / time-in-stage analytics.
    index("application_stage_history_to_stage_idx").on(t.toStageId, t.createdAt),
    index("application_stage_history_changed_by_idx").on(t.changedByUserId),
    index("application_stage_history_changed_by_org_idx").on(t.changedByOrganizationId),
    foreignKey({ columns: [t.changedByOrganizationId], foreignColumns: [organizations.id], name: "application_stage_history_changed_by_org_fk" }).onDelete(
      "set null",
    ),
  ],
);

/**
 * Answers to a job's screening questions, with a snapshot of the question as asked. If the job's
 * question is later edited or deleted the answer keeps its snapshot (questionId → null).
 */
export const applicationAnswers = pgTable(
  "application_answers",
  {
    id: pk(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    questionId: uuid().references(() => jobScreeningQuestions.id, { onDelete: "set null" }),
    questionSnapshot: jsonb().$type<ScreeningQuestionSnapshot>().notNull(),
    answer: jsonb().$type<ScreeningAnswerValue>().notNull(),
    /** Matched the question's knockout rule (flag only). */
    isFlagged: boolean().notNull().default(false),
    ...createdAtOnly,
  },
  (t) => [
    unique("application_answers_application_question_uq").on(t.applicationId, t.questionId),
    index("application_answers_question_idx").on(t.questionId),
  ],
);

/**
 * Internal notes on an application — never shown to candidates. `visibility` decides which
 * organisations (besides Venkat Sai staff) can read a note.
 */
export const applicationNotes = pgTable(
  "application_notes",
  {
    id: pk(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    authorOrganizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    visibility: text({ enum: APPLICATION_NOTE_VISIBILITIES }).notNull().default("staff_only"),
    body: text().notNull(),
    isPinned: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("application_notes_application_idx").on(t.applicationId, t.createdAt),
    index("application_notes_author_idx").on(t.authorUserId),
    index("application_notes_author_org_idx").on(t.authorOrganizationId),
  ],
);

// ---------------------------------------------------------------------------
// Talent lists and profile unlocks
// ---------------------------------------------------------------------------

/**
 * Shortlists, saved candidates, projects and talent pools. organizationId null = a Venkat Sai staff
 * list. `isShared` = visible to the whole organisation (or all staff), otherwise to the creator only.
 * Membership never reveals contact details: profile visibility and privacy settings still apply.
 */
export const talentLists = pgTable(
  "talent_lists",
  {
    id: pk(),
    organizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    kind: text({ enum: TALENT_LIST_KINDS }).notNull().default("shortlist"),
    name: text().notNull(),
    description: text(),
    jobId: uuid().references(() => jobs.id, { onDelete: "set null" }),
    requirementId: uuid().references(() => requirementRequests.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    isShared: boolean().notNull().default(false),
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("talent_lists_org_idx").on(t.organizationId, t.updatedAt),
    index("talent_lists_job_idx").on(t.jobId),
    index("talent_lists_requirement_idx").on(t.requirementId),
    index("talent_lists_created_by_idx").on(t.createdByUserId),
  ],
);

/** A candidate on a talent list, with the list owner's private note and free-form project stage. */
export const talentListItems = pgTable(
  "talent_list_items",
  {
    id: pk(),
    listId: uuid()
      .notNull()
      .references(() => talentLists.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    addedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    note: text(),
    stage: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("talent_list_items_list_candidate_uq").on(t.listId, t.candidateId),
    index("talent_list_items_candidate_idx").on(t.candidateId),
    index("talent_list_items_added_by_idx").on(t.addedByUserId),
  ],
);

/**
 * Contact-detail access an organisation obtained for a candidate (candidate search → unlock, usually
 * consuming a credit). One row per (organisation, candidate): a renewal updates the row; every
 * unlock and renewal is also recorded in audit_logs, the credit ledger and data_access_logs.
 * The candidate can see which organisations unlocked them; revocation (e.g. the candidate blocks
 * the organisation) sets revokedAt.
 */
export const profileUnlocks = pgTable(
  "profile_unlocks",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    unlockedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Job the unlock was made for (optional context for reporting). */
    jobId: uuid().references(() => jobs.id, { onDelete: "set null" }),
    unlockedAt: tstz().notNull().defaultNow(),
    expiresAt: tstz(),
    /** Soft reference → commercial.credit_ledger.id (layer 13, later). */
    creditLedgerId: uuid(),
    reason: text(),
    revokedAt: tstz(),
    revokedReason: text(),
    ...timestamps,
  },
  (t) => [
    unique("profile_unlocks_org_candidate_uq").on(t.organizationId, t.candidateId),
    index("profile_unlocks_candidate_idx").on(t.candidateId),
    index("profile_unlocks_unlocked_by_idx").on(t.unlockedByUserId),
    index("profile_unlocks_job_idx").on(t.jobId),
    check("profile_unlocks_expiry_chk", sql`${t.expiresAt} > ${t.unlockedAt}`),
  ],
);

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

/**
 * An interview round or trade test for an application (code VSG-INT-xxxxxx). organizationId is the
 * employer running it (null when Venkat Sai runs it for a confidential client). A trade test held
 * at a Venkat Sai assessment centre links to its training.skill_assessments record.
 * `candidateInstructions` is candidate-facing; feedback and outcome details are internal.
 */
export const interviews = pgTable(
  "interviews",
  {
    id: pk(),
    code: text().notNull(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    organizationId: uuid().references(() => organizations.id),
    roundNumber: smallint().notNull().default(1),
    roundName: text().notNull(),
    mode: text({ enum: INTERVIEW_MODES }).notNull(),
    scheduledStart: tstz().notNull(),
    scheduledEnd: tstz(),
    /** IANA time zone the interview was scheduled in (e.g. "Asia/Dubai"); never assumed. */
    timezone: text().notNull(),
    location: text(),
    meetingUrl: text(),
    /** What to bring / how to join, shown to the candidate. */
    candidateInstructions: text(),
    status: text({ enum: INTERVIEW_STATUSES }).notNull().default("scheduled"),
    organizedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    skillAssessmentId: uuid().references(() => skillAssessments.id, { onDelete: "set null" }),
    candidateResponse: text({ enum: INTERVIEW_CANDIDATE_RESPONSES }).notNull().default("pending"),
    candidateRespondedAt: tstz(),
    candidateResponseNote: text(),
    reminderSentAt: tstz(),
    outcome: text({ enum: INTERVIEW_OUTCOMES }).notNull().default("pending"),
    cancelledAt: tstz(),
    cancellationReason: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("interviews_code_uq").on(t.code),
    index("interviews_application_idx").on(t.applicationId, t.scheduledStart),
    index("interviews_org_schedule_idx").on(t.organizationId, t.scheduledStart),
    index("interviews_organized_by_idx").on(t.organizedByUserId),
    index("interviews_skill_assessment_idx").on(t.skillAssessmentId),
    // Calendars and the reminder task.
    index("interviews_upcoming_idx")
      .on(t.scheduledStart)
      .where(sql`${t.status} in ('scheduled', 'rescheduled')`),
    check("interviews_schedule_chk", sql`${t.scheduledEnd} > ${t.scheduledStart}`),
    check("interviews_round_chk", sql`${t.roundNumber} >= 1`),
  ],
);

/** Interview panel. External participants (no account) have userId null. Emails are visible to organisers only. */
export const interviewParticipants = pgTable(
  "interview_participants",
  {
    id: pk(),
    interviewId: uuid()
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    email: text(),
    role: text({ enum: INTERVIEW_PARTICIPANT_ROLES }).notNull().default("interviewer"),
    ...createdAtOnly,
  },
  (t) => [
    unique("interview_participants_interview_user_uq").on(t.interviewId, t.userId),
    index("interview_participants_user_idx").on(t.userId),
  ],
);

/** Interviewer feedback (one per interviewer per interview). Internal: never shown to candidates. */
export const interviewFeedback = pgTable(
  "interview_feedback",
  {
    id: pk(),
    interviewId: uuid()
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    authorOrganizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    rating: smallint(),
    recommendation: text({ enum: INTERVIEW_RECOMMENDATIONS }).notNull(),
    scorecard: jsonb().$type<InterviewScorecardEntry[]>().notNull().default(emptyJsonArray),
    strengths: text(),
    concerns: text(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    unique("interview_feedback_interview_author_uq").on(t.interviewId, t.authorUserId),
    index("interview_feedback_author_idx").on(t.authorUserId),
    index("interview_feedback_author_org_idx").on(t.authorOrganizationId),
    check("interview_feedback_rating_chk", sql`${t.rating} between 1 and 5`),
  ],
);

// ---------------------------------------------------------------------------
// Offers and placements
// ---------------------------------------------------------------------------

/**
 * Employment offer (code VSG-OFR-xxxxxx). At most one draft / issued / accepted offer per
 * application; a revised offer withdraws the previous one and points at it via supersedesOfferId.
 * Candidates see offers from `issued` onwards; `internalNotes` never reaches them.
 */
export const offers = pgTable(
  "offers",
  {
    id: pk(),
    code: text().notNull(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id),
    organizationId: uuid().references(() => organizations.id),
    issuedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    supersedesOfferId: uuid(),
    jobTitle: text().notNull(),
    salaryMinor: moneyMinor(),
    salaryCurrency: currencyCode().references(() => currencies.code),
    salaryPeriod: text({ enum: SALARY_PERIODS }),
    benefits: text(),
    countryCode: countryCode().references(() => countries.code),
    workLocation: text(),
    startDate: date({ mode: "string" }),
    contractDurationMonths: smallint(),
    offerFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** Countersigned copy returned by the candidate. */
    signedOfferFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    status: text({ enum: OFFER_STATUSES }).notNull().default("draft"),
    issuedAt: tstz(),
    respondedAt: tstz(),
    expiresAt: tstz(),
    /** Candidate-provided. */
    declineReason: text(),
    withdrawnAt: tstz(),
    withdrawalReason: text(),
    internalNotes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("offers_code_uq").on(t.code),
    index("offers_application_idx").on(t.applicationId, t.createdAt),
    uniqueIndex("offers_application_open_uq")
      .on(t.applicationId)
      .where(sql`${t.status} in ('draft', 'issued', 'accepted')`),
    index("offers_org_status_idx").on(t.organizationId, t.status),
    index("offers_issued_by_idx").on(t.issuedByUserId),
    index("offers_supersedes_idx").on(t.supersedesOfferId),
    index("offers_country_idx").on(t.countryCode),
    index("offers_salary_currency_idx").on(t.salaryCurrency),
    index("offers_offer_file_idx").on(t.offerFileId),
    index("offers_signed_file_idx").on(t.signedOfferFileId),
    // Expiry task.
    index("offers_expiry_idx").on(t.expiresAt).where(sql`${t.status} = 'issued'`),
    foreignKey({ columns: [t.supersedesOfferId], foreignColumns: [t.id], name: "offers_supersedes_fk" }).onDelete("set null"),
    check(
      "offers_salary_chk",
      sql`${t.salaryMinor} is null or (${t.salaryMinor} >= 0 and ${t.salaryCurrency} is not null and ${t.salaryPeriod} is not null)`,
    ),
    check("offers_contract_duration_chk", sql`${t.contractDurationMonths} > 0`),
    check("offers_supersedes_chk", sql`${t.supersedesOfferId} <> ${t.id}`),
    check("offers_issued_chk", sql`${t.status} not in ('issued', 'accepted', 'declined', 'expired') or ${t.issuedAt} is not null`),
    check("offers_response_chk", sql`${t.status} not in ('accepted', 'declined') or ${t.respondedAt} is not null`),
  ],
);

/**
 * A confirmed hire (code VSG-PLC-xxxxxx), one per application. Tracks joining, the replacement
 * guarantee window and the placement fee (invoiced through commercial). A replacement hire points at
 * the placement it replaces. partnerOrganizationId is copied from the application for settlements.
 */
export const placements = pgTable(
  "placements",
  {
    id: pk(),
    code: text().notNull(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id),
    offerId: uuid().references(() => offers.id),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    organizationId: uuid().references(() => organizations.id),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id),
    partnerOrganizationId: uuid().references(() => organizations.id),
    replacementForPlacementId: uuid(),
    /** Date of selection / offer acceptance. */
    placedOn: date({ mode: "string" }).notNull(),
    joinedOn: date({ mode: "string" }),
    countryCode: countryCode().references(() => countries.code),
    workLocation: text(),
    status: text({ enum: PLACEMENT_STATUSES }).notNull().default("pending_joining"),
    /** End of the free-replacement guarantee period (contract terms). */
    replacementDeadline: date({ mode: "string" }),
    salaryMinor: moneyMinor(),
    salaryCurrency: currencyCode().references(() => currencies.code),
    salaryPeriod: text({ enum: SALARY_PERIODS }),
    feeMinor: moneyMinor(),
    feeCurrency: currencyCode().references(() => currencies.code),
    /** Soft reference → commercial.invoices.id (layer 13, later). */
    invoiceId: uuid(),
    cancelledAt: tstz(),
    cancellationReason: text(),
    completedAt: tstz(),
    /** Internal. */
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("placements_code_uq").on(t.code),
    uniqueIndex("placements_application_uq").on(t.applicationId),
    index("placements_offer_idx").on(t.offerId),
    index("placements_candidate_idx").on(t.candidateId),
    index("placements_org_status_idx").on(t.organizationId, t.status),
    index("placements_job_idx").on(t.jobId),
    index("placements_partner_idx").on(t.partnerOrganizationId, t.placedOn),
    index("placements_replacement_for_idx").on(t.replacementForPlacementId),
    index("placements_country_idx").on(t.countryCode),
    index("placements_salary_currency_idx").on(t.salaryCurrency),
    index("placements_fee_currency_idx").on(t.feeCurrency),
    index("placements_status_idx").on(t.status, t.placedOn),
    foreignKey({ columns: [t.replacementForPlacementId], foreignColumns: [t.id], name: "placements_replacement_for_fk" }).onDelete("set null"),
    check("placements_joined_chk", sql`${t.joinedOn} >= ${t.placedOn}`),
    check(
      "placements_salary_chk",
      sql`${t.salaryMinor} is null or (${t.salaryMinor} >= 0 and ${t.salaryCurrency} is not null and ${t.salaryPeriod} is not null)`,
    ),
    check("placements_fee_chk", sql`${t.feeMinor} is null or (${t.feeMinor} >= 0 and ${t.feeCurrency} is not null)`),
    check("placements_replacement_chk", sql`${t.replacementForPlacementId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------------------
// Mobilisation (overseas deployment)
// ---------------------------------------------------------------------------

/**
 * Overseas deployment of a placement (code VSG-MOB-xxxxxx): medical, visa, India emigration
 * clearance (eMigrate, ECR passports), pre-departure orientation (PDOS), travel and arrival.
 * Privacy: the visa number is encrypted (+ last 4); medical fields hold the fitness outcome only,
 * never diagnoses. `candidateInstructions` is candidate-facing; `notes` is internal.
 */
export const mobilisationRecords = pgTable(
  "mobilisation_records",
  {
    id: pk(),
    code: text().notNull(),
    placementId: uuid()
      .notNull()
      .references(() => placements.id, { onDelete: "cascade" }),
    status: text({ enum: MOBILISATION_STATUSES }).notNull().default("not_started"),
    /** Why the record is on hold / cancelled. */
    statusReason: text(),
    destinationCountryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    /** Destination-specific visa category as issued (e.g. employment visa). */
    visaType: text(),
    visaStatus: text({ enum: MOBILISATION_VISA_STATUSES }).notNull().default("not_started"),
    /** encryptField(visaNumber). */
    visaNumberEncrypted: text(),
    visaNumberLast4: text(),
    visaIssuedOn: date({ mode: "string" }),
    visaExpiresOn: date({ mode: "string" }),
    medicalStatus: text({ enum: MOBILISATION_MEDICAL_STATUSES }).notNull().default("pending"),
    medicalCompletedOn: date({ mode: "string" }),
    medicalValidUntil: date({ mode: "string" }),
    emigrationClearanceStatus: text({ enum: EMIGRATION_CLEARANCE_STATUSES }).notNull().default("not_assessed"),
    /** eMigrate application / clearance reference. */
    emigrationClearanceReference: text(),
    emigrationClearedOn: date({ mode: "string" }),
    /** Pre-Departure Orientation (PDOS) completed by the worker. */
    pdosCompleted: boolean().notNull().default(false),
    pdosCompletedOn: date({ mode: "string" }),
    travelDate: date({ mode: "string" }),
    flightDetails: text(),
    departedAt: tstz(),
    arrivedAt: tstz(),
    accommodationDetails: text(),
    /** Arrival / reporting instructions shown to the candidate. */
    candidateInstructions: text(),
    coordinatorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    completedAt: tstz(),
    /** Internal. */
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("mobilisation_records_code_uq").on(t.code),
    uniqueIndex("mobilisation_records_placement_uq").on(t.placementId),
    index("mobilisation_records_destination_idx").on(t.destinationCountryCode),
    index("mobilisation_records_coordinator_idx").on(t.coordinatorUserId, t.status),
    index("mobilisation_records_status_idx").on(t.status, t.travelDate),
    check("mobilisation_records_visa_last4_chk", sql`char_length(${t.visaNumberLast4}) <= 4`),
    check("mobilisation_records_visa_dates_chk", sql`${t.visaExpiresOn} >= ${t.visaIssuedOn}`),
    check("mobilisation_records_travel_chk", sql`${t.arrivedAt} >= ${t.departedAt}`),
    check("mobilisation_records_pdos_chk", sql`${t.pdosCompleted} or ${t.pdosCompletedOn} is null`),
  ],
);

/**
 * Checklist driving a mobilisation (passport copy, medical certificate, visa, emigration
 * clearance, insurance, tickets, orientation...). Items may be candidate-visible (with the
 * responsible party shown) or internal. Files are private mobilisation documents.
 */
export const mobilisationChecklistItems = pgTable(
  "mobilisation_checklist_items",
  {
    id: pk(),
    /** FK: mobilisation_checklist_items_mobilisation_fk (cascade). */
    mobilisationId: uuid().notNull(),
    /** Template key for standard items (unique per mobilisation), null for ad-hoc items. */
    key: text(),
    item: text().notNull(),
    description: text(),
    category: text({ enum: MOBILISATION_CHECKLIST_CATEGORIES }).notNull().default("document"),
    status: text({ enum: MOBILISATION_CHECKLIST_STATUSES }).notNull().default("pending"),
    responsibleParty: text({ enum: MOBILISATION_RESPONSIBLE_PARTIES }).notNull().default("venkat_sai"),
    isRequired: boolean().notNull().default(true),
    isCandidateVisible: boolean().notNull().default(true),
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    dueDate: date({ mode: "string" }),
    completedAt: tstz(),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    rejectionReason: text(),
    /** Internal. */
    notes: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("mobilisation_checklist_items_mobilisation_idx").on(t.mobilisationId, t.sortOrder),
    foreignKey({ columns: [t.mobilisationId], foreignColumns: [mobilisationRecords.id], name: "mobilisation_checklist_items_mobilisation_fk" }).onDelete(
      "cascade",
    ),
    unique("mobilisation_checklist_items_key_uq").on(t.mobilisationId, t.key),
    index("mobilisation_checklist_items_file_idx").on(t.fileId),
    index("mobilisation_checklist_items_verified_by_idx").on(t.verifiedByUserId),
    index("mobilisation_checklist_items_due_idx")
      .on(t.dueDate)
      .where(sql`${t.status} in ('pending', 'rejected')`),
  ],
);

// ---------------------------------------------------------------------------
// Recruitment partners
// ---------------------------------------------------------------------------

/**
 * A requirement and/or job assigned to a recruitment partner, with targets, limits and the partner's
 * own commission terms. At most one open (active / paused) assignment per partner and target.
 * `instructions` is partner-visible; `internalNotes` is staff-only. Partners never see other
 * partners' assignments or Venkat Sai's commercial terms with the employer.
 */
export const partnerAssignments = pgTable(
  "partner_assignments",
  {
    id: pk(),
    partnerOrganizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    requirementId: uuid().references(() => requirementRequests.id),
    jobId: uuid().references(() => jobs.id),
    assignedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    status: text({ enum: PARTNER_ASSIGNMENT_STATUSES }).notNull().default("active"),
    positionsTarget: integer(),
    /** Maximum submissions the partner may make (null = no limit). */
    submissionLimit: integer(),
    commissionTerms: jsonb().$type<PartnerCommissionTerms>().notNull().default(emptyJsonObject),
    dueDate: date({ mode: "string" }),
    instructions: text(),
    internalNotes: text(),
    revokedAt: tstz(),
    revocationReason: text(),
    completedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    // Target of the composite FK from partner_submissions (submission partner = assignment partner).
    unique("partner_assignments_id_partner_uq").on(t.id, t.partnerOrganizationId),
    index("partner_assignments_partner_idx").on(t.partnerOrganizationId, t.status),
    index("partner_assignments_requirement_idx").on(t.requirementId),
    index("partner_assignments_job_idx").on(t.jobId),
    index("partner_assignments_assigned_by_idx").on(t.assignedByUserId),
    // The plain column is written as SQL too: drizzle-kit treats every column of an index that has an
    // expression as an expression, so a bare column here would make every push re-create the index.
    uniqueIndex("partner_assignments_open_uq")
      .on(sql`${t.partnerOrganizationId}`, sql`coalesce(${t.requirementId}, ${NIL_UUID})`, sql`coalesce(${t.jobId}, ${NIL_UUID})`)
      .where(sql`${t.status} in ('active', 'paused')`),
    check("partner_assignments_target_chk", sql`${t.requirementId} is not null or ${t.jobId} is not null`),
    check("partner_assignments_limits_chk", sql`${t.positionsTarget} > 0 and ${t.submissionLimit} > 0`),
  ],
);

/**
 * A candidate submitted by a partner against an assignment (code VSG-SUB-xxxxxx). Requires the
 * candidate's consent (consent ledger row, purpose partner_submission): a submission cannot be
 * accepted without it (CHECK). `candidateConfirmedAt` is set when the candidate confirmed the
 * submission themselves (otherwise the consent was captured by the partner). Accepted submissions
 * create an application (source = partner). `reviewNotes` is internal; `partnerFeedback` is what the
 * partner sees.
 */
export const partnerSubmissions = pgTable(
  "partner_submissions",
  {
    id: pk(),
    code: text().notNull(),
    assignmentId: uuid().notNull(),
    partnerOrganizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    submittedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    /** Target job when the assignment covers a requirement with several jobs. */
    jobId: uuid().references(() => jobs.id),
    /** Created once the submission is accepted. */
    applicationId: uuid().references(() => applications.id, { onDelete: "set null" }),
    status: text({ enum: PARTNER_SUBMISSION_STATUSES }).notNull().default("submitted"),
    /** The partner's pitch / notes for Venkat Sai. */
    partnerNotes: text(),
    consentRecordId: uuid().references(() => consentRecords.id, { onDelete: "set null" }),
    candidateConfirmedAt: tstz(),
    /** Existing profile this submission duplicates. FK: partner_submissions_duplicate_of_fk. */
    duplicateOfCandidateId: uuid(),
    reviewNotes: text(),
    partnerFeedback: text(),
    rejectionReasonCode: text({ enum: APPLICATION_REJECTION_REASONS }),
    reviewedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: tstz(),
    withdrawnAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("partner_submissions_code_uq").on(t.code),
    unique("partner_submissions_assignment_candidate_uq").on(t.assignmentId, t.candidateId),
    foreignKey({
      columns: [t.assignmentId, t.partnerOrganizationId],
      foreignColumns: [partnerAssignments.id, partnerAssignments.partnerOrganizationId],
      name: "partner_submissions_assignment_partner_fk",
    }),
    index("partner_submissions_partner_idx").on(t.partnerOrganizationId, t.status, t.createdAt),
    index("partner_submissions_submitted_by_idx").on(t.submittedByUserId),
    index("partner_submissions_candidate_idx").on(t.candidateId),
    index("partner_submissions_job_idx").on(t.jobId),
    uniqueIndex("partner_submissions_application_uq").on(t.applicationId),
    index("partner_submissions_consent_idx").on(t.consentRecordId),
    index("partner_submissions_duplicate_of_idx").on(t.duplicateOfCandidateId),
    foreignKey({ columns: [t.duplicateOfCandidateId], foreignColumns: [candidateProfiles.id], name: "partner_submissions_duplicate_of_fk" }).onDelete("set null"),
    index("partner_submissions_reviewed_by_idx").on(t.reviewedByUserId),
    // Staff review queue.
    index("partner_submissions_review_queue_idx")
      .on(t.createdAt)
      .where(sql`${t.status} in ('submitted', 'under_review')`),
    check("partner_submissions_consent_chk", sql`${t.status} <> 'accepted' or ${t.consentRecordId} is not null`),
  ],
);

/**
 * Which partner "owns" a candidate for commission purposes (spec 10.4): the first partner to submit a
 * candidate not already known to the platform holds attribution until expiresAt. At most one active
 * attribution per candidate; competing claims are recorded as `disputed` rows and resolved by staff.
 */
export const candidateAttributions = pgTable(
  "candidate_attributions",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    /** FK: candidate_attributions_partner_fk (restrict). */
    partnerOrganizationId: uuid().notNull(),
    /** Submission that established the attribution. FK: candidate_attributions_first_submission_fk. */
    firstSubmissionId: uuid(),
    firstSubmittedAt: tstz().notNull(),
    expiresAt: tstz(),
    status: text({ enum: CANDIDATE_ATTRIBUTION_STATUSES }).notNull().default("active"),
    resolutionNotes: text(),
    resolvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("candidate_attributions_active_uq").on(t.candidateId).where(sql`${t.status} = 'active'`),
    index("candidate_attributions_candidate_idx").on(t.candidateId, t.createdAt),
    index("candidate_attributions_partner_idx").on(t.partnerOrganizationId, t.status),
    index("candidate_attributions_first_submission_idx").on(t.firstSubmissionId),
    index("candidate_attributions_resolved_by_idx").on(t.resolvedByUserId),
    foreignKey({ columns: [t.partnerOrganizationId], foreignColumns: [organizations.id], name: "candidate_attributions_partner_fk" }),
    foreignKey({ columns: [t.firstSubmissionId], foreignColumns: [partnerSubmissions.id], name: "candidate_attributions_first_submission_fk" }).onDelete(
      "set null",
    ),
    // Expiry task.
    index("candidate_attributions_expiry_idx").on(t.expiresAt).where(sql`${t.status} = 'active'`),
    check("candidate_attributions_window_chk", sql`${t.expiresAt} > ${t.firstSubmittedAt}`),
  ],
);

/**
 * Possible duplicate candidate profiles for staff review (one row per unordered pair). Raised by the
 * matcher (email, phone, passport hash / last 4, name + date of birth), by staff, or by a partner
 * submission. Matching data is used only for de-duplication, never for ranking.
 */
export const duplicateFlags = pgTable(
  "duplicate_flags",
  {
    id: pk(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    /** FK: duplicate_flags_possible_duplicate_fk (cascade). */
    possibleDuplicateCandidateId: uuid().notNull(),
    matchedOn: text({ enum: DUPLICATE_MATCH_FIELDS }).array().notNull(),
    /** Match confidence 0–100. */
    score: smallint(),
    source: text({ enum: DUPLICATE_FLAG_SOURCES }).notNull().default("system"),
    partnerSubmissionId: uuid().references(() => partnerSubmissions.id, { onDelete: "set null" }),
    status: text({ enum: DUPLICATE_FLAG_STATUSES }).notNull().default("open"),
    resolvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    resolutionNotes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("duplicate_flags_pair_uq").on(
      sql`least(${t.candidateId}, ${t.possibleDuplicateCandidateId})`,
      sql`greatest(${t.candidateId}, ${t.possibleDuplicateCandidateId})`,
    ),
    index("duplicate_flags_candidate_idx").on(t.candidateId),
    index("duplicate_flags_possible_duplicate_idx").on(t.possibleDuplicateCandidateId),
    foreignKey({ columns: [t.possibleDuplicateCandidateId], foreignColumns: [candidateProfiles.id], name: "duplicate_flags_possible_duplicate_fk" }).onDelete(
      "cascade",
    ),
    index("duplicate_flags_partner_submission_idx").on(t.partnerSubmissionId),
    index("duplicate_flags_resolved_by_idx").on(t.resolvedByUserId),
    index("duplicate_flags_status_idx").on(t.status, t.createdAt),
    check("duplicate_flags_distinct_chk", sql`${t.candidateId} <> ${t.possibleDuplicateCandidateId}`),
    check("duplicate_flags_matched_on_chk", sql`cardinality(${t.matchedOn}) > 0`),
    check("duplicate_flags_score_chk", sql`${t.score} between 0 and 100`),
  ],
);
