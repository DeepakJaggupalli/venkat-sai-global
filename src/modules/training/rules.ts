/**
 * Pure training rules (no I/O; client-safe; unit-tested in rules.test.ts).
 *
 * - Certificate issuing matrix (who may issue which issuer type from which source).
 * - Enrolment and batch state machines, seat accounting.
 * - Attendance percentage and course results (weighted final score, pass / fail).
 * - Public verification code format.
 */
import type {
  AttendanceStatus,
  BatchStatus,
  CertificateIssuerType,
  CourseCertificationType,
  EnrolmentResultStatus,
  EnrolmentStatus,
  SkillAssessmentResult,
  SkillAssessmentStatus,
} from "@/db/schema/training";

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export type CertificateIssuerActor =
  | { kind: "staff"; permissions: ReadonlySet<string> }
  | {
      kind: "institution";
      organizationId: string;
      permissions: ReadonlySet<string>;
      /** The institution holds a current Venkat Sai verification. */
      organizationVerified: boolean;
      /** isAuthorisedCertificateIssuer and the authorisation has not lapsed. */
      authorisedIssuer: boolean;
    };

export type CertificateSource =
  | {
      kind: "enrolment";
      /** Owner of the course (null = Venkat Sai course). */
      courseOrganizationId: string | null;
      /** Organisation running the batch (null = Venkat Sai). */
      batchOrganizationId: string | null;
      enrolmentStatus: EnrolmentStatus;
      resultStatus: EnrolmentResultStatus;
      certificationType: CourseCertificationType;
    }
  | { kind: "skill_assessment"; status: SkillAssessmentStatus; result: SkillAssessmentResult };

export type CertificateDenial =
  | "not_permitted"
  | "staff_cannot_issue_accredited"
  | "wrong_source"
  | "not_course_owner"
  | "institution_not_verified"
  | "not_authorised_issuer"
  | "no_certificate_offered"
  | "certification_mismatch"
  | "not_completed"
  | "not_passed";

export const CERTIFICATE_DENIAL_MESSAGES: Record<CertificateDenial, string> = {
  not_permitted: "You do not have permission to issue this kind of certificate.",
  staff_cannot_issue_accredited: "Accredited certificates are issued only by institutions that Venkat Sai has authorised as certificate issuers.",
  wrong_source: "This kind of certificate cannot be issued for this record.",
  not_course_owner: "Certificates can only be issued for your own institution's courses and batches.",
  institution_not_verified: "Your institution must be verified before it can issue certificates.",
  not_authorised_issuer: "Your institution is not authorised to issue accredited certificates. Contact Venkat Sai to have your accreditation verified.",
  no_certificate_offered: "This course does not offer a certificate.",
  certification_mismatch: "The course's certification type does not allow this certificate.",
  not_completed: "Certificates are issued after the learner completes the course or the assessment.",
  not_passed: "This certificate requires a passed result.",
};

export type CertificateIssueCheck = { ok: true } | { ok: false; reason: CertificateDenial; message: string };

function deny(reason: CertificateDenial): CertificateIssueCheck {
  return { ok: false, reason, message: CERTIFICATE_DENIAL_MESSAGES[reason] };
}

/**
 * Issuing matrix:
 *  - venkat_sai — staff with training.certificates only; from a passed Venkat Sai skill assessment, or a
 *    completed enrolment in a Venkat Sai course (organisation null) that offers a certificate
 *    (venkat_sai_assessment needs a passed result; completion_only needs completion).
 *  - institution_completion — members of a verified institution with institution.certificates.issue, for
 *    completed enrolments in their own course and batch (courses with certification "none" excluded).
 *  - accredited_external — ONLY institutions authorised by Venkat Sai as certificate issuers (authorisation
 *    current), with institution.certificates.issue, for passed enrolments in their own courses whose
 *    certification type is accredited_external. Venkat Sai results are never issued as accredited.
 */
export function evaluateCertificateIssue(issuerType: CertificateIssuerType, actor: CertificateIssuerActor, source: CertificateSource): CertificateIssueCheck {
  if (issuerType === "venkat_sai") {
    if (actor.kind !== "staff" || !actor.permissions.has("training.certificates")) return deny("not_permitted");
    if (source.kind === "skill_assessment") {
      if (source.status !== "completed") return deny("not_completed");
      return source.result === "pass" ? { ok: true } : deny("not_passed");
    }
    if (source.courseOrganizationId !== null) return deny("wrong_source");
    if (source.certificationType === "none") return deny("no_certificate_offered");
    if (source.certificationType === "accredited_external") return deny("certification_mismatch");
    if (source.enrolmentStatus !== "completed") return deny("not_completed");
    if (source.certificationType === "venkat_sai_assessment" && source.resultStatus !== "passed") return deny("not_passed");
    return { ok: true };
  }

  // Institution-issued certificates.
  if (actor.kind === "staff") return deny(issuerType === "accredited_external" ? "staff_cannot_issue_accredited" : "not_permitted");
  if (!actor.permissions.has("institution.certificates.issue")) return deny("not_permitted");
  if (source.kind !== "enrolment") return deny("wrong_source");
  if (source.courseOrganizationId !== actor.organizationId || source.batchOrganizationId !== actor.organizationId) return deny("not_course_owner");
  if (!actor.organizationVerified) return deny("institution_not_verified");

  if (issuerType === "institution_completion") {
    if (source.certificationType === "none") return deny("no_certificate_offered");
    return source.enrolmentStatus === "completed" ? { ok: true } : deny("not_completed");
  }

  // accredited_external
  if (!actor.authorisedIssuer) return deny("not_authorised_issuer");
  if (source.certificationType !== "accredited_external") return deny("certification_mismatch");
  if (source.enrolmentStatus !== "completed") return deny("not_completed");
  return source.resultStatus === "passed" ? { ok: true } : deny("not_passed");
}

/** Credential type recorded on the candidate profile for a certificate. */
export function credentialTypeForCertificate(source: { fromSkillAssessment: boolean; certificationType: CourseCertificationType | null }): "skill_test" | "training_completion" | "certificate" {
  if (source.fromSkillAssessment) return "skill_test";
  return source.certificationType === "completion_only" ? "training_completion" : "certificate";
}

// ---------------------------------------------------------------------------
// Verification codes (public lookup tokens)
// ---------------------------------------------------------------------------

/** Crockford base32: no I, L, O, U (unambiguous when read aloud or typed from paper). */
export const VERIFICATION_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 12 characters = 60 random bits. */
export const VERIFICATION_CODE_LENGTH = 12;

/** Accepts "abcd-efgh-jkmn", spaces, lower case and the usual look-alikes (O→0, I/L→1). */
export function normalizeVerificationCode(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== VERIFICATION_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!VERIFICATION_CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** "ABCDEFGHJKMN" → "ABCD-EFGH-JKMN" for display. */
export function formatVerificationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

// ---------------------------------------------------------------------------
// Enrolments
// ---------------------------------------------------------------------------

export const ENROLMENT_TRANSITIONS: Record<EnrolmentStatus, readonly EnrolmentStatus[]> = {
  applied: ["confirmed", "waitlisted", "rejected", "cancelled"],
  waitlisted: ["confirmed", "rejected", "cancelled"],
  confirmed: ["in_progress", "completed", "dropped", "cancelled"],
  in_progress: ["completed", "dropped"],
  completed: [],
  // Re-applying reactivates the row (one enrolment per candidate and batch).
  rejected: ["applied", "waitlisted"],
  dropped: ["applied", "waitlisted"],
  cancelled: ["applied", "waitlisted"],
};

/** Statuses that occupy a seat (batches.enrolledCount). */
export const SEAT_HOLDING_STATUSES: readonly EnrolmentStatus[] = ["confirmed", "in_progress", "completed"];
/** Statuses that mean the candidate is still in the batch's pipeline. */
export const ACTIVE_ENROLMENT_STATUSES: readonly EnrolmentStatus[] = ["applied", "waitlisted", "confirmed", "in_progress", "completed"];

export function canTransitionEnrolment(from: EnrolmentStatus, to: EnrolmentStatus): boolean {
  return ENROLMENT_TRANSITIONS[from].includes(to);
}

/** +1 when a transition takes a seat, −1 when it frees one. */
export function seatDelta(from: EnrolmentStatus, to: EnrolmentStatus): -1 | 0 | 1 {
  const before = SEAT_HOLDING_STATUSES.includes(from);
  const after = SEAT_HOLDING_STATUSES.includes(to);
  return before === after ? 0 : after ? 1 : -1;
}

/** Status a new application gets: waitlisted straight away when the batch is already full. */
export function initialEnrolmentStatus(batch: { status: BatchStatus; capacity: number | null; enrolledCount: number }): "applied" | "waitlisted" {
  const full = batch.status === "full" || (batch.capacity !== null && batch.enrolledCount >= batch.capacity);
  return full ? "waitlisted" : "applied";
}

/** Can candidates apply to this batch today? */
export function batchApplicationCheck(
  batch: { status: BatchStatus; registrationDeadline: string | null; startsOn: string | null },
  today: string,
): { ok: true } | { ok: false; message: string } {
  if (batch.status !== "open" && batch.status !== "full") return { ok: false, message: "This batch is not open for enrolment." };
  if (batch.registrationDeadline && batch.registrationDeadline < today) return { ok: false, message: "Registration for this batch has closed." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export const BATCH_TRANSITIONS: Record<BatchStatus, readonly BatchStatus[]> = {
  planned: ["open", "in_progress", "cancelled"],
  open: ["planned", "full", "in_progress", "cancelled"],
  full: ["open", "in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionBatch(from: BatchStatus, to: BatchStatus): boolean {
  return BATCH_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Attendance and results
// ---------------------------------------------------------------------------

/** (present + late) / sessions not excused, as a percentage with 2 decimals; null without records. */
export function computeAttendancePercent(statuses: readonly AttendanceStatus[]): number | null {
  const counted = statuses.filter((s) => s !== "excused");
  if (!counted.length) return null;
  const attended = counted.filter((s) => s === "present" || s === "late").length;
  return Math.round((attended / counted.length) * 10_000) / 100;
}

export type GradingAssessment = { id: string; maxScore: number; passScore: number | null; weightPercent: number | null };
export type GradingScore = { assessmentId: string; score: number | null; isAbsent: boolean };
export type FinalResult = { finalScore: number | null; resultStatus: EnrolmentResultStatus; complete: boolean };

/**
 * Final result of one enrolment:
 *  - incomplete (an assessment without a mark) → finalScore null, result pending;
 *  - finalScore = weighted average of percentages (absent = 0). Missing weights share what the
 *    specified weights leave (equal split when none are given); weights are normalised;
 *  - courses without an assessed certificate (completion_only / none) → not_applicable;
 *  - passed when every assessment that has a pass mark was passed; failed otherwise; when no assessment
 *    has a pass mark the result stays pending for the institution to decide (no invented threshold).
 */
export function computeFinalResult(assessments: readonly GradingAssessment[], scores: readonly GradingScore[], certificationType: CourseCertificationType): FinalResult {
  const notAssessed = certificationType === "completion_only" || certificationType === "none";
  if (!assessments.length) return { finalScore: null, resultStatus: notAssessed ? "not_applicable" : "pending", complete: false };
  const byAssessment = new Map(scores.map((s) => [s.assessmentId, s]));
  const marks: { a: GradingAssessment; pct: number; passed: boolean | null }[] = [];
  for (const a of assessments) {
    const s = byAssessment.get(a.id);
    if (!s || (!s.isAbsent && s.score === null)) return { finalScore: null, resultStatus: notAssessed ? "not_applicable" : "pending", complete: false };
    const score = s.isAbsent ? 0 : (s.score ?? 0);
    marks.push({ a, pct: (score / a.maxScore) * 100, passed: a.passScore === null ? null : !s.isAbsent && score >= a.passScore });
  }
  const specified = marks.filter((m) => m.a.weightPercent !== null).reduce((sum, m) => sum + (m.a.weightPercent ?? 0), 0);
  const unspecified = marks.filter((m) => m.a.weightPercent === null).length;
  const share = unspecified ? Math.max(0, 100 - specified) / unspecified : 0;
  const weights = marks.map((m) => m.a.weightPercent ?? (specified === 0 ? 1 : share));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const finalScore =
    totalWeight > 0 ? Math.round((marks.reduce((sum, m, i) => sum + m.pct * weights[i]!, 0) / totalWeight) * 100) / 100 : Math.round((marks.reduce((s, m) => s + m.pct, 0) / marks.length) * 100) / 100;
  const bounded = Math.min(100, Math.max(0, finalScore));
  if (notAssessed) return { finalScore: bounded, resultStatus: "not_applicable", complete: true };
  const gated = marks.filter((m) => m.passed !== null);
  if (!gated.length) return { finalScore: bounded, resultStatus: "pending", complete: true };
  return { finalScore: bounded, resultStatus: gated.every((m) => m.passed) ? "passed" : "failed", complete: true };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}
