/**
 * Training, assessment and credential domain: institution profiles, courses and batches, enrolments
 * with attendance and course assessments, Venkat Sai assessment centres and trade / welding /
 * practical skill assessments, certificates (with an explicit issuer type), campus drives,
 * internship programmes and placement outcomes.
 * Layer 11 — may import: taxonomy, core, identity, organizations, system, employers, partners,
 * candidates, operations, jobs.
 *
 * Honesty rules encoded in this schema:
 *  - certificates.issuerType is explicit and checked: a Venkat Sai assessment / training result
 *    ("venkat_sai") is never an externally accredited qualification ("accredited_external").
 *  - Skill-assessment process / position / standard references are free text describing how a test was
 *    set up (e.g. "ASME IX 6G GTAW"); they never imply an external certification.
 *  - Fees and stipends carry an explicit type, so "free" or "unpaid" is never confused with "on request"
 *    or "not disclosed".
 *  - Placement outcomes are self-reported until verified; public figures may use verified rows only.
 *
 * Candidate-linked business records (enrolments, skill assessments, certificates, placement outcomes)
 * use the default RESTRICT on candidateId: erasing a candidate profile must go through the privacy
 * workflow, which deletes or anonymises these rows deliberately (certificates may be retained for
 * verification where the law allows), instead of losing them silently.
 */
import { sql, type SQL } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { EMPLOYMENT_TYPES, SALARY_PERIODS, WORK_MODES } from "./_constants";
import { countryCode, currencyCode, emptyJsonObject, moneyMinor, pk, timestamps, tstz, tsvector } from "./_shared";
import { candidateProfiles } from "./candidates";
import { files, organizations, users } from "./core";
import { jobs } from "./jobs";
import { requirementRequests } from "./operations";
import { countries, currencies, skills } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

// ---------------------------------------------------------------------------
// Institution profile
// ---------------------------------------------------------------------------

export const INSTITUTION_KINDS = [
  "college",
  "university",
  "polytechnic",
  "iti",
  "training_centre",
  "skill_assessment_provider",
  "technical_institute",
  "corporate_academy",
  "internship_provider",
  "other",
] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/**
 * Institution-specific profile, 1:1 with an organization of type "institution".
 * accreditationBodies and affiliation are self-declared until staff verify the supporting
 * organization_documents. isAuthorisedCertificateIssuer is set only by Venkat Sai staff after verifying
 * the institution's accreditation; without it (or once authorisedUntil has passed) the institution
 * cannot issue certificates through the platform. Placement-officer fields are business contacts
 * shown to staff and participating employers only. aboutHtml is sanitised on write.
 */
export const institutionProfiles = pgTable(
  "institution_profiles",
  {
    organizationId: uuid()
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    institutionKind: text({ enum: INSTITUTION_KINDS }),
    /** Self-declared accreditation / recognition bodies (verified through organization_documents). */
    accreditationBodies: text().array().notNull().$defaultFn(() => []),
    /** University / board affiliation as declared. */
    affiliation: text(),
    establishedYear: integer(),
    studentCapacity: integer(),
    campusAddress: text(),
    /** Sanitised rich text for the public institution page. */
    aboutHtml: text(),
    /** Public cover image (visibility public). */
    coverFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    placementOfficerName: text(),
    placementOfficerEmail: text(),
    placementOfficerPhone: text(),
    isAuthorisedCertificateIssuer: boolean().notNull().default(false),
    /** What the institution is authorised to certify, as verified by staff. */
    authorisedIssuerScope: text(),
    authorisedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    authorisedAt: tstz(),
    /** Authorisation lapses after this date (e.g. accreditation expiry); null = until revoked. */
    authorisedUntil: date(),
    ...timestamps,
  },
  (t) => [
    index("institution_profiles_cover_file_idx").on(t.coverFileId),
    index("institution_profiles_authorised_by_idx").on(t.authorisedByUserId),
    check("institution_profiles_established_year_chk", sql`${t.establishedYear} between 1800 and 2100`),
    check("institution_profiles_capacity_chk", sql`${t.studentCapacity} >= 0`),
    check("institution_profiles_authorised_chk", sql`not ${t.isAuthorisedCertificateIssuer} or ${t.authorisedAt} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const COURSE_CATEGORIES = ["technical", "industrial", "welding", "safety", "language", "soft_skills", "it", "other"] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

/** Delivery mode of courses and batches. */
export const COURSE_MODES = ["in_person", "online", "hybrid"] as const;
export type CourseMode = (typeof COURSE_MODES)[number];

/** "fixed" requires feeMinor + feeCurrency; "free" and "on_request" carry no amount. */
export const COURSE_FEE_TYPES = ["free", "fixed", "on_request"] as const;
export type CourseFeeType = (typeof COURSE_FEE_TYPES)[number];

/** What a learner can earn. Must match the certificates actually issued for the course. */
export const COURSE_CERTIFICATION_TYPES = ["venkat_sai_assessment", "accredited_external", "completion_only", "none"] as const;
export type CourseCertificationType = (typeof COURSE_CERTIFICATION_TYPES)[number];

export const COURSE_STATUSES = ["draft", "pending_approval", "changes_requested", "published", "rejected", "archived"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

/**
 * Training programmes. organizationId null = a Venkat Sai course (e.g. welding training at the
 * workshop); otherwise the owning institution. Institution courses are published through the approval
 * inbox (approval type course_publication). accreditationBody is required for "accredited_external".
 * descriptionHtml is sanitised on write. Soft-deleted (deletedAt); hard deletes are blocked once
 * batches or certificates reference the course.
 */
export const courses = pgTable(
  "courses",
  {
    id: pk(),
    /** VSG-CRS-000123 (nextCode("CRS")). */
    code: text().notNull(),
    organizationId: uuid().references(() => organizations.id),
    slug: text().notNull(),
    title: text().notNull(),
    summary: text(),
    descriptionHtml: text(),
    category: text({ enum: COURSE_CATEGORIES }).notNull(),
    /** Soft references to skills.id taught by the course. */
    skillIds: uuid().array().notNull().$defaultFn(() => []),
    mode: text({ enum: COURSE_MODES }).notNull().default("in_person"),
    durationHours: integer(),
    durationWeeks: integer(),
    eligibility: text(),
    prerequisites: text(),
    outcomes: text().array().notNull().$defaultFn(() => []),
    feeType: text({ enum: COURSE_FEE_TYPES }).notNull().default("on_request"),
    /** Minor units of feeCurrency; set only when feeType = "fixed". */
    feeMinor: moneyMinor(),
    feeCurrency: currencyCode().references(() => currencies.code),
    feeNotes: text(),
    /** Languages of instruction (languages.code, validated in code). */
    languageCodes: text().array().notNull().$defaultFn(() => []),
    certificationType: text({ enum: COURSE_CERTIFICATION_TYPES }).notNull().default("none"),
    accreditationBody: text(),
    /** Listing image (visibility public). */
    coverFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    status: text({ enum: COURSE_STATUSES }).notNull().default("draft"),
    publishedAt: tstz(),
    isFeatured: boolean().notNull().default(false),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple'::regconfig, coalesce(${courses.title}, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(${courses.summary}, '') || ' ' || coalesce(${courses.eligibility}, '') || ' ' || coalesce(${courses.accreditationBody}, '')), 'B')`,
    ),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("courses_code_uq").on(t.code),
    uniqueIndex("courses_slug_uq").on(t.slug),
    index("courses_org_idx").on(t.organizationId, t.status),
    // Public training catalogue.
    index("courses_public_idx").on(t.category, t.publishedAt).where(sql`status = 'published' and deleted_at is null`),
    index("courses_fee_currency_idx").on(t.feeCurrency),
    index("courses_cover_file_idx").on(t.coverFileId),
    index("courses_created_by_idx").on(t.createdByUserId),
    index("courses_search_idx").using("gin", t.searchVector),
    check("courses_duration_hours_chk", sql`${t.durationHours} > 0`),
    check("courses_duration_weeks_chk", sql`${t.durationWeeks} > 0`),
    check(
      "courses_fee_chk",
      sql`(${t.feeType} = 'fixed' and ${t.feeMinor} is not null and ${t.feeMinor} > 0 and ${t.feeCurrency} is not null) or (${t.feeType} <> 'fixed' and ${t.feeMinor} is null and ${t.feeCurrency} is null)`,
    ),
    check("courses_accreditation_body_chk", sql`${t.certificationType} <> 'accredited_external' or ${t.accreditationBody} is not null`),
    check("courses_published_chk", sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
  ],
);

/** Syllabus units of a course, ordered by sortOrder. Materials are shared with enrolled learners only. */
export const courseModules = pgTable(
  "course_modules",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    sortOrder: integer().notNull().default(0),
    durationHours: numeric({ precision: 6, scale: 2, mode: "number" }),
    /** Soft references to files.id (purpose course_material). */
    materialFileIds: uuid().array().notNull().$defaultFn(() => []),
    ...timestamps,
  },
  (t) => [
    index("course_modules_course_idx").on(t.courseId, t.sortOrder),
    check("course_modules_duration_chk", sql`${t.durationHours} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export const BATCH_STATUSES = ["planned", "open", "full", "in_progress", "completed", "cancelled"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/**
 * A scheduled run of a course. organizationId is the organisation running the batch (normally the
 * course owner; null = run by Venkat Sai), denormalised for query scoping. requirementId links batches
 * run for a workforce requirement (e.g. an employer's training request). enrolledCount is maintained by
 * the training service (confirmed + in-progress + completed enrolments). Hard deletes are blocked once
 * enrolments exist — cancel instead (cancellationReason is shown to enrolled learners).
 */
export const batches = pgTable(
  "batches",
  {
    id: pk(),
    /** VSG-BAT-000123 (nextCode("BAT")). */
    code: text().notNull(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id),
    organizationId: uuid().references(() => organizations.id),
    requirementId: uuid().references(() => requirementRequests.id, { onDelete: "set null" }),
    title: text().notNull(),
    startsOn: date(),
    endsOn: date(),
    /** Human-readable timetable, e.g. "Mon–Sat, 09:00–13:00". */
    schedule: text(),
    /** IANA timezone of the schedule. */
    timezone: text(),
    mode: text({ enum: COURSE_MODES }).notNull().default("in_person"),
    venue: text(),
    countryCode: countryCode().references(() => countries.code),
    city: text(),
    /** Null = no fixed seat limit. */
    capacity: integer(),
    enrolledCount: integer().notNull().default(0),
    status: text({ enum: BATCH_STATUSES }).notNull().default("planned"),
    registrationDeadline: date(),
    cancelledAt: tstz(),
    cancellationReason: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("batches_code_uq").on(t.code),
    index("batches_course_idx").on(t.courseId, t.startsOn),
    index("batches_org_idx").on(t.organizationId, t.status),
    index("batches_requirement_idx").on(t.requirementId),
    index("batches_country_idx").on(t.countryCode),
    index("batches_created_by_idx").on(t.createdByUserId),
    index("batches_status_starts_idx").on(t.status, t.startsOn),
    check("batches_dates_chk", sql`${t.endsOn} >= ${t.startsOn}`),
    check("batches_capacity_chk", sql`${t.capacity} > 0`),
    check("batches_enrolled_count_chk", sql`${t.enrolledCount} >= 0`),
    check("batches_cancelled_chk", sql`${t.status} <> 'cancelled' or ${t.cancelledAt} is not null`),
  ],
);

export const BATCH_INSTRUCTOR_ROLES = ["lead", "assistant", "guest"] as const;
export type BatchInstructorRole = (typeof BATCH_INSTRUCTOR_ROLES)[number];

/**
 * Instructors of a batch. userId links a platform user (an institution member with the instructor role,
 * or Venkat Sai staff) and drives "assigned batches" scoping for instructors; external instructors have
 * only a name. name is a display snapshot kept even if the user account is deleted.
 */
export const batchInstructors = pgTable(
  "batch_instructors",
  {
    id: pk(),
    batchId: uuid()
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    bio: text(),
    role: text({ enum: BATCH_INSTRUCTOR_ROLES }).notNull().default("lead"),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("batch_instructors_batch_user_uq").on(t.batchId, t.userId), index("batch_instructors_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Enrolments, attendance and course assessments
// ---------------------------------------------------------------------------

export const ENROLMENT_STATUSES = ["applied", "confirmed", "waitlisted", "rejected", "in_progress", "completed", "dropped", "cancelled"] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

/** Who created the enrolment. */
export const ENROLMENT_SOURCES = ["self", "institution", "venkat_sai", "partner", "import"] as const;
export type EnrolmentSource = (typeof ENROLMENT_SOURCES)[number];

export const ENROLMENT_FEE_STATUSES = ["not_applicable", "pending", "paid", "waived", "refunded"] as const;
export type EnrolmentFeeStatus = (typeof ENROLMENT_FEE_STATUSES)[number];

/** `not_applicable` for courses without an assessed result (completion only / none). */
export const ENROLMENT_RESULT_STATUSES = ["pending", "passed", "failed", "not_applicable"] as const;
export type EnrolmentResultStatus = (typeof ENROLMENT_RESULT_STATUSES)[number];

/**
 * A candidate's place in a batch (one per candidate and batch; re-applying reactivates the row).
 * Visible to the candidate, the organisation running the batch and staff with training permissions.
 * feeMinor / feeCurrency snapshot the fee at enrolment (course fees may change later); payments live in
 * the commercial domain and paymentReference is a soft reference (payment code or offline receipt no.).
 * attendancePercent and finalScore are percentages maintained by the training service.
 */
export const enrolments = pgTable(
  "enrolments",
  {
    id: pk(),
    batchId: uuid()
      .notNull()
      .references(() => batches.id),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    status: text({ enum: ENROLMENT_STATUSES }).notNull().default("applied"),
    source: text({ enum: ENROLMENT_SOURCES }).notNull().default("self"),
    enrolledByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    appliedAt: tstz().notNull().defaultNow(),
    confirmedAt: tstz(),
    completedAt: tstz(),
    cancelledAt: tstz(),
    /** Candidate-visible reason for a rejection, drop or cancellation (internal notes go to internal_notes). */
    statusReason: text(),
    feeStatus: text({ enum: ENROLMENT_FEE_STATUSES }).notNull().default("not_applicable"),
    feeMinor: moneyMinor(),
    feeCurrency: currencyCode().references(() => currencies.code),
    paymentReference: text(),
    attendancePercent: numeric({ precision: 5, scale: 2, mode: "number" }),
    finalScore: numeric({ precision: 5, scale: 2, mode: "number" }),
    resultStatus: text({ enum: ENROLMENT_RESULT_STATUSES }).notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    unique("enrolments_batch_candidate_uq").on(t.batchId, t.candidateId),
    index("enrolments_batch_status_idx").on(t.batchId, t.status),
    index("enrolments_candidate_idx").on(t.candidateId, t.status),
    index("enrolments_enrolled_by_idx").on(t.enrolledByUserId),
    index("enrolments_fee_currency_idx").on(t.feeCurrency),
    check("enrolments_fee_chk", sql`(${t.feeMinor} is null) = (${t.feeCurrency} is null) and (${t.feeMinor} is null or ${t.feeMinor} >= 0)`),
    check("enrolments_attendance_chk", sql`${t.attendancePercent} between 0 and 100`),
    check("enrolments_final_score_chk", sql`${t.finalScore} between 0 and 100`),
    check("enrolments_completed_chk", sql`${t.status} <> 'completed' or ${t.completedAt} is not null`),
  ],
);

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** One class / practical session of a batch for which attendance is taken. */
export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: pk(),
    batchId: uuid()
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    sessionDate: date().notNull(),
    topic: text(),
    /** Syllabus unit covered, if any. */
    courseModuleId: uuid().references(() => courseModules.id, { onDelete: "set null" }),
    durationHours: numeric({ precision: 5, scale: 2, mode: "number" }),
    recordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("attendance_sessions_batch_idx").on(t.batchId, t.sessionDate),
    index("attendance_sessions_module_idx").on(t.courseModuleId),
    index("attendance_sessions_recorded_by_idx").on(t.recordedByUserId),
    check("attendance_sessions_duration_chk", sql`${t.durationHours} > 0`),
  ],
);

/**
 * Attendance of one enrolment at one session. The service guarantees the session and the enrolment
 * belong to the same batch. Corrections update the row (history is in audit_logs).
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "cascade" }),
    enrolmentId: uuid()
      .notNull()
      .references(() => enrolments.id, { onDelete: "cascade" }),
    status: text({ enum: ATTENDANCE_STATUSES }).notNull(),
    remarks: text(),
    recordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("attendance_records_session_enrolment_uq").on(t.sessionId, t.enrolmentId),
    index("attendance_records_enrolment_idx").on(t.enrolmentId),
    index("attendance_records_recorded_by_idx").on(t.recordedByUserId),
  ],
);

export const COURSE_ASSESSMENT_TYPES = ["theory", "practical", "viva", "project"] as const;
export type CourseAssessmentType = (typeof COURSE_ASSESSMENT_TYPES)[number];

/**
 * Tests, practicals, vivas and projects within a batch. Learners see their scores only once
 * resultsPublishedAt is set. weightPercent is the share of the batch's final score.
 */
export const courseAssessments = pgTable(
  "course_assessments",
  {
    id: pk(),
    batchId: uuid()
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    title: text().notNull(),
    type: text({ enum: COURSE_ASSESSMENT_TYPES }).notNull(),
    maxScore: numeric({ precision: 7, scale: 2, mode: "number" }).notNull(),
    passScore: numeric({ precision: 7, scale: 2, mode: "number" }),
    weightPercent: numeric({ precision: 5, scale: 2, mode: "number" }),
    scheduledAt: tstz(),
    resultsPublishedAt: tstz(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("course_assessments_batch_idx").on(t.batchId, t.scheduledAt),
    index("course_assessments_created_by_idx").on(t.createdByUserId),
    check("course_assessments_max_score_chk", sql`${t.maxScore} > 0`),
    check("course_assessments_pass_score_chk", sql`${t.passScore} between 0 and ${t.maxScore}`),
    check("course_assessments_weight_chk", sql`${t.weightPercent} between 0 and 100`),
  ],
);

/**
 * One learner's score in a course assessment (score <= the assessment's maxScore is enforced by the
 * service). remarks are visible to the learner once results are published.
 */
export const assessmentScores = pgTable(
  "assessment_scores",
  {
    id: pk(),
    assessmentId: uuid()
      .notNull()
      .references(() => courseAssessments.id, { onDelete: "cascade" }),
    enrolmentId: uuid()
      .notNull()
      .references(() => enrolments.id, { onDelete: "cascade" }),
    /** Null while unmarked or when absent. */
    score: numeric({ precision: 7, scale: 2, mode: "number" }),
    isAbsent: boolean().notNull().default(false),
    passed: boolean(),
    remarks: text(),
    recordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("assessment_scores_assessment_enrolment_uq").on(t.assessmentId, t.enrolmentId),
    index("assessment_scores_enrolment_idx").on(t.enrolmentId),
    index("assessment_scores_recorded_by_idx").on(t.recordedByUserId),
    check("assessment_scores_score_chk", sql`${t.score} >= 0`),
    check("assessment_scores_absent_chk", sql`not ${t.isAbsent} or ${t.score} is null`),
  ],
);

// ---------------------------------------------------------------------------
// Venkat Sai assessment centres and skill assessments
// ---------------------------------------------------------------------------

/**
 * Venkat Sai testing facilities where skill assessments take place. capabilities lists the processes
 * and set-ups available (e.g. "SMAW", "GTAW", "FCAW", "Pipe 6G") — a description of equipment, not an
 * accreditation. Entered by staff for real facilities only (never seeded with sample data).
 * Deactivate with isActive; hard deletes are blocked once assessments reference a centre.
 */
export const assessmentCentres = pgTable(
  "assessment_centres",
  {
    id: pk(),
    name: text().notNull(),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    stateRegion: text(),
    city: text().notNull(),
    addressLine1: text(),
    addressLine2: text(),
    postalCode: text(),
    /** IANA timezone used to show assessment times. */
    timezone: text(),
    capabilities: text().array().notNull().$defaultFn(() => []),
    contactPhone: text(),
    contactEmail: text(),
    /** What candidates must bring or know (included in scheduling notifications). */
    candidateInstructions: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("assessment_centres_name_uq").on(t.name), index("assessment_centres_country_idx").on(t.countryCode, t.city)],
);

export const SKILL_ASSESSMENT_TYPES = ["trade_test", "practical", "theory", "interview", "medical_fitness_note"] as const;
export type SkillAssessmentType = (typeof SKILL_ASSESSMENT_TYPES)[number];

export const SKILL_ASSESSMENT_STATUSES = ["scheduled", "completed", "no_show", "cancelled"] as const;
export type SkillAssessmentStatus = (typeof SKILL_ASSESSMENT_STATUSES)[number];

/** `retest` = the candidate should be re-assessed (a new row with retestOfAssessmentId). */
export const SKILL_ASSESSMENT_RESULTS = ["pending", "pass", "fail", "retest"] as const;
export type SkillAssessmentResult = (typeof SKILL_ASSESSMENT_RESULTS)[number];

/**
 * Venkat Sai trade / welding / practical tests of a candidate (e.g. a 6G GTAW pipe test).
 * process, position, standardReference and materialDetails are free text describing how the test was
 * set up; they never imply an external certification. A retest is a new row that points at the
 * previous attempt (retestOfAssessmentId) with attemptNumber + 1. Certificates issued from an
 * assessment reference it via certificates.skillAssessmentId (the authoritative link).
 * Privacy: visible to the candidate (results once resultPublishedAt is set), to staff with
 * recruitment.assessments, and to employers only through an application or consented share.
 * internalNotes are staff-only. "medical_fitness_note" rows record only a fit / not-fit note — never
 * diagnoses or medical documents (those belong in candidate_documents with stricter access).
 */
export const skillAssessments = pgTable(
  "skill_assessments",
  {
    id: pk(),
    /** VSG-ASM-000123 (nextCode("ASM")). */
    code: text().notNull(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    /** Null when held elsewhere (employer site, video call); see `location`. */
    assessmentCentreId: uuid().references(() => assessmentCentres.id),
    /** Soft reference → recruitment.applications (later layer). */
    applicationId: uuid(),
    requirementId: uuid().references(() => requirementRequests.id, { onDelete: "set null" }),
    /** Final assessment of a training enrolment, if any. */
    enrolmentId: uuid().references(() => enrolments.id, { onDelete: "set null" }),
    /** Trade assessed, e.g. "Pipe welder", "Fabricator", "Electrician". */
    trade: text().notNull(),
    skillId: uuid().references(() => skills.id, { onDelete: "set null" }),
    assessmentType: text({ enum: SKILL_ASSESSMENT_TYPES }).notNull().default("trade_test"),
    /** e.g. "GTAW", "SMAW", "GTAW root + SMAW fill" (free text). */
    process: text(),
    /** e.g. "6G", "3G", "2F" (free text). */
    position: text(),
    /** Standard / procedure the test followed, e.g. "ASME IX", "WPS-012" (free text; not a certification claim). */
    standardReference: text(),
    /** Base material, thickness, diameter, consumables (free text). */
    materialDetails: text(),
    /** How the work was evaluated, e.g. "visual", "bend test", "radiography" (free-text tags). */
    evaluationMethods: text().array().notNull().$defaultFn(() => []),
    /** Venue when not at an assessment centre. */
    location: text(),
    scheduledAt: tstz().notNull(),
    scheduledByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    assessorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Assessor display name (snapshot; also used for external assessors without an account). */
    assessorName: text(),
    status: text({ enum: SKILL_ASSESSMENT_STATUSES }).notNull().default("scheduled"),
    result: text({ enum: SKILL_ASSESSMENT_RESULTS }).notNull().default("pending"),
    score: numeric({ precision: 7, scale: 2, mode: "number" }),
    maxScore: numeric({ precision: 7, scale: 2, mode: "number" }),
    /** Feedback shown to the candidate once the result is published. */
    remarks: text(),
    /** Staff-only notes, never shown to candidates, employers or partners. */
    internalNotes: text(),
    /** Soft references to private files.id (photos of test pieces, inspection reports). */
    evidenceFileIds: uuid().array().notNull().$defaultFn(() => []),
    completedAt: tstz(),
    resultPublishedAt: tstz(),
    attemptNumber: integer().notNull().default(1),
    /** The earlier attempt this row re-assesses. */
    retestOfAssessmentId: uuid(),
    /** Earliest date a retest may be taken. */
    retestAvailableFrom: date(),
    cancelledAt: tstz(),
    /** Shown to the candidate when an assessment is cancelled. */
    cancellationReason: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("skill_assessments_code_uq").on(t.code),
    index("skill_assessments_candidate_idx").on(t.candidateId, t.scheduledAt),
    index("skill_assessments_centre_idx").on(t.assessmentCentreId, t.scheduledAt),
    index("skill_assessments_application_idx").on(t.applicationId),
    index("skill_assessments_requirement_idx").on(t.requirementId),
    index("skill_assessments_enrolment_idx").on(t.enrolmentId),
    index("skill_assessments_skill_idx").on(t.skillId),
    index("skill_assessments_scheduled_by_idx").on(t.scheduledByUserId),
    index("skill_assessments_assessor_idx").on(t.assessorUserId, t.scheduledAt),
    index("skill_assessments_status_idx").on(t.status, t.scheduledAt),
    index("skill_assessments_retest_of_idx").on(t.retestOfAssessmentId),
    foreignKey({ columns: [t.retestOfAssessmentId], foreignColumns: [t.id], name: "skill_assessments_retest_of_fk" }).onDelete("set null"),
    check("skill_assessments_max_score_chk", sql`${t.maxScore} > 0`),
    check("skill_assessments_score_chk", sql`${t.score} >= 0 and ${t.score} <= ${t.maxScore}`),
    check("skill_assessments_attempt_chk", sql`${t.attemptNumber} >= 1`),
    check("skill_assessments_completed_chk", sql`${t.status} <> 'completed' or ${t.completedAt} is not null`),
    check("skill_assessments_cancelled_chk", sql`${t.status} <> 'cancelled' or ${t.cancelledAt} is not null`),
    // A pass / fail / retest result exists only for a completed assessment.
    check("skill_assessments_result_chk", sql`${t.result} = 'pending' or ${t.status} = 'completed'`),
    check("skill_assessments_retest_of_chk", sql`${t.retestOfAssessmentId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/**
 * venkat_sai             — a Venkat Sai assessment or training result (issuerOrganizationId must be null:
 *                          Venkat Sai is the platform operator, not an organisation row).
 * accredited_external    — issued under an external accreditation / awarding body (accreditationBody required).
 * institution_completion — a completion certificate from an authorised institution (issuerOrganizationId required).
 */
export const CERTIFICATE_ISSUER_TYPES = ["venkat_sai", "accredited_external", "institution_completion"] as const;
export type CertificateIssuerType = (typeof CERTIFICATE_ISSUER_TYPES)[number];

export const CERTIFICATE_STATUSES = ["active", "revoked", "expired"] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/** Display details frozen at issue time, so later edits never change an issued certificate. */
export type CertificateSnapshot = {
  courseTitle?: string;
  courseCode?: string;
  batchCode?: string;
  durationHours?: number;
  trade?: string;
  process?: string;
  position?: string;
  standardReference?: string;
  assessedOn?: string;
  assessmentCentreName?: string;
  result?: string;
  grade?: string;
};

/**
 * Credentials issued through the platform. issuerType decides the wording on the certificate and on
 * the public verification page; Venkat Sai results are never presented as externally accredited
 * qualifications. verificationCode is a random, unguessable public lookup token — never the sequential
 * (guessable) `code`; rate-limit public lookups. The verification page shows only holderName, title,
 * issuer, dates and status, and nothing at all when
 * publicVerificationEnabled is false (e.g. after a privacy request). Certificates are never deleted:
 * revoke them (status, revokedAt, revokedReason) or re-issue a corrected one (replacesCertificateId).
 */
export const certificates = pgTable(
  "certificates",
  {
    id: pk(),
    /** VSG-CRT-000123 (nextCode("CRT")). */
    code: text().notNull(),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    /** Name printed on the certificate (snapshot at issue). */
    holderName: text().notNull(),
    issuerType: text({ enum: CERTIFICATE_ISSUER_TYPES }).notNull(),
    issuerOrganizationId: uuid().references(() => organizations.id),
    /** Issuer name as printed (snapshot at issue). */
    issuerName: text().notNull(),
    /** External accreditation / awarding body (required for "accredited_external"). */
    accreditationBody: text(),
    /** Number assigned by the external body, when it differs from `code`. */
    externalCertificateNumber: text(),
    courseId: uuid().references(() => courses.id),
    batchId: uuid().references(() => batches.id),
    enrolmentId: uuid().references(() => enrolments.id),
    skillAssessmentId: uuid().references(() => skillAssessments.id),
    title: text().notNull(),
    description: text(),
    snapshot: jsonb().$type<CertificateSnapshot>().notNull().default(emptyJsonObject),
    issuedAt: tstz().notNull().defaultNow(),
    expiresAt: tstz(),
    verificationCode: text().notNull(),
    publicVerificationEnabled: boolean().notNull().default(true),
    /** Generated PDF (purpose certificate); can be regenerated, so it is not kept alive by this row. */
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    status: text({ enum: CERTIFICATE_STATUSES }).notNull().default("active"),
    revokedAt: tstz(),
    revokedReason: text(),
    revokedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** The earlier certificate this one corrects (the earlier one is revoked). */
    replacesCertificateId: uuid(),
    issuedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("certificates_code_uq").on(t.code),
    uniqueIndex("certificates_verification_code_uq").on(t.verificationCode),
    index("certificates_candidate_idx").on(t.candidateId, t.issuedAt),
    index("certificates_issuer_org_idx").on(t.issuerOrganizationId, t.issuedAt),
    index("certificates_course_idx").on(t.courseId),
    index("certificates_batch_idx").on(t.batchId),
    index("certificates_enrolment_idx").on(t.enrolmentId),
    index("certificates_skill_assessment_idx").on(t.skillAssessmentId),
    index("certificates_file_idx").on(t.fileId),
    index("certificates_revoked_by_idx").on(t.revokedByUserId),
    index("certificates_issued_by_idx").on(t.issuedByUserId),
    index("certificates_replaces_idx").on(t.replacesCertificateId),
    index("certificates_active_expiry_idx").on(t.expiresAt).where(sql`status = 'active' and expires_at is not null`),
    // Idempotent issuance: one active certificate per skill assessment, and one active course
    // certificate per enrolment and issuer type.
    uniqueIndex("certificates_active_assessment_uq").on(t.skillAssessmentId).where(sql`status = 'active' and skill_assessment_id is not null`),
    uniqueIndex("certificates_active_enrolment_uq")
      .on(t.enrolmentId, t.issuerType)
      .where(sql`status = 'active' and enrolment_id is not null and skill_assessment_id is null`),
    foreignKey({ columns: [t.replacesCertificateId], foreignColumns: [t.id], name: "certificates_replaces_fk" }).onDelete("set null"),
    check(
      "certificates_issuer_chk",
      sql`(${t.issuerType} = 'venkat_sai' and ${t.issuerOrganizationId} is null) or (${t.issuerType} = 'institution_completion' and ${t.issuerOrganizationId} is not null) or (${t.issuerType} = 'accredited_external' and ${t.accreditationBody} is not null)`,
    ),
    check("certificates_expiry_chk", sql`${t.expiresAt} > ${t.issuedAt}`),
    check("certificates_revoked_chk", sql`${t.status} <> 'revoked' or ${t.revokedAt} is not null`),
    check("certificates_verification_code_chk", sql`char_length(${t.verificationCode}) >= 8`),
    check("certificates_replaces_chk", sql`${t.replacesCertificateId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------------------
// Campus drives
// ---------------------------------------------------------------------------

export const CAMPUS_DRIVE_MODES = ["in_person", "online", "hybrid"] as const;
export type CampusDriveMode = (typeof CAMPUS_DRIVE_MODES)[number];

export const CAMPUS_DRIVE_STATUSES = ["planned", "open", "completed", "cancelled"] as const;
export type CampusDriveStatus = (typeof CAMPUS_DRIVE_STATUSES)[number];

/**
 * Campus / hiring drives hosted by an institution (organizationId; null = organised directly by
 * Venkat Sai) with an optional participating employer. employerName is shown when the employer is not
 * on the platform or is confidential. jobIds are soft references to the jobs offered at the drive.
 * Listed on the public events page only when isPublic.
 */
export const campusDrives = pgTable(
  "campus_drives",
  {
    id: pk(),
    /** VSG-DRV-000123 (nextCode("DRV")). */
    code: text().notNull(),
    organizationId: uuid().references(() => organizations.id),
    employerOrganizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    employerName: text(),
    requirementId: uuid().references(() => requirementRequests.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text(),
    driveDate: date(),
    /** Last day of a multi-day drive. */
    driveEndDate: date(),
    registrationDeadline: date(),
    mode: text({ enum: CAMPUS_DRIVE_MODES }).notNull().default("in_person"),
    venue: text(),
    countryCode: countryCode().references(() => countries.code),
    city: text(),
    eligibility: text(),
    /** Soft references to jobs.id. */
    jobIds: uuid().array().notNull().$defaultFn(() => []),
    openings: integer(),
    /** Maximum registrations; null = no limit. */
    capacity: integer(),
    status: text({ enum: CAMPUS_DRIVE_STATUSES }).notNull().default("planned"),
    isPublic: boolean().notNull().default(false),
    /** Institution placement officer or Venkat Sai staff member running the drive. */
    coordinatorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    cancellationReason: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("campus_drives_code_uq").on(t.code),
    index("campus_drives_org_idx").on(t.organizationId, t.driveDate),
    index("campus_drives_employer_idx").on(t.employerOrganizationId),
    index("campus_drives_requirement_idx").on(t.requirementId),
    index("campus_drives_country_idx").on(t.countryCode),
    index("campus_drives_coordinator_idx").on(t.coordinatorUserId),
    index("campus_drives_created_by_idx").on(t.createdByUserId),
    index("campus_drives_status_date_idx").on(t.status, t.driveDate),
    index("campus_drives_job_ids_idx").using("gin", t.jobIds),
    check("campus_drives_dates_chk", sql`${t.driveEndDate} >= ${t.driveDate}`),
    check("campus_drives_openings_chk", sql`${t.openings} > 0`),
    check("campus_drives_capacity_chk", sql`${t.capacity} > 0`),
  ],
);

export const CAMPUS_DRIVE_REGISTRATION_STATUSES = ["registered", "shortlisted", "attended", "absent", "selected", "not_selected", "withdrawn"] as const;
export type CampusDriveRegistrationStatus = (typeof CAMPUS_DRIVE_REGISTRATION_STATUSES)[number];

/**
 * A candidate's registration for a campus drive (one per candidate and drive). The participating
 * employer may see the candidate's profile only after consent: consentToShareAt mirrors the
 * consent_records entry, which is authoritative. applicationId is a soft reference →
 * recruitment.applications (later layer), set when the registration becomes an application.
 */
export const campusDriveRegistrations = pgTable(
  "campus_drive_registrations",
  {
    id: pk(),
    driveId: uuid()
      .notNull()
      .references(() => campusDrives.id, { onDelete: "cascade" }),
    /** FK declared below with an explicit name (the generated one exceeds PostgreSQL's 63-char limit). */
    candidateId: uuid().notNull(),
    status: text({ enum: CAMPUS_DRIVE_REGISTRATION_STATUSES }).notNull().default("registered"),
    /** Institution / staff member who registered the candidate (null = self-registration). */
    registeredByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    consentToShareAt: tstz(),
    applicationId: uuid(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.candidateId], foreignColumns: [candidateProfiles.id], name: "campus_drive_registrations_candidate_fk" }).onDelete("cascade"),
    unique("campus_drive_registrations_drive_candidate_uq").on(t.driveId, t.candidateId),
    index("campus_drive_registrations_candidate_idx").on(t.candidateId),
    index("campus_drive_registrations_registered_by_idx").on(t.registeredByUserId),
    index("campus_drive_registrations_application_idx").on(t.applicationId),
  ],
);

// ---------------------------------------------------------------------------
// Internship programmes
// ---------------------------------------------------------------------------

/** "fixed" requires amount + currency + period; "unpaid" and "not_disclosed" carry no amount. */
export const INTERNSHIP_STIPEND_TYPES = ["fixed", "unpaid", "not_disclosed"] as const;
export type InternshipStipendType = (typeof INTERNSHIP_STIPEND_TYPES)[number];

export const INTERNSHIP_PROGRAMME_STATUSES = ["draft", "open", "closed", "completed", "cancelled"] as const;
export type InternshipProgrammeStatus = (typeof INTERNSHIP_PROGRAMME_STATUSES)[number];

/**
 * Internship / apprenticeship programmes run by an institution or provider (organizationId; null = a
 * Venkat Sai programme), optionally hosted by an employer and advertised through a job posting (jobId).
 * stipendType makes "unpaid" explicit so a missing amount is never shown as a paid internship.
 */
export const internshipProgrammes = pgTable(
  "internship_programmes",
  {
    id: pk(),
    organizationId: uuid().references(() => organizations.id),
    /** FK declared below with an explicit name (the generated one exceeds PostgreSQL's 63-char limit). */
    hostEmployerOrganizationId: uuid(),
    /** Shown when the host employer is not on the platform. */
    hostEmployerName: text(),
    jobId: uuid().references(() => jobs.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text(),
    eligibility: text(),
    durationWeeks: integer(),
    startsOn: date(),
    applicationDeadline: date(),
    workMode: text({ enum: WORK_MODES }),
    countryCode: countryCode().references(() => countries.code),
    city: text(),
    stipendType: text({ enum: INTERNSHIP_STIPEND_TYPES }).notNull().default("not_disclosed"),
    stipendMinor: moneyMinor(),
    stipendCurrency: currencyCode().references(() => currencies.code),
    stipendPeriod: text({ enum: SALARY_PERIODS }),
    seats: integer(),
    status: text({ enum: INTERNSHIP_PROGRAMME_STATUSES }).notNull().default("draft"),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.hostEmployerOrganizationId], foreignColumns: [organizations.id], name: "internship_programmes_host_employer_fk" }).onDelete("set null"),
    index("internship_programmes_org_idx").on(t.organizationId, t.status),
    index("internship_programmes_host_idx").on(t.hostEmployerOrganizationId),
    index("internship_programmes_job_idx").on(t.jobId),
    index("internship_programmes_country_idx").on(t.countryCode),
    index("internship_programmes_currency_idx").on(t.stipendCurrency),
    index("internship_programmes_created_by_idx").on(t.createdByUserId),
    check("internship_programmes_duration_chk", sql`${t.durationWeeks} > 0`),
    check("internship_programmes_seats_chk", sql`${t.seats} > 0`),
    check(
      "internship_programmes_stipend_chk",
      sql`(${t.stipendType} = 'fixed' and ${t.stipendMinor} is not null and ${t.stipendMinor} > 0 and ${t.stipendCurrency} is not null and ${t.stipendPeriod} is not null) or (${t.stipendType} <> 'fixed' and ${t.stipendMinor} is null and ${t.stipendCurrency} is null)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Placement outcomes
// ---------------------------------------------------------------------------

/** How the learner found the job: a campus drive, the institution's placement cell, Venkat Sai recruitment, or on their own. */
export const PLACEMENT_OUTCOME_SOURCE_TYPES = ["campus_drive", "institution", "venkat_sai", "self", "other"] as const;
export type PlacementOutcomeSourceType = (typeof PLACEMENT_OUTCOME_SOURCE_TYPES)[number];

/**
 * Employment outcomes of an organisation's learners (organizationId = the reporting institution;
 * null = outcomes of Venkat Sai's own training), used for that organisation's reports and the learner's
 * own record. Rows are self-reported until staff verify the evidence (verified, verifiedByUserId,
 * verifiedAt); candidateConfirmedAt records the learner's own confirmation. Any public or aggregate
 * figure must use verified rows only.
 * evidenceFileId (offer / appointment letter) and salary are private: visible to the candidate, the
 * reporting organisation and staff only. placementId is a soft reference → recruitment.placements
 * (later layer) for sourceType "venkat_sai".
 */
export const placementOutcomes = pgTable(
  "placement_outcomes",
  {
    id: pk(),
    organizationId: uuid().references(() => organizations.id),
    candidateId: uuid()
      .notNull()
      .references(() => candidateProfiles.id),
    enrolmentId: uuid().references(() => enrolments.id, { onDelete: "set null" }),
    campusDriveId: uuid().references(() => campusDrives.id, { onDelete: "set null" }),
    placementId: uuid(),
    sourceType: text({ enum: PLACEMENT_OUTCOME_SOURCE_TYPES }).notNull(),
    /** Employer name as reported (snapshot; also used when the employer is not on the platform). */
    employerName: text().notNull(),
    employerOrganizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    jobTitle: text().notNull(),
    employmentType: text({ enum: EMPLOYMENT_TYPES }),
    countryCode: countryCode().references(() => countries.code),
    city: text(),
    placedOn: date().notNull(),
    salaryMinor: moneyMinor(),
    salaryCurrency: currencyCode().references(() => currencies.code),
    salaryPeriod: text({ enum: SALARY_PERIODS }),
    verified: boolean().notNull().default(false),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    candidateConfirmedAt: tstz(),
    evidenceFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** Internal notes of the reporting organisation / staff (never shown to the candidate). */
    notes: text(),
    recordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("placement_outcomes_org_idx").on(t.organizationId, t.placedOn),
    index("placement_outcomes_candidate_idx").on(t.candidateId),
    index("placement_outcomes_enrolment_idx").on(t.enrolmentId),
    index("placement_outcomes_drive_idx").on(t.campusDriveId),
    index("placement_outcomes_employer_idx").on(t.employerOrganizationId),
    index("placement_outcomes_country_idx").on(t.countryCode),
    index("placement_outcomes_currency_idx").on(t.salaryCurrency),
    index("placement_outcomes_verified_by_idx").on(t.verifiedByUserId),
    index("placement_outcomes_evidence_file_idx").on(t.evidenceFileId),
    index("placement_outcomes_recorded_by_idx").on(t.recordedByUserId),
    // One outcome per recruitment placement and reporting organisation (two indexes because
    // NULL organisation ids are distinct in a unique index).
    uniqueIndex("placement_outcomes_org_placement_uq")
      .on(t.organizationId, t.placementId)
      .where(sql`organization_id is not null and placement_id is not null`),
    uniqueIndex("placement_outcomes_vsg_placement_uq").on(t.placementId).where(sql`organization_id is null and placement_id is not null`),
    check(
      "placement_outcomes_salary_chk",
      sql`(${t.salaryMinor} is null) = (${t.salaryCurrency} is null) and (${t.salaryMinor} is null or ${t.salaryMinor} >= 0)`,
    ),
    check("placement_outcomes_verified_chk", sql`not ${t.verified} or ${t.verifiedAt} is not null`),
  ],
);
