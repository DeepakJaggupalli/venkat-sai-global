/**
 * Privacy module constants and pure rules (client-safe). DPDP Act 2023 data principal rights:
 * access / export (s.11), correction and erasure (s.12), grievance redressal (s.13), nomination (s.14),
 * consent withdrawal (s.6(4)).
 */
import type { DATA_REQUEST_STATUSES, DATA_REQUEST_TYPES } from "@/db/schema/system";

export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

export const DATA_REQUEST_TYPE_LABELS: Record<DataRequestType, string> = {
  access: "Access to my data",
  export: "Copy of my data (export)",
  correction: "Correct my data",
  deletion: "Delete my data and close my account",
  consent_withdrawal: "Withdraw consent",
  objection: "Objection to processing",
  nomination: "Nominate someone to act for me",
};

export const DATA_REQUEST_TYPE_DESCRIPTIONS: Record<DataRequestType, string> = {
  access: "A summary of the personal data we hold about you and how it is used.",
  export: "A machine-readable file (JSON) of your account, profile, applications, consents, notifications and support requests.",
  correction: "Tell us what is wrong or incomplete. Our team checks and corrects it.",
  deletion: "We close your account and delete or anonymise your personal data, except records the law requires us to keep.",
  consent_withdrawal: "Stop a specific use of your data that you previously agreed to.",
  objection: "Raise a concern about how your data is processed.",
  nomination: "Name a person who can exercise your rights if you are unable to.",
};

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestStatus, string> = {
  received: "Received",
  identity_verification: "Verifying identity",
  in_progress: "In progress",
  completed: "Completed",
  rejected: "Declined",
  cancelled: "Cancelled",
};

export const DATA_REQUEST_TYPE_VALUES = Object.keys(DATA_REQUEST_TYPE_LABELS) as [DataRequestType, ...DataRequestType[]];
export const DATA_REQUEST_STATUS_VALUES = Object.keys(DATA_REQUEST_STATUS_LABELS) as [DataRequestStatus, ...DataRequestStatus[]];

/** Types a signed-in person can raise from /account/privacy (others go through support or the grievance officer). */
export const SELF_SERVICE_REQUEST_TYPES = ["export", "access", "correction", "deletion"] as const satisfies readonly DataRequestType[];
export type SelfServiceRequestType = (typeof SELF_SERVICE_REQUEST_TYPES)[number];

/** Types a guest (no account / cannot sign in) can raise after verifying their email address. */
export const GUEST_REQUEST_TYPES = ["access", "export", "correction", "deletion", "objection"] as const satisfies readonly DataRequestType[];

export const OPEN_DATA_REQUEST_STATUSES: readonly DataRequestStatus[] = ["received", "identity_verification", "in_progress"];
export const CLOSED_DATA_REQUEST_STATUSES: readonly DataRequestStatus[] = ["completed", "rejected", "cancelled"];

/** Staff transitions. Completion of export / deletion requests is done by the background tasks. */
export const DATA_REQUEST_TRANSITIONS: Record<DataRequestStatus, readonly DataRequestStatus[]> = {
  received: ["identity_verification", "in_progress", "rejected", "cancelled"],
  identity_verification: ["in_progress", "rejected", "cancelled"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionDataRequest(from: DataRequestStatus, to: DataRequestStatus): boolean {
  return DATA_REQUEST_TRANSITIONS[from].includes(to);
}

/** Marker the People Portal privacy page writes into `details` when the person also asks to close the account. */
export const CLOSE_ACCOUNT_MARKER = "[close_account]";

/** How long an export download stays available after it is generated (days). */
export const EXPORT_LINK_DAYS = 7;

/** Days before the due date at which the SLA watch starts reminding staff. */
export const SLA_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

/** Response deadline from the setting `privacy.data_request_sla_days` (never hardcoded). */
export function computeDataRequestDueAt(createdAt: Date, slaDays: number): Date {
  const days = Number.isFinite(slaDays) && slaDays > 0 ? slaDays : 30;
  return new Date(createdAt.getTime() + days * DAY_MS);
}

export type DataRequestSlaState = "none" | "on_track" | "due_soon" | "overdue" | "closed";

export function dataRequestSlaState(req: { status: DataRequestStatus; dueAt: Date | null }, now: Date = new Date()): DataRequestSlaState {
  if (CLOSED_DATA_REQUEST_STATUSES.includes(req.status)) return "closed";
  if (!req.dueAt) return "none";
  const remaining = req.dueAt.getTime() - now.getTime();
  if (remaining < 0) return "overdue";
  if (remaining <= SLA_WARNING_DAYS * DAY_MS) return "due_soon";
  return "on_track";
}

export function exportExpiresAt(generatedAt: Date): Date {
  return new Date(generatedAt.getTime() + EXPORT_LINK_DAYS * DAY_MS);
}

export function isExportExpired(generatedAt: Date | null, now: Date = new Date()): boolean {
  if (!generatedAt) return true;
  return exportExpiresAt(generatedAt).getTime() <= now.getTime();
}

/**
 * Records kept after an erasure request, with the reason (shown to staff and written to
 * `retentionExceptions`). To be validated by counsel (docs/research/regulatory-notes.md).
 */
export const RETENTION_EXCEPTIONS: readonly { key: string; label: string; reason: string }[] = [
  { key: "invoices", label: "Invoices, credit notes and payments", reason: "Tax records kept for the period the GST law requires." },
  { key: "placements", label: "Placement, mobilisation and emigration records", reason: "Recruitment records a recruiting agent must keep under the Emigration Act and Rules." },
  { key: "certificates", label: "Issued certificates and assessment results", reason: "Kept so issued certificates can still be verified; personal details are minimised." },
  { key: "grievances", label: "Grievance register entries", reason: "Kept as part of the grievance register required under the IT Rules." },
  { key: "consents", label: "Consent records", reason: "Proof of what was agreed and when (DPDP Act)." },
  { key: "security", label: "Audit, security and access logs", reason: "Kept to protect the platform and investigate misuse; they reference an anonymised account." },
];

/** File purposes deleted on erasure (no retention obligation). Others (invoice, certificate, mobilisation_document…) are kept. */
export const ERASABLE_FILE_PURPOSES = [
  "avatar",
  "resume",
  "candidate_document",
  "candidate_credential",
  "portfolio_media",
  "application_attachment",
  "ticket_attachment",
  "message_attachment",
  "data_export",
] as const;

export function parseCloseAccountMarker(details: string | null | undefined): { closeAccount: boolean; text: string | null } {
  if (!details) return { closeAccount: false, text: null };
  const closeAccount = details.includes(CLOSE_ACCOUNT_MARKER);
  const text = details
    .split("\n")
    .filter((line) => !line.startsWith(CLOSE_ACCOUNT_MARKER))
    .join("\n")
    .trim();
  return { closeAccount, text: text || null };
}
