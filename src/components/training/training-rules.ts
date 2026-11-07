/**
 * Pure presentation rules for the training screens (client-safe, unit-tested in training-rules.test.ts).
 * Business rules (who may apply, seats, results) stay in the training module; this file only decides how
 * module data is grouped, filtered and labelled in the UI.
 */
import type { Tone } from "@/components/shared/tones";
import type { BatchStatus, CertificateIssuerType, EnrolmentResultStatus, EnrolmentStatus, SkillAssessmentResult, SkillAssessmentStatus } from "@/db/schema/training";
import { batchApplicationCheck, canTransitionEnrolment } from "@/modules/training/rules";

// ---------------------------------------------------------------------------
// Duration filter (the catalogue query has no duration filter yet; see the route report)
// ---------------------------------------------------------------------------

export const DURATION_FILTERS = ["short", "medium", "long", "extended"] as const;
export type DurationFilter = (typeof DURATION_FILTERS)[number];

export function isDurationFilter(value: unknown): value is DurationFilter {
  return typeof value === "string" && (DURATION_FILTERS as readonly string[]).includes(value);
}

/**
 * Bucket a course by its stated duration: weeks when given, otherwise hours of instruction.
 * short ≤ 1 week / 40 h · medium ≤ 4 weeks / 160 h · long ≤ 12 weeks / 480 h · extended above that.
 * Courses without a stated duration have no bucket (and never match a duration filter).
 */
export function durationBucket(course: { durationWeeks: number | null; durationHours: number | null }): DurationFilter | null {
  const weeks = course.durationWeeks;
  if (weeks !== null && weeks > 0) {
    if (weeks <= 1) return "short";
    if (weeks <= 4) return "medium";
    if (weeks <= 12) return "long";
    return "extended";
  }
  const hours = course.durationHours;
  if (hours !== null && hours > 0) {
    if (hours <= 40) return "short";
    if (hours <= 160) return "medium";
    if (hours <= 480) return "long";
    return "extended";
  }
  return null;
}

/** One page of an in-memory list (used when the duration filter is applied after the catalogue query). */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; total: number; page: number; pageSize: number; pageCount: number } {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page: current, pageSize, pageCount };
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export type BatchCta = "apply" | "waitlist" | "closed" | "not_open";

/** What the call to action of a batch should be today (mirrors the module's batchApplicationCheck). */
export function batchCta(batch: { status: BatchStatus; registrationDeadline: string | null; startsOn: string | null; seatsLeft: number | null }, today: string): BatchCta {
  const check = batchApplicationCheck(batch, today);
  if (!check.ok) return batch.status === "planned" ? "not_open" : "closed";
  if (batch.status === "full" || batch.seatsLeft === 0) return "waitlist";
  return "apply";
}

// ---------------------------------------------------------------------------
// Enrolments
// ---------------------------------------------------------------------------

/** Statuses a learner can withdraw from (in progress → recorded as dropped by the module). */
export const WITHDRAWABLE_STATUSES: readonly EnrolmentStatus[] = ["applied", "waitlisted", "confirmed", "in_progress"];

export function canWithdrawEnrolment(status: EnrolmentStatus): boolean {
  return WITHDRAWABLE_STATUSES.includes(status) && (canTransitionEnrolment(status, "cancelled") || canTransitionEnrolment(status, "dropped"));
}

/** Enrolments that still hold (or wait for) a place. */
export const OPEN_ENROLMENT_STATUSES: readonly EnrolmentStatus[] = ["applied", "waitlisted", "confirmed", "in_progress"];

export function enrolmentTone(status: EnrolmentStatus): Tone {
  switch (status) {
    case "confirmed":
    case "in_progress":
      return "info";
    case "completed":
      return "success";
    case "waitlisted":
    case "applied":
      return "warning";
    case "rejected":
    case "dropped":
    case "cancelled":
      return "neutral";
  }
}

/** A result is shown only when it is final (pending results are not shown as "failed"). */
export function isFinalResult(status: EnrolmentResultStatus): status is "passed" | "failed" {
  return status === "passed" || status === "failed";
}

export function resultTone(status: EnrolmentResultStatus | SkillAssessmentResult): Tone {
  if (status === "passed" || status === "pass") return "success";
  if (status === "failed" || status === "fail") return "danger";
  if (status === "retest") return "warning";
  return "neutral";
}

/** Attendance shown as a whole percentage, clamped to 0–100; null when no sessions were recorded. */
export function attendanceValue(percent: number | null | undefined): number | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
  return Math.round(Math.min(100, Math.max(0, percent)));
}

export function groupEnrolments<T extends { status: EnrolmentStatus }>(items: readonly T[]): { current: T[]; past: T[] } {
  const current: T[] = [];
  const past: T[] = [];
  for (const item of items) (OPEN_ENROLMENT_STATUSES.includes(item.status) ? current : past).push(item);
  return { current, past };
}

// ---------------------------------------------------------------------------
// Skill assessments
// ---------------------------------------------------------------------------

export function groupAssessments<T extends { status: SkillAssessmentStatus; scheduledAt: Date | string }>(items: readonly T[], now: Date): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const item of items) {
    const at = new Date(item.scheduledAt).getTime();
    // A scheduled test stays "upcoming" for the rest of its day so it does not vanish while it runs.
    if (item.status === "scheduled" && at + 12 * 3_600_000 >= now.getTime()) upcoming.push(item);
    else past.push(item);
  }
  upcoming.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return { upcoming, past };
}

export function assessmentStatusTone(status: SkillAssessmentStatus): Tone {
  if (status === "scheduled") return "info";
  if (status === "completed") return "success";
  if (status === "no_show") return "warning";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export type CertificateDisplayState = "valid" | "revoked" | "expired";

export function certificateTone(state: CertificateDisplayState): Tone {
  if (state === "valid") return "success";
  if (state === "revoked") return "danger";
  return "warning";
}

/** Issuer types whose wording must say "not an external accreditation". */
export function isVenkatSaiIssued(issuerType: CertificateIssuerType): boolean {
  return issuerType === "venkat_sai";
}

/** Share path for a certificate's public check (the code is the random verification code, never the sequential one). */
export function verificationPath(verificationCode: string): string {
  return `/verify-certificate/${encodeURIComponent(verificationCode)}`;
}

// ---------------------------------------------------------------------------
// Locale-aware names (Intl, no data files)
// ---------------------------------------------------------------------------

/** BCP 47 tag for number / date formatting in the People Portal languages (Latin digits in all three). */
export function intlLocale(locale: string): string {
  if (locale === "hi") return "hi-IN";
  if (locale === "te") return "te-IN";
  return "en-IN";
}

export function regionName(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Venue, City, Country" without empty parts. */
export function joinPlace(parts: readonly (string | null | undefined)[]): string | null {
  const clean = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return clean.length ? [...new Set(clean)].join(", ") : null;
}

/** People Portal enrolment page for one batch of a course. */
export function courseApplyPath(slug: string, batchId: string): string {
  return `/talent/training/courses/${encodeURIComponent(slug)}/apply?batch=${encodeURIComponent(batchId)}`;
}
