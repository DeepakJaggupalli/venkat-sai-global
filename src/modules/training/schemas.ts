/**
 * Zod schemas for training forms and actions (client-safe: no server imports).
 * Amounts are decimals in the given currency (services convert to minor units); dates are YYYY-MM-DD;
 * date-times are ISO 8601 with an offset (convert <input type="datetime-local"> with the venue's time zone).
 */
import { z } from "zod";

import { EMPLOYMENT_TYPES, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { f } from "@/lib/validation";
import { isoDate, optionalIsoDate, textList, uuidList, type FormOutput } from "@/modules/organizations/schemas";

import {
  ATTENDANCE_STATUSES,
  BATCH_INSTRUCTOR_ROLES,
  CAMPUS_DRIVE_MODES,
  CERTIFICATE_ISSUER_TYPES,
  COURSE_ASSESSMENT_TYPES,
  COURSE_CATEGORIES,
  COURSE_CERTIFICATION_TYPES,
  COURSE_FEE_TYPES,
  COURSE_MODES,
  ENROLMENT_FEE_STATUSES,
  ENROLMENT_RESULT_STATUSES,
  INTERNSHIP_STIPEND_TYPES,
  PLACEMENT_OUTCOME_SOURCE_TYPES,
  SKILL_ASSESSMENT_TYPES,
} from "./constants";

const optionalDecimal = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : v),
    z.coerce
      .number({ error: "Enter a number" })
      .min(opts.min ?? 0, `Must be at least ${opts.min ?? 0}`)
      .max(opts.max ?? 1_000_000, "Too large")
      .optional(),
  );

/** ISO 8601 date-time with offset (e.g. 2026-11-20T09:30:00+05:30) → Date. */
export const isoDateTime = (label = "Date and time") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .pipe(z.iso.datetime({ offset: true, error: "Enter a valid date and time" }))
    .transform((v) => new Date(v));

const optionalTimeZone = () =>
  z
    .string()
    .trim()
    .max(64)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone")
    .optional();

const languageCodeList = () =>
  z.preprocess(
    (v) => [...new Set((v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]).map((x) => String(x).trim().toLowerCase()).filter(Boolean))],
    z.array(z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/, "Choose a valid language")).max(10, "Choose at most 10 languages"),
  );

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const courseSchema = z
  .object({
    title: f.text({ max: 200, label: "Course title" }),
    summary: f.optionalText(500),
    descriptionHtml: f.longText(50_000),
    category: f.enumOf(COURSE_CATEGORIES, "Choose a category"),
    skillIds: uuidList(30),
    mode: f.enumOf(COURSE_MODES, "Choose how the course is delivered"),
    durationHours: f.optionalInt({ min: 1, max: 10_000 }),
    durationWeeks: f.optionalInt({ min: 1, max: 520 }),
    eligibility: f.longText(2000),
    prerequisites: f.longText(2000),
    outcomes: textList({ maxItems: 20, maxLength: 300, label: "Outcome" }),
    feeType: f.enumOf(COURSE_FEE_TYPES, "Choose the fee type"),
    feeAmount: f.optionalAmount(),
    feeCurrency: f.currencyCode().optional(),
    feeNotes: f.optionalText(500),
    languageCodes: languageCodeList(),
    certificationType: f.enumOf(COURSE_CERTIFICATION_TYPES, "Choose what learners can earn"),
    accreditationBody: f.optionalText(200),
    coverFileId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.feeType === "fixed") {
      if (!v.feeAmount || v.feeAmount <= 0) ctx.addIssue({ code: "custom", path: ["feeAmount"], message: "Enter the course fee" });
      if (!v.feeCurrency) ctx.addIssue({ code: "custom", path: ["feeCurrency"], message: "Choose the fee currency" });
    }
    if (v.certificationType === "accredited_external" && !v.accreditationBody) {
      ctx.addIssue({ code: "custom", path: ["accreditationBody"], message: "Name the external awarding body" });
    }
  });
export type CourseInput = FormOutput<typeof courseSchema>;

export const courseModuleSchema = z.object({
  title: f.text({ max: 200, label: "Module title" }),
  description: f.longText(5000),
  durationHours: optionalDecimal({ min: 0.25, max: 1000 }),
  materialFileIds: uuidList(20),
});
export type CourseModuleInput = FormOutput<typeof courseModuleSchema>;

export const reorderCourseModulesSchema = z.object({ courseId: f.uuid(), moduleIds: uuidList(200) });

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export const batchSchema = z
  .object({
    title: f.text({ max: 200, label: "Batch title" }),
    startsOn: optionalIsoDate(),
    endsOn: optionalIsoDate(),
    schedule: f.optionalText(300),
    timezone: optionalTimeZone(),
    mode: f.enumOf(COURSE_MODES),
    venue: f.optionalText(300),
    countryCode: f.countryCode().optional(),
    city: f.optionalText(120),
    capacity: f.optionalInt({ min: 1, max: 10_000 }),
    registrationDeadline: optionalIsoDate(),
    requirementId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The batch must end after it starts" });
    if (v.registrationDeadline && v.endsOn && v.registrationDeadline > v.endsOn) {
      ctx.addIssue({ code: "custom", path: ["registrationDeadline"], message: "Registration must close before the batch ends" });
    }
  });
export type BatchInput = FormOutput<typeof batchSchema>;

export const batchInstructorSchema = z
  .object({
    userId: f.optionalUuid(),
    name: f.optionalText(120),
    bio: f.longText(1000),
    role: f.enumOf(BATCH_INSTRUCTOR_ROLES),
  })
  .refine((v) => !!v.userId || !!v.name, { path: ["name"], message: "Choose a team member or enter the instructor's name" });
export type BatchInstructorInput = FormOutput<typeof batchInstructorSchema>;

export const cancelBatchSchema = z.object({ batchId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }) });

// ---------------------------------------------------------------------------
// Enrolments
// ---------------------------------------------------------------------------

export const applyToBatchSchema = z.object({
  batchId: f.uuid(),
  acknowledgeContactSharing: f.bool().refine((v) => v, "Confirm that your contact details can be shared with the training provider"),
});
export const enrolmentActionSchema = z.object({ enrolmentId: f.uuid(), reason: f.optionalText(500) });
export const enrolmentReasonSchema = z.object({ enrolmentId: f.uuid(), reason: f.text({ max: 500, label: "Reason" }) });
export const enrolmentFeeSchema = z.object({
  enrolmentId: f.uuid(),
  feeStatus: f.enumOf(ENROLMENT_FEE_STATUSES),
  paymentReference: f.optionalText(120),
});
export const enrolmentResultSchema = z.object({
  enrolmentId: f.uuid(),
  resultStatus: f.enumOf(ENROLMENT_RESULT_STATUSES),
  finalScore: optionalDecimal({ min: 0, max: 100 }),
});
export const staffEnrolSchema = z.object({ batchId: f.uuid(), candidateId: f.uuid() });

// ---------------------------------------------------------------------------
// Attendance and course assessments
// ---------------------------------------------------------------------------

export const attendanceSessionSchema = z.object({
  sessionDate: isoDate("Session date"),
  topic: f.optionalText(200),
  courseModuleId: f.optionalUuid(),
  durationHours: optionalDecimal({ min: 0.25, max: 24 }),
});
export type AttendanceSessionInput = FormOutput<typeof attendanceSessionSchema>;

export const attendanceRecordsSchema = z.object({
  sessionId: f.uuid(),
  records: z
    .array(z.object({ enrolmentId: f.uuid(), status: f.enumOf(ATTENDANCE_STATUSES), remarks: f.optionalText(300) }))
    .min(1, "Mark at least one learner")
    .max(1000),
});
export type AttendanceRecordInput = z.output<typeof attendanceRecordsSchema>["records"][number];

export const courseAssessmentSchema = z
  .object({
    title: f.text({ max: 200, label: "Assessment title" }),
    type: f.enumOf(COURSE_ASSESSMENT_TYPES),
    maxScore: z.coerce.number({ error: "Enter the maximum score" }).positive("Must be more than 0").max(100_000),
    passScore: optionalDecimal({ min: 0, max: 100_000 }),
    weightPercent: optionalDecimal({ min: 0, max: 100 }),
    scheduledAt: isoDateTime("Scheduled time").optional(),
  })
  .refine((v) => v.passScore === undefined || v.passScore <= v.maxScore, { path: ["passScore"], message: "The pass mark cannot exceed the maximum score" });
export type CourseAssessmentInput = FormOutput<typeof courseAssessmentSchema>;

export const assessmentScoresSchema = z.object({
  assessmentId: f.uuid(),
  scores: z
    .array(
      z.object({
        enrolmentId: f.uuid(),
        score: z.number().min(0).max(100_000).nullable().optional(),
        isAbsent: z.boolean().default(false),
        remarks: f.optionalText(1000),
      }),
    )
    .min(1)
    .max(1000),
});
export type AssessmentScoreInput = z.output<typeof assessmentScoresSchema>["scores"][number];

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export const issueCertificateSchema = z
  .object({
    issuerType: f.enumOf(CERTIFICATE_ISSUER_TYPES),
    enrolmentId: f.optionalUuid(),
    skillAssessmentId: f.optionalUuid(),
    title: f.optionalText(200),
    description: f.longText(2000),
    expiresOn: optionalIsoDate(),
    externalCertificateNumber: f.optionalText(100),
    fileId: f.optionalUuid(),
  })
  .refine((v) => (v.enrolmentId ? 1 : 0) + (v.skillAssessmentId ? 1 : 0) === 1, { path: ["enrolmentId"], message: "Choose the enrolment or the assessment the certificate is for" });
export type IssueCertificateInput = FormOutput<typeof issueCertificateSchema>;

export const revokeCertificateSchema = z.object({ certificateId: f.uuid(), reason: f.text({ max: 1000, label: "Reason" }) });
export const verifyCertificateCodeSchema = z.object({ code: z.string({ error: "Enter the verification code" }).trim().min(8, "Enter the full code").max(32, "Enter the full code") });

// ---------------------------------------------------------------------------
// Skill assessments and centres
// ---------------------------------------------------------------------------

export const scheduleSkillAssessmentSchema = z
  .object({
    candidateId: f.uuid(),
    assessmentCentreId: f.optionalUuid(),
    location: f.optionalText(300),
    applicationId: f.optionalUuid(),
    requirementId: f.optionalUuid(),
    enrolmentId: f.optionalUuid(),
    trade: f.text({ max: 120, label: "Trade" }),
    skillId: f.optionalUuid(),
    assessmentType: f.enumOf(SKILL_ASSESSMENT_TYPES),
    process: f.optionalText(120),
    position: f.optionalText(60),
    standardReference: f.optionalText(200),
    materialDetails: f.optionalText(500),
    evaluationMethods: textList({ maxItems: 10, maxLength: 80 }),
    scheduledAt: isoDateTime("Assessment time"),
    assessorUserId: f.optionalUuid(),
    assessorName: f.optionalText(120),
    maxScore: optionalDecimal({ min: 0.01, max: 100_000 }),
    retestOfAssessmentId: f.optionalUuid(),
  })
  .refine((v) => !!v.assessmentCentreId || !!v.location, { path: ["assessmentCentreId"], message: "Choose an assessment centre or enter the venue" });
export type ScheduleSkillAssessmentInput = FormOutput<typeof scheduleSkillAssessmentSchema>;

export const rescheduleSkillAssessmentSchema = z
  .object({
    assessmentId: f.uuid(),
    scheduledAt: isoDateTime("Assessment time"),
    assessmentCentreId: f.optionalUuid(),
    location: f.optionalText(300),
  })
  .refine((v) => !!v.assessmentCentreId || !!v.location, { path: ["assessmentCentreId"], message: "Choose an assessment centre or enter the venue" });
export type RescheduleSkillAssessmentInput = FormOutput<typeof rescheduleSkillAssessmentSchema>;

export const cancelSkillAssessmentSchema = z.object({ assessmentId: f.uuid(), reason: f.text({ max: 500, label: "Reason" }) });

export const recordSkillAssessmentResultSchema = z
  .object({
    assessmentId: f.uuid(),
    result: z.enum(["pass", "fail", "retest"], { error: "Choose the result" }),
    score: optionalDecimal({ min: 0, max: 100_000 }),
    maxScore: optionalDecimal({ min: 0.01, max: 100_000 }),
    remarks: f.longText(2000),
    internalNotes: f.longText(5000),
    evidenceFileIds: uuidList(20),
    retestAvailableFrom: optionalIsoDate(),
    publish: f.bool(),
    /** Defaults to true: a pass verifies the assessed skill unless the form explicitly says otherwise. */
    verifySkill: z.preprocess((v) => (v === undefined || v === null || v === "" ? true : v === true || v === "on" || v === "true" || v === "1"), z.boolean()),
    issueCertificate: f.bool(),
    certificateTitle: f.optionalText(200),
    certificateExpiresOn: optionalIsoDate(),
  })
  .superRefine((v, ctx) => {
    if (v.score !== undefined && v.maxScore !== undefined && v.score > v.maxScore) ctx.addIssue({ code: "custom", path: ["score"], message: "The score cannot exceed the maximum" });
    if (v.issueCertificate && v.result !== "pass") ctx.addIssue({ code: "custom", path: ["issueCertificate"], message: "A certificate can only be issued for a pass" });
  });
export type RecordSkillAssessmentResultInput = FormOutput<typeof recordSkillAssessmentResultSchema>;

export const assessmentCentreSchema = z.object({
  name: f.text({ max: 160, label: "Centre name" }),
  countryCode: f.countryCode(),
  stateRegion: f.optionalText(120),
  city: f.text({ max: 120, label: "City" }),
  addressLine1: f.optionalText(200),
  addressLine2: f.optionalText(200),
  postalCode: f.optionalText(20),
  timezone: optionalTimeZone(),
  capabilities: textList({ maxItems: 40, maxLength: 60, label: "Capability" }),
  contactPhone: f.optionalPhone(),
  contactEmail: f.optionalEmail(),
  candidateInstructions: f.longText(2000),
});
export type AssessmentCentreInput = FormOutput<typeof assessmentCentreSchema>;

// ---------------------------------------------------------------------------
// Campus drives, internships, placement outcomes
// ---------------------------------------------------------------------------

export const campusDriveSchema = z
  .object({
    title: f.text({ max: 200, label: "Title" }),
    description: f.longText(5000),
    employerOrganizationId: f.optionalUuid(),
    employerName: f.optionalText(200),
    requirementId: f.optionalUuid(),
    driveDate: optionalIsoDate(),
    driveEndDate: optionalIsoDate(),
    registrationDeadline: optionalIsoDate(),
    mode: f.enumOf(CAMPUS_DRIVE_MODES),
    venue: f.optionalText(300),
    countryCode: f.countryCode().optional(),
    city: f.optionalText(120),
    eligibility: f.longText(2000),
    jobIds: uuidList(20),
    openings: f.optionalInt({ min: 1, max: 100_000 }),
    capacity: f.optionalInt({ min: 1, max: 100_000 }),
    isPublic: f.bool(),
    coordinatorUserId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.driveDate && v.driveEndDate && v.driveEndDate < v.driveDate) ctx.addIssue({ code: "custom", path: ["driveEndDate"], message: "The drive must end after it starts" });
    if (v.registrationDeadline && v.driveDate && v.registrationDeadline > v.driveDate) {
      ctx.addIssue({ code: "custom", path: ["registrationDeadline"], message: "Registration must close before the drive" });
    }
  });
export type CampusDriveInput = FormOutput<typeof campusDriveSchema>;

export const campusDriveStatusSchema = z.object({
  driveId: f.uuid(),
  status: z.enum(["planned", "open", "completed", "cancelled"]),
  reason: f.optionalText(500),
});
export const campusRegistrationSchema = z.object({
  driveId: f.uuid(),
  consentToShare: f.bool().refine((v) => v, "Confirm that your profile can be shared with the participating employer"),
});
export const campusRegistrationStatusSchema = z.object({
  registrationId: f.uuid(),
  status: z.enum(["registered", "shortlisted", "attended", "absent", "selected", "not_selected"]),
});

export const internshipSchema = z
  .object({
    title: f.text({ max: 200, label: "Title" }),
    description: f.longText(5000),
    eligibility: f.longText(2000),
    durationWeeks: f.optionalInt({ min: 1, max: 260 }),
    startsOn: optionalIsoDate(),
    applicationDeadline: optionalIsoDate(),
    workMode: f.enumOf(WORK_MODES).optional(),
    countryCode: f.countryCode().optional(),
    city: f.optionalText(120),
    stipendType: f.enumOf(INTERNSHIP_STIPEND_TYPES),
    stipendAmount: f.optionalAmount(),
    stipendCurrency: f.currencyCode().optional(),
    stipendPeriod: f.enumOf(SALARY_PERIODS).optional(),
    seats: f.optionalInt({ min: 1, max: 100_000 }),
    hostEmployerOrganizationId: f.optionalUuid(),
    hostEmployerName: f.optionalText(200),
    jobId: f.optionalUuid(),
  })
  .superRefine((v, ctx) => {
    if (v.stipendType === "fixed") {
      if (!v.stipendAmount || v.stipendAmount <= 0) ctx.addIssue({ code: "custom", path: ["stipendAmount"], message: "Enter the stipend" });
      if (!v.stipendCurrency) ctx.addIssue({ code: "custom", path: ["stipendCurrency"], message: "Choose the currency" });
      if (!v.stipendPeriod) ctx.addIssue({ code: "custom", path: ["stipendPeriod"], message: "Choose how often it is paid" });
    }
  });
export type InternshipInput = FormOutput<typeof internshipSchema>;
export const internshipStatusSchema = z.object({ internshipId: f.uuid(), status: z.enum(["draft", "open", "closed", "completed", "cancelled"]) });

export const placementOutcomeSchema = z
  .object({
    candidateId: f.optionalUuid(),
    enrolmentId: f.optionalUuid(),
    campusDriveId: f.optionalUuid(),
    sourceType: f.enumOf(PLACEMENT_OUTCOME_SOURCE_TYPES),
    employerName: f.text({ max: 200, label: "Employer" }),
    employerOrganizationId: f.optionalUuid(),
    jobTitle: f.text({ max: 200, label: "Job title" }),
    employmentType: f.enumOf(EMPLOYMENT_TYPES).optional(),
    countryCode: f.countryCode().optional(),
    city: f.optionalText(120),
    placedOn: isoDate("Placement date"),
    salaryAmount: f.optionalAmount(),
    salaryCurrency: f.currencyCode().optional(),
    salaryPeriod: f.enumOf(SALARY_PERIODS).optional(),
    evidenceFileId: f.optionalUuid(),
    notes: f.longText(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.candidateId && !v.enrolmentId) ctx.addIssue({ code: "custom", path: ["enrolmentId"], message: "Choose the learner" });
    if (v.salaryAmount !== undefined && !v.salaryCurrency) ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Choose the salary currency" });
  });
export type PlacementOutcomeInput = FormOutput<typeof placementOutcomeSchema>;

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------

export const catalogueFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: f.enumOf(COURSE_CATEGORIES).optional(),
  mode: f.enumOf(COURSE_MODES).optional(),
  feeType: f.enumOf(COURSE_FEE_TYPES).optional(),
  certificationType: f.enumOf(COURSE_CERTIFICATION_TYPES).optional(),
  countryCode: f.countryCode().optional(),
  city: z.string().trim().max(120).optional(),
  language: z.string().trim().toLowerCase().max(12).optional(),
  institution: z.string().trim().max(120).optional(),
  venkatSaiOnly: z.preprocess((v) => v === true || v === "1" || v === "true", z.boolean()).optional(),
  openBatchesOnly: z.preprocess((v) => v === true || v === "1" || v === "true", z.boolean()).optional(),
});
export type CatalogueFilters = FormOutput<typeof catalogueFiltersSchema>;
