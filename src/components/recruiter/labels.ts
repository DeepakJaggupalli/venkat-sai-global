/**
 * Partner Portal display labels and status tones (client-safe). Business portal: English only.
 */
import type { Tone } from "@/components/shared/tones";

type Labelled = { label: string; tone: Tone };

export const ASSIGNMENT_STATUS: Record<string, Labelled> = {
  active: { label: "Open for submissions", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  revoked: { label: "Withdrawn by Venkat Sai", tone: "neutral" },
};

export const SUBMISSION_STATUS: Record<string, Labelled> = {
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under review", tone: "info" },
  duplicate: { label: "Duplicate – held for review", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Not accepted", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const ATTRIBUTION_STATUS: Record<string, Labelled> = {
  active: { label: "Attributed to you", tone: "success" },
  expired: { label: "Attribution ended", tone: "neutral" },
  disputed: { label: "Attribution under review", tone: "warning" },
  revoked: { label: "Attribution removed", tone: "neutral" },
};

export const CONSENT_STATE: Record<string, Labelled> = {
  recorded: { label: "Consent recorded", tone: "success" },
  withdrawn: { label: "Consent withdrawn", tone: "danger" },
  partner_submissions_off: { label: "Candidate turned off partner submissions", tone: "warning" },
  none: { label: "No consent on record", tone: "neutral" },
};

export const LICENCE_STATUS: Record<string, Labelled> = {
  pending: { label: "Awaiting verification", tone: "info" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

export const AGREEMENT_STATUS: Record<string, Labelled> = {
  pending: { label: "Awaiting your acceptance", tone: "warning" },
  active: { label: "In force", tone: "success" },
  superseded: { label: "Replaced by a newer version", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  terminated: { label: "Terminated", tone: "neutral" },
};

export const SETTLEMENT_STATUS: Record<string, Labelled> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Being approved", tone: "info" },
  approved: { label: "Approved – awaiting payment", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  disputed: { label: "Query raised", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const INTERVIEW_STATUS: Record<string, Labelled> = {
  scheduled: { label: "Scheduled", tone: "info" },
  rescheduled: { label: "Rescheduled", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "Candidate did not attend", tone: "danger" },
};

export const INTERVIEW_RESPONSE: Record<string, string> = {
  pending: "Awaiting candidate reply",
  confirmed: "Candidate confirmed",
  declined: "Candidate declined",
  reschedule_requested: "Candidate asked to reschedule",
};

export const CHECKLIST_STATUS: Record<string, Labelled> = {
  pending: { label: "Needed", tone: "warning" },
  submitted: { label: "Submitted – being checked", tone: "info" },
  verified: { label: "Verified", tone: "success" },
  not_applicable: { label: "Not needed", tone: "neutral" },
  rejected: { label: "Needs a new upload", tone: "danger" },
};

export const RESPONSIBLE_PARTY_LABELS: Record<string, string> = {
  candidate: "Candidate",
  venkat_sai: "Venkat Sai",
  employer: "Employer",
  partner: "Your agency",
};

export const CONSENT_METHOD_LABELS: Record<string, string> = {
  written: "Written (signed form)",
  electronic: "Electronic (email, message or form)",
  verbal: "Verbal (phone or video call)",
  in_person: "In person",
};

export const SETTLEMENT_LINE_LABELS: Record<string, string> = {
  placement_fee: "Placement fee",
  bonus: "Bonus",
  adjustment: "Adjustment",
  deduction: "Deduction",
};

export function labelOf(map: Record<string, Labelled>, value: string): Labelled {
  return map[value] ?? { label: value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), tone: "neutral" };
}

/** "3 years 4 months" from months (null when unknown). */
export function formatExperience(months: number | null | undefined): string | null {
  if (months === null || months === undefined) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "month" : "months"}`);
  return parts.length ? parts.join(" ") : "Less than a month";
}

/** Percentage text for a 0–1 ratio (null → "—"). */
export function formatRate(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  return `${Math.round(ratio * 1000) / 10}%`;
}

/** Days between today (UTC) and an ISO date or instant; negative when past. */
export function daysUntil(value: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  const target = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((day - today) / 86_400_000);
}
