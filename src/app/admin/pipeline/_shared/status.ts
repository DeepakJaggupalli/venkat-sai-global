import type { Tone } from "@/components/shared/tones";

/**
 * Tone for the many recruitment / training lifecycle values shown in the Command Centre (client-safe).
 * Labels always accompany the colour, so colour is never the only signal.
 */
const SUCCESS = new Set([
  "active", "verified", "accepted", "completed", "passed", "pass", "published", "joined", "hired", "granted", "approved", "issued",
  "fit", "confirmed", "departed", "selected", "paid", "waived", "open", "in_progress", "arrived", "not_required", "not_applicable",
]);
const WARNING = new Set([
  "pending", "submitted", "under_review", "pending_approval", "changes_requested", "waitlisted", "planned", "scheduled", "applied",
  "documents_pending", "on_hold", "retest", "paused", "disputed", "reschedule_requested", "awaiting", "full", "not_started", "draft",
]);
const DANGER = new Set([
  "rejected", "revoked", "failed", "fail", "cancelled", "unfit", "expired", "no_show", "dropped", "duplicate", "withdrawn",
  "declined", "terminated", "replacement_required", "open_flag",
]);
const INFO = new Set(["documentation", "mobilisation", "travel_booked", "visa_processing", "medical", "interview", "offer"]);

export function statusTone(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  if (SUCCESS.has(status)) return "success";
  if (DANGER.has(status)) return "danger";
  if (WARNING.has(status)) return "warning";
  if (INFO.has(status)) return "info";
  return "neutral";
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
