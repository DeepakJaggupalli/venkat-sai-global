/**
 * English labels and small formatters for the Employer Portal talent screens (client-safe, pure).
 * Business portals are English-only.
 */

export const AVAILABILITY_LABELS: Record<string, string> = {
  immediate: "Available now",
  within_15_days: "Within 15 days",
  within_30_days: "Within 30 days",
  within_60_days: "Within 60 days",
  not_looking: "Not looking",
};

export const VERIFICATION_LEVEL_LABELS: Record<string, string> = {
  none: "Not yet verified",
  basic: "Contact verified",
  documents_verified: "Documents verified by Venkat Sai",
  skills_assessed: "Skills assessed by Venkat Sai",
};

export const PASSPORT_STATUS_LABELS: Record<string, string> = {
  none: "No passport",
  applied: "Passport applied for",
  valid: "Valid passport",
  expired: "Passport expired",
};

export const LANGUAGE_PROFICIENCY_LABELS: Record<string, string> = {
  basic: "Basic",
  conversational: "Conversational",
  fluent: "Fluent",
  native: "Native",
};

export const TALENT_LIST_KIND_LABELS: Record<string, string> = {
  shortlist: "Shortlist",
  saved_candidates: "Saved candidates",
  project: "Hiring project",
  talent_pool: "Talent pool",
};

export const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const INTERVIEW_OUTCOME_LABELS: Record<string, string> = {
  pending: "Outcome pending",
  passed: "Passed",
  failed: "Not passed",
  on_hold: "On hold",
};

export const CANDIDATE_RESPONSE_LABELS: Record<string, string> = {
  pending: "Awaiting candidate",
  confirmed: "Candidate confirmed",
  declined: "Candidate declined",
  reschedule_requested: "Candidate asked to reschedule",
};

export const PLACEMENT_STATUS_LABELS: Record<string, string> = {
  pending_joining: "Awaiting joining",
  mobilising: "Mobilising",
  joined: "Joined",
  replacement_required: "Replacement required",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const APPLICATION_SOURCE_LABELS: Record<string, string> = {
  direct: "Applied directly",
  venkat_sai: "Venkat Sai",
};

/** Tone keys accepted by StatusBadge for a few talent statuses. */
export type TalentTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand" | "gold";

export function interviewStatusTone(status: string): TalentTone {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "no_show") return "danger";
  if (status === "rescheduled") return "warning";
  return "info";
}

export function placementStatusTone(status: string): TalentTone {
  if (status === "joined" || status === "completed") return "success";
  if (status === "cancelled" || status === "replacement_required") return "danger";
  if (status === "mobilising") return "brand";
  return "info";
}

export function labelFor(map: Record<string, string>, value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  return map[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** 0 → "Fresher", 14 → "1 yr 2 mos", 24 → "2 yrs"; null → "—". */
export function formatExperience(months: number | null | undefined): string {
  if (months === null || months === undefined || Number.isNaN(months)) return "—";
  const total = Math.max(0, Math.round(months));
  if (total === 0) return "Fresher";
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "yr" : "yrs"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "mo" : "mos"}`);
  return parts.join(" ");
}

/** "Visakhapatnam, Andhra Pradesh, IN" from the available parts. */
export function formatPlace(parts: { city?: string | null; stateRegion?: string | null; countryName?: string | null; countryCode?: string | null }): string {
  const country = parts.countryName ?? parts.countryCode ?? null;
  const out = [parts.city, parts.stateRegion, country].filter((p): p is string => Boolean(p && p.trim()));
  return out.length ? out.join(", ") : "Location not shared";
}

export const MAX_COMPARE = 4;

/** Keeps a compare selection unique and at most MAX_COMPARE long (toggle semantics). */
export function toggleCompare(selected: readonly string[], id: string): { next: string[]; rejected: boolean } {
  if (selected.includes(id)) return { next: selected.filter((x) => x !== id), rejected: false };
  if (selected.length >= MAX_COMPARE) return { next: [...selected], rejected: true };
  return { next: [...selected, id], rejected: false };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses "?ids=a,b" (or repeated ids) into at most MAX_COMPARE unique UUIDs. */
export function parseCompareIds(raw: string | string[] | undefined): string[] {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  const out: string[] = [];
  for (const v of values) {
    const id = v.trim().toLowerCase();
    if (UUID_RE.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_COMPARE) break;
  }
  return out;
}

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
