/**
 * Training enumerations and labels for forms and UI (client-safe). Mirrors of the schema arrays with
 * compile-time parity checks (type-only imports are erased from bundles).
 */
import type {
  AttendanceStatus,
  BatchInstructorRole,
  BatchStatus,
  CampusDriveMode,
  CampusDriveRegistrationStatus,
  CampusDriveStatus,
  CertificateIssuerType,
  CertificateStatus,
  CourseAssessmentType,
  CourseCategory,
  CourseCertificationType,
  CourseFeeType,
  CourseMode,
  CourseStatus,
  EnrolmentFeeStatus,
  EnrolmentResultStatus,
  EnrolmentSource,
  EnrolmentStatus,
  InternshipProgrammeStatus,
  InternshipStipendType,
  PlacementOutcomeSourceType,
  SkillAssessmentResult,
  SkillAssessmentStatus,
  SkillAssessmentType,
} from "@/db/schema/training";

export const COURSE_CATEGORIES = ["technical", "industrial", "welding", "safety", "language", "soft_skills", "it", "other"] as const;
export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  technical: "Technical",
  industrial: "Industrial",
  welding: "Welding",
  safety: "Health and safety",
  language: "Language",
  soft_skills: "Soft skills",
  it: "IT and digital",
  other: "Other",
};
export const COURSE_MODES = ["in_person", "online", "hybrid"] as const;
export const COURSE_MODE_LABELS: Record<CourseMode, string> = { in_person: "In person", online: "Online", hybrid: "Hybrid" };
export const COURSE_FEE_TYPES = ["free", "fixed", "on_request"] as const;
export const COURSE_FEE_TYPE_LABELS: Record<CourseFeeType, string> = { free: "Free", fixed: "Fixed fee", on_request: "Fee on request" };
export const COURSE_CERTIFICATION_TYPES = ["venkat_sai_assessment", "accredited_external", "completion_only", "none"] as const;
export const COURSE_CERTIFICATION_TYPE_LABELS: Record<CourseCertificationType, string> = {
  venkat_sai_assessment: "Venkat Sai assessment certificate",
  accredited_external: "Accredited certificate (external awarding body)",
  completion_only: "Certificate of completion",
  none: "No certificate",
};
export const COURSE_STATUSES = ["draft", "pending_approval", "changes_requested", "published", "rejected", "archived"] as const;

export const BATCH_STATUSES = ["planned", "open", "full", "in_progress", "completed", "cancelled"] as const;
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  planned: "Planned",
  open: "Open for enrolment",
  full: "Full",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const BATCH_INSTRUCTOR_ROLES = ["lead", "assistant", "guest"] as const;

export const ENROLMENT_STATUSES = ["applied", "confirmed", "waitlisted", "rejected", "in_progress", "completed", "dropped", "cancelled"] as const;
export const ENROLMENT_STATUS_LABELS: Record<EnrolmentStatus, string> = {
  applied: "Applied",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  rejected: "Not accepted",
  in_progress: "In progress",
  completed: "Completed",
  dropped: "Dropped out",
  cancelled: "Cancelled",
};
export const ENROLMENT_SOURCES = ["self", "institution", "venkat_sai", "partner", "import"] as const;
export const ENROLMENT_FEE_STATUSES = ["not_applicable", "pending", "paid", "waived", "refunded"] as const;
export const ENROLMENT_RESULT_STATUSES = ["pending", "passed", "failed", "not_applicable"] as const;

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export const COURSE_ASSESSMENT_TYPES = ["theory", "practical", "viva", "project"] as const;

export const SKILL_ASSESSMENT_TYPES = ["trade_test", "practical", "theory", "interview", "medical_fitness_note"] as const;
export const SKILL_ASSESSMENT_TYPE_LABELS: Record<SkillAssessmentType, string> = {
  trade_test: "Trade test",
  practical: "Practical test",
  theory: "Theory test",
  interview: "Technical interview",
  medical_fitness_note: "Fitness note",
};
export const SKILL_ASSESSMENT_STATUSES = ["scheduled", "completed", "no_show", "cancelled"] as const;
export const SKILL_ASSESSMENT_RESULTS = ["pending", "pass", "fail", "retest"] as const;

export const CERTIFICATE_ISSUER_TYPES = ["venkat_sai", "accredited_external", "institution_completion"] as const;
/** Wording shown on certificates and on the public verification page. */
export const CERTIFICATE_ISSUER_TYPE_LABELS: Record<CertificateIssuerType, string> = {
  venkat_sai: "Issued by Venkat Sai (assessment or training result, not an external accreditation)",
  accredited_external: "Accredited certificate issued under an external awarding body",
  institution_completion: "Certificate of completion issued by the training institution",
};
export const CERTIFICATE_STATUSES = ["active", "revoked", "expired"] as const;

export const CAMPUS_DRIVE_MODES = ["in_person", "online", "hybrid"] as const;
export const CAMPUS_DRIVE_STATUSES = ["planned", "open", "completed", "cancelled"] as const;
export const CAMPUS_DRIVE_REGISTRATION_STATUSES = ["registered", "shortlisted", "attended", "absent", "selected", "not_selected", "withdrawn"] as const;

export const INTERNSHIP_STIPEND_TYPES = ["fixed", "unpaid", "not_disclosed"] as const;
export const INTERNSHIP_PROGRAMME_STATUSES = ["draft", "open", "closed", "completed", "cancelled"] as const;

export const PLACEMENT_OUTCOME_SOURCE_TYPES = ["campus_drive", "institution", "venkat_sai", "self", "other"] as const;

// ---------------------------------------------------------------------------
// Compile-time parity with the database enumerations.
// ---------------------------------------------------------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _TrainingConstantsParity = [
  Assert<Same<(typeof COURSE_CATEGORIES)[number], CourseCategory>>,
  Assert<Same<(typeof COURSE_MODES)[number], CourseMode>>,
  Assert<Same<(typeof COURSE_FEE_TYPES)[number], CourseFeeType>>,
  Assert<Same<(typeof COURSE_CERTIFICATION_TYPES)[number], CourseCertificationType>>,
  Assert<Same<(typeof COURSE_STATUSES)[number], CourseStatus>>,
  Assert<Same<(typeof BATCH_STATUSES)[number], BatchStatus>>,
  Assert<Same<(typeof BATCH_INSTRUCTOR_ROLES)[number], BatchInstructorRole>>,
  Assert<Same<(typeof ENROLMENT_STATUSES)[number], EnrolmentStatus>>,
  Assert<Same<(typeof ENROLMENT_SOURCES)[number], EnrolmentSource>>,
  Assert<Same<(typeof ENROLMENT_FEE_STATUSES)[number], EnrolmentFeeStatus>>,
  Assert<Same<(typeof ENROLMENT_RESULT_STATUSES)[number], EnrolmentResultStatus>>,
  Assert<Same<(typeof ATTENDANCE_STATUSES)[number], AttendanceStatus>>,
  Assert<Same<(typeof COURSE_ASSESSMENT_TYPES)[number], CourseAssessmentType>>,
  Assert<Same<(typeof SKILL_ASSESSMENT_TYPES)[number], SkillAssessmentType>>,
  Assert<Same<(typeof SKILL_ASSESSMENT_STATUSES)[number], SkillAssessmentStatus>>,
  Assert<Same<(typeof SKILL_ASSESSMENT_RESULTS)[number], SkillAssessmentResult>>,
  Assert<Same<(typeof CERTIFICATE_ISSUER_TYPES)[number], CertificateIssuerType>>,
  Assert<Same<(typeof CERTIFICATE_STATUSES)[number], CertificateStatus>>,
  Assert<Same<(typeof CAMPUS_DRIVE_MODES)[number], CampusDriveMode>>,
  Assert<Same<(typeof CAMPUS_DRIVE_STATUSES)[number], CampusDriveStatus>>,
  Assert<Same<(typeof CAMPUS_DRIVE_REGISTRATION_STATUSES)[number], CampusDriveRegistrationStatus>>,
  Assert<Same<(typeof INTERNSHIP_STIPEND_TYPES)[number], InternshipStipendType>>,
  Assert<Same<(typeof INTERNSHIP_PROGRAMME_STATUSES)[number], InternshipProgrammeStatus>>,
  Assert<Same<(typeof PLACEMENT_OUTCOME_SOURCE_TYPES)[number], PlacementOutcomeSourceType>>,
];
