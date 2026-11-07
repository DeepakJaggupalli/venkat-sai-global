/**
 * Recruitment enumerations and UI labels (client-safe — no server or table imports).
 * The arrays mirror src/db/schema/recruitment.ts; the parity check at the bottom fails the type
 * check if they drift.
 */
import type {
  ApplicationNoteVisibility,
  ApplicationRejectionReason,
  CandidateAttributionStatus,
  EmigrationClearanceStatus,
  InterviewCandidateResponse,
  InterviewMode,
  InterviewOutcome,
  InterviewParticipantRole,
  InterviewRecommendation,
  MobilisationChecklistCategory,
  MobilisationMedicalStatus,
  MobilisationResponsibleParty,
  MobilisationStatus,
  MobilisationVisaStatus,
  OfferStatus,
  PartnerSubmissionStatus,
  TalentListKind,
} from "@/db/schema/recruitment";

export const NOTE_VISIBILITY_OPTIONS = ["staff_only", "staff_and_employer", "staff_and_partner"] as const;
export const REJECTION_REASON_OPTIONS = [
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
export const ATTRIBUTION_STATUS_OPTIONS = ["active", "expired", "disputed", "revoked"] as const;
export const INTERVIEW_RESPONSE_OPTIONS = ["pending", "confirmed", "declined", "reschedule_requested"] as const;
export const INTERVIEW_MODE_OPTIONS = ["in_person", "video", "phone", "trade_test"] as const;
export const INTERVIEW_OUTCOME_OPTIONS = ["pending", "passed", "failed", "on_hold"] as const;
export const PARTICIPANT_ROLE_OPTIONS = ["interviewer", "observer", "coordinator"] as const;
export const RECOMMENDATION_OPTIONS = ["strong_yes", "yes", "maybe", "no"] as const;
export const CHECKLIST_CATEGORY_OPTIONS = ["document", "medical", "visa", "emigration", "insurance", "travel", "orientation", "other"] as const;
export const MEDICAL_STATUS_OPTIONS = ["not_required", "pending", "scheduled", "fit", "unfit", "expired"] as const;
export const RESPONSIBLE_PARTY_OPTIONS = ["candidate", "venkat_sai", "employer", "partner"] as const;
export const MOBILISATION_STATUS_OPTIONS = [
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
export const VISA_STATUS_OPTIONS = ["not_required", "not_started", "documents_pending", "applied", "approved", "issued", "rejected", "cancelled"] as const;
export const EMIGRATION_CLEARANCE_OPTIONS = ["not_assessed", "not_required", "pending", "applied", "granted", "rejected"] as const;
export const TALENT_LIST_KIND_OPTIONS = ["shortlist", "saved_candidates", "project", "talent_pool"] as const;
export const OFFER_STATUS_OPTIONS = ["draft", "issued", "accepted", "declined", "withdrawn", "expired"] as const;
export const SUBMISSION_STATUS_OPTIONS = ["submitted", "under_review", "duplicate", "accepted", "rejected", "withdrawn"] as const;

/** Job-related reasons only (shown to staff, employers and partners — never a personal characteristic). */
export const REJECTION_REASON_LABELS: Readonly<Record<ApplicationRejectionReason, string>> = {
  skills_mismatch: "Skills do not match the role",
  experience_mismatch: "Experience does not match the role",
  qualification_mismatch: "Qualifications do not match the role",
  assessment_not_passed: "Assessment not passed",
  interview_not_passed: "Interview not passed",
  documents_incomplete: "Documents incomplete",
  salary_mismatch: "Salary expectations do not match",
  location_mismatch: "Location does not match",
  availability_mismatch: "Availability does not match",
  no_response: "No response from the candidate",
  no_show: "Did not attend",
  position_filled: "Position filled",
  job_closed: "Job closed",
  duplicate: "Duplicate",
  other: "Other",
};

export const NOTE_VISIBILITY_LABELS: Readonly<Record<ApplicationNoteVisibility, string>> = {
  staff_only: "Venkat Sai team only",
  staff_and_employer: "Venkat Sai team and the employer",
  staff_and_partner: "Venkat Sai team and the recruitment partner",
};

export const INTERVIEW_MODE_LABELS: Readonly<Record<InterviewMode, string>> = {
  in_person: "In person",
  video: "Video call",
  phone: "Phone call",
  trade_test: "Trade test",
};

export const RECOMMENDATION_LABELS: Readonly<Record<InterviewRecommendation, string>> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

export const OFFER_STATUS_LABELS: Readonly<Record<OfferStatus, string>> = {
  draft: "Draft",
  issued: "Sent to candidate",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export const SUBMISSION_STATUS_LABELS: Readonly<Record<PartnerSubmissionStatus, string>> = {
  submitted: "Submitted",
  under_review: "Under review",
  duplicate: "Duplicate",
  accepted: "Accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

// ---------------------------------------------------------------------------
// Parity with the schema enums (compile-time only)
// ---------------------------------------------------------------------------

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const parity: [
  Exact<(typeof NOTE_VISIBILITY_OPTIONS)[number], ApplicationNoteVisibility>,
  Exact<(typeof REJECTION_REASON_OPTIONS)[number], ApplicationRejectionReason>,
  Exact<(typeof ATTRIBUTION_STATUS_OPTIONS)[number], CandidateAttributionStatus>,
  Exact<(typeof INTERVIEW_RESPONSE_OPTIONS)[number], InterviewCandidateResponse>,
  Exact<(typeof INTERVIEW_MODE_OPTIONS)[number], InterviewMode>,
  Exact<(typeof INTERVIEW_OUTCOME_OPTIONS)[number], InterviewOutcome>,
  Exact<(typeof PARTICIPANT_ROLE_OPTIONS)[number], InterviewParticipantRole>,
  Exact<(typeof RECOMMENDATION_OPTIONS)[number], InterviewRecommendation>,
  Exact<(typeof CHECKLIST_CATEGORY_OPTIONS)[number], MobilisationChecklistCategory>,
  Exact<(typeof MEDICAL_STATUS_OPTIONS)[number], MobilisationMedicalStatus>,
  Exact<(typeof RESPONSIBLE_PARTY_OPTIONS)[number], MobilisationResponsibleParty>,
  Exact<(typeof MOBILISATION_STATUS_OPTIONS)[number], MobilisationStatus>,
  Exact<(typeof VISA_STATUS_OPTIONS)[number], MobilisationVisaStatus>,
  Exact<(typeof EMIGRATION_CLEARANCE_OPTIONS)[number], EmigrationClearanceStatus>,
  Exact<(typeof TALENT_LIST_KIND_OPTIONS)[number], TalentListKind>,
  Exact<(typeof OFFER_STATUS_OPTIONS)[number], OfferStatus>,
  Exact<(typeof SUBMISSION_STATUS_OPTIONS)[number], PartnerSubmissionStatus>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];
void parity;
