import { humanize } from "@/lib/format";

import type { Tone } from "./tones";

/**
 * Status → tone/label presets for the domain enumerations in docs/DATA_MODEL.md (client-safe, pure).
 * Kept as plain string maps (not imported from the domain schema files) so the design system has no
 * dependency on domain modules. Unknown values fall back to the generic map, then to a neutral badge
 * with a humanised label — a new status never crashes the UI.
 */
export type StatusDefinition = { tone: Tone; label?: string };
export type StatusPreset = Record<string, StatusDefinition>;

export const STATUS_DOMAINS = [
  "verification",
  "organization",
  "job",
  "application",
  "applicationStage",
  "payment",
  "invoice",
  "ticket",
  "approval",
  "generic",
] as const;
export type StatusDomain = (typeof STATUS_DOMAINS)[number];

/** Verification lifecycle (organisations, documents, licences, credentials — spec 9.1). */
const verification: StatusPreset = {
  draft: { tone: "neutral", label: "Draft" },
  unverified: { tone: "neutral", label: "Not verified" },
  none: { tone: "neutral", label: "Not verified" },
  pending: { tone: "warning", label: "Pending" },
  submitted: { tone: "info", label: "Submitted" },
  under_review: { tone: "info", label: "Under review" },
  changes_requested: { tone: "warning", label: "Changes requested" },
  verified: { tone: "success", label: "Verified" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" },
  suspended: { tone: "danger", label: "Suspended" },
  expired: { tone: "warning", label: "Expired" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
};

/** jobs.status */
const job: StatusPreset = {
  draft: { tone: "neutral", label: "Draft" },
  pending_approval: { tone: "warning", label: "Pending approval" },
  changes_requested: { tone: "warning", label: "Changes requested" },
  published: { tone: "success", label: "Published" },
  paused: { tone: "gold", label: "Paused" },
  closed: { tone: "neutral", label: "Closed" },
  rejected: { tone: "danger", label: "Rejected" },
  archived: { tone: "neutral", label: "Archived" },
};

/** applications.status */
const application: StatusPreset = {
  active: { tone: "info", label: "In progress" },
  hired: { tone: "success", label: "Hired" },
  rejected: { tone: "danger", label: "Not selected" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
  closed: { tone: "neutral", label: "Closed" },
};

/** workflow_stages.category (pipeline stage families). */
const applicationStage: StatusPreset = {
  applied: { tone: "info", label: "Applied" },
  screening: { tone: "info", label: "Screening" },
  assessment: { tone: "brand", label: "Assessment" },
  interview: { tone: "brand", label: "Interview" },
  decision: { tone: "warning", label: "Decision" },
  offer: { tone: "gold", label: "Offer" },
  pre_joining: { tone: "brand", label: "Pre-joining" },
  joined: { tone: "success", label: "Joined" },
  closed: { tone: "neutral", label: "Closed" },
  rejected: { tone: "danger", label: "Not selected" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
};

/** payments.status */
const payment: StatusPreset = {
  pending: { tone: "warning", label: "Pending" },
  succeeded: { tone: "success", label: "Succeeded" },
  failed: { tone: "danger", label: "Failed" },
  refunded: { tone: "neutral", label: "Refunded" },
  partially_refunded: { tone: "neutral", label: "Partially refunded" },
};

/** invoices.status */
const invoice: StatusPreset = {
  draft: { tone: "neutral", label: "Draft" },
  issued: { tone: "info", label: "Issued" },
  paid: { tone: "success", label: "Paid" },
  partially_paid: { tone: "warning", label: "Partially paid" },
  void: { tone: "neutral", label: "Void" },
  overdue: { tone: "danger", label: "Overdue" },
  refunded: { tone: "neutral", label: "Refunded" },
};

/** support_tickets.status */
const ticket: StatusPreset = {
  open: { tone: "info", label: "Open" },
  pending_staff: { tone: "warning", label: "Awaiting support" },
  pending_requester: { tone: "gold", label: "Awaiting reply" },
  on_hold: { tone: "neutral", label: "On hold" },
  resolved: { tone: "success", label: "Resolved" },
  closed: { tone: "neutral", label: "Closed" },
};

/** approval_requests.status */
const approval: StatusPreset = {
  pending: { tone: "warning", label: "Pending" },
  in_review: { tone: "info", label: "In review" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" },
  changes_requested: { tone: "warning", label: "Changes requested" },
  escalated: { tone: "danger", label: "Escalated" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

/** Common lifecycle words used across many tables (fallback for every domain). */
const generic: StatusPreset = {
  active: { tone: "success", label: "Active" },
  inactive: { tone: "neutral", label: "Inactive" },
  enabled: { tone: "success", label: "Enabled" },
  disabled: { tone: "neutral", label: "Disabled" },
  invited: { tone: "info", label: "Invited" },
  new: { tone: "info", label: "New" },
  open: { tone: "info", label: "Open" },
  planned: { tone: "neutral", label: "Planned" },
  scheduled: { tone: "info", label: "Scheduled" },
  rescheduled: { tone: "info", label: "Rescheduled" },
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "info", label: "Running" },
  in_progress: { tone: "info", label: "In progress" },
  processing: { tone: "info", label: "Processing" },
  pending: { tone: "warning", label: "Pending" },
  on_hold: { tone: "neutral", label: "On hold" },
  paused: { tone: "gold", label: "Paused" },
  completed: { tone: "success", label: "Completed" },
  succeeded: { tone: "success", label: "Succeeded" },
  done: { tone: "success", label: "Done" },
  passed: { tone: "success", label: "Passed" },
  pass: { tone: "success", label: "Pass" },
  published: { tone: "success", label: "Published" },
  approved: { tone: "success", label: "Approved" },
  accepted: { tone: "success", label: "Accepted" },
  verified: { tone: "success", label: "Verified" },
  paid: { tone: "success", label: "Paid" },
  clean: { tone: "success", label: "Clean" },
  failed: { tone: "danger", label: "Failed" },
  fail: { tone: "danger", label: "Fail" },
  dead: { tone: "danger", label: "Failed permanently" },
  error: { tone: "danger", label: "Error" },
  rejected: { tone: "danger", label: "Rejected" },
  declined: { tone: "danger", label: "Declined" },
  revoked: { tone: "danger", label: "Revoked" },
  terminated: { tone: "danger", label: "Terminated" },
  suspended: { tone: "danger", label: "Suspended" },
  infected: { tone: "danger", label: "Infected" },
  overdue: { tone: "danger", label: "Overdue" },
  no_show: { tone: "danger", label: "No show" },
  disputed: { tone: "danger", label: "Disputed" },
  expired: { tone: "warning", label: "Expired" },
  retest: { tone: "warning", label: "Retest" },
  draft: { tone: "neutral", label: "Draft" },
  archived: { tone: "neutral", label: "Archived" },
  closed: { tone: "neutral", label: "Closed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
  superseded: { tone: "neutral", label: "Superseded" },
  not_applicable: { tone: "neutral", label: "Not applicable" },
  not_started: { tone: "neutral", label: "Not started" },
};

export const STATUS_PRESETS: Record<StatusDomain, StatusPreset> = {
  verification,
  organization: verification,
  job,
  application,
  applicationStage,
  payment,
  invoice,
  ticket,
  approval,
  generic,
};

export type ResolvedStatus = { tone: Tone; label: string; known: boolean };

/** Normalise "Under Review" / "under-review" / "UNDER_REVIEW" → "under_review". */
export function normalizeStatusKey(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Resolve a raw status value to a tone and a human label: domain preset → generic preset →
 * neutral with a humanised label. Pass `overrides` to adjust wording per audience
 * (e.g. candidate-facing copy) without forking the preset.
 */
export function resolveStatus(
  status: string | null | undefined,
  domain: StatusDomain = "generic",
  overrides?: StatusPreset,
): ResolvedStatus {
  if (!status || !status.trim()) return { tone: "neutral", label: "Unknown", known: false };
  const key = normalizeStatusKey(status);
  const def = overrides?.[key] ?? STATUS_PRESETS[domain][key] ?? STATUS_PRESETS.generic[key];
  if (def) return { tone: def.tone, label: def.label ?? humanize(key), known: true };
  return { tone: "neutral", label: humanize(key), known: false };
}
