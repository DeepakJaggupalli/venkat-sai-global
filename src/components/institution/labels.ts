/**
 * Institution Portal wording and badge tones (client-safe). Enum labels that the training module already
 * provides are re-used from `@/modules/training/constants`; this file adds the statuses it does not label.
 */
import type { Tone } from "@/components/shared/tones";
import {
  BATCH_STATUS_LABELS,
  COURSE_CATEGORY_LABELS,
  COURSE_CERTIFICATION_TYPE_LABELS,
  COURSE_FEE_TYPE_LABELS,
  COURSE_MODE_LABELS,
  ENROLMENT_STATUS_LABELS,
} from "@/modules/training/constants";

export { BATCH_STATUS_LABELS, COURSE_CATEGORY_LABELS, COURSE_CERTIFICATION_TYPE_LABELS, COURSE_FEE_TYPE_LABELS, COURSE_MODE_LABELS, ENROLMENT_STATUS_LABELS };

export type Badge = { label: string; tone: Tone };

const badge = (map: Record<string, Badge>, value: string): Badge => map[value] ?? { label: value.replace(/_/g, " "), tone: "neutral" };

export const COURSE_STATUS: Record<string, Badge> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "In review", tone: "info" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  published: { label: "Published", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
};
export const courseStatus = (s: string) => badge(COURSE_STATUS, s);

export const BATCH_STATUS: Record<string, Badge> = {
  planned: { label: BATCH_STATUS_LABELS.planned, tone: "neutral" },
  open: { label: BATCH_STATUS_LABELS.open, tone: "info" },
  full: { label: BATCH_STATUS_LABELS.full, tone: "gold" },
  in_progress: { label: BATCH_STATUS_LABELS.in_progress, tone: "brand" },
  completed: { label: BATCH_STATUS_LABELS.completed, tone: "success" },
  cancelled: { label: BATCH_STATUS_LABELS.cancelled, tone: "danger" },
};
export const batchStatus = (s: string) => badge(BATCH_STATUS, s);

export const ENROLMENT_STATUS: Record<string, Badge> = {
  applied: { label: ENROLMENT_STATUS_LABELS.applied, tone: "info" },
  confirmed: { label: ENROLMENT_STATUS_LABELS.confirmed, tone: "brand" },
  waitlisted: { label: ENROLMENT_STATUS_LABELS.waitlisted, tone: "gold" },
  rejected: { label: ENROLMENT_STATUS_LABELS.rejected, tone: "neutral" },
  in_progress: { label: ENROLMENT_STATUS_LABELS.in_progress, tone: "brand" },
  completed: { label: ENROLMENT_STATUS_LABELS.completed, tone: "success" },
  dropped: { label: ENROLMENT_STATUS_LABELS.dropped, tone: "warning" },
  cancelled: { label: ENROLMENT_STATUS_LABELS.cancelled, tone: "neutral" },
};
export const enrolmentStatus = (s: string) => badge(ENROLMENT_STATUS, s);

export const RESULT_STATUS: Record<string, Badge> = {
  pending: { label: "Result pending", tone: "neutral" },
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Not passed", tone: "danger" },
  not_applicable: { label: "No graded result", tone: "neutral" },
};
export const resultStatus = (s: string) => badge(RESULT_STATUS, s);

export const FEE_STATUS_LABELS: Record<string, string> = {
  not_applicable: "No fee",
  pending: "Fee pending",
  paid: "Paid",
  waived: "Waived",
  refunded: "Refunded",
};

export const CERTIFICATE_STATUS: Record<string, Badge> = {
  active: { label: "Active", tone: "success" },
  revoked: { label: "Revoked", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};
export const certificateStatus = (s: string) => badge(CERTIFICATE_STATUS, s);

export const ISSUER_TYPE_SHORT: Record<string, string> = {
  venkat_sai: "Venkat Sai assessment",
  institution_completion: "Certificate of completion",
  accredited_external: "Accredited (external awarding body)",
};

export const DRIVE_STATUS: Record<string, Badge> = {
  planned: { label: "Planned", tone: "neutral" },
  open: { label: "Open for registration", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
export const driveStatus = (s: string) => badge(DRIVE_STATUS, s);

export const REGISTRATION_STATUS: Record<string, Badge> = {
  registered: { label: "Registered", tone: "info" },
  shortlisted: { label: "Shortlisted", tone: "brand" },
  attended: { label: "Attended", tone: "neutral" },
  absent: { label: "Absent", tone: "warning" },
  selected: { label: "Selected", tone: "success" },
  not_selected: { label: "Not selected", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};
export const registrationStatus = (s: string) => badge(REGISTRATION_STATUS, s);

export const INTERNSHIP_STATUS: Record<string, Badge> = {
  draft: { label: "Draft", tone: "neutral" },
  open: { label: "Open", tone: "info" },
  closed: { label: "Closed", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
export const internshipStatus = (s: string) => badge(INTERNSHIP_STATUS, s);

export const ATTENDANCE_LABELS: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };
export const ASSESSMENT_TYPE_LABELS: Record<string, string> = { theory: "Theory", practical: "Practical", viva: "Viva", project: "Project" };
export const INSTRUCTOR_ROLE_LABELS: Record<string, string> = { lead: "Lead instructor", assistant: "Assistant instructor", guest: "Guest instructor" };
export const DRIVE_MODE_LABELS: Record<string, string> = { in_person: "In person", online: "Online", hybrid: "Hybrid" };
export const STIPEND_TYPE_LABELS: Record<string, string> = { fixed: "Fixed stipend", unpaid: "Unpaid", not_disclosed: "Not disclosed" };
export const OUTCOME_SOURCE_LABELS: Record<string, string> = {
  campus_drive: "Campus drive",
  institution: "Institution placement cell",
  venkat_sai: "Venkat Sai",
  self: "Found by the learner",
  other: "Other",
};

/** Options helper for SimpleSelect. */
export const toOptions = (labels: Record<string, string>, keys?: readonly string[]) => (keys ?? Object.keys(labels)).map((value) => ({ value, label: labels[value] ?? value }));

/** Percent with one decimal, or null when the denominator is zero (never an invented value). */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Display a numeric percentage, "—" for null. */
export const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);

/** `<input type="datetime-local">` value (viewer's local time) → ISO 8601 with offset, or "" when blank. */
export function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** ISO / Date → value for `<input type="datetime-local">` in the viewer's local time. */
export function isoToLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

