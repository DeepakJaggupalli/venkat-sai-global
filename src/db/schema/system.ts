/**
 * Cross-cutting platform tables: file access, background jobs, sequences,
 * settings, feature flags, rate limiting, audit/security/data-access logs,
 * privacy (data subject) requests, the unified approval inbox and the dev outbox.
 * Layer 5 — may import: taxonomy, core, identity, organizations.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtOnly, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { files, organizations, users } from "./core";

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Explicit, revocable access to a private file for someone other than its owner
 * (e.g. an employer allowed to view a candidate's resume after the candidate applied
 * or consented). Staff access is permission-based and logged in data_access_logs.
 */
export const fileAccessGrants = pgTable(
  "file_access_grants",
  {
    id: pk(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    granteeUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    granteeOrganizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    grantedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text().notNull(),
    contextType: text(),
    contextId: uuid(),
    expiresAt: tstz(),
    revokedAt: tstz(),
    ...createdAtOnly,
  },
  (t) => [
    index("file_access_grants_file_idx").on(t.fileId),
    index("file_access_grants_user_idx").on(t.granteeUserId),
    index("file_access_grants_org_idx").on(t.granteeOrganizationId),
    index("file_access_grants_granted_by_idx").on(t.grantedByUserId),
  ],
);

// ---------------------------------------------------------------------------
// Background jobs (PostgreSQL queue, processed by `npm run worker` or /api/v1/cron/jobs)
// ---------------------------------------------------------------------------

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "dead"] as const;

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    queue: text().notNull().default("default"),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    status: text({ enum: JOB_STATUSES }).notNull().default("queued"),
    runAt: tstz().notNull().defaultNow(),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(5),
    lastError: text(),
    lockedAt: tstz(),
    lockedBy: text(),
    completedAt: tstz(),
    /** Optional idempotency key: a second enqueue with the same key is ignored while the first exists. */
    dedupeKey: text(),
    ...createdAtOnly,
  },
  (t) => [
    index("background_jobs_ready_idx").on(t.status, t.runAt),
    uniqueIndex("background_jobs_dedupe_uq").on(t.dedupeKey),
    index("background_jobs_type_idx").on(t.type),
  ],
);

// ---------------------------------------------------------------------------
// Human-readable code sequences (VSG-JOB-000123, VSG-APP-000045, ...)
// ---------------------------------------------------------------------------

export const codeSequences = pgTable("code_sequences", {
  key: text().primaryKey(),
  value: bigint({ mode: "number" }).notNull().default(0),
  updatedAt: tstz().notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Settings & feature flags (administered from /admin/settings)
// ---------------------------------------------------------------------------

export const platformSettings = pgTable(
  "platform_settings",
  {
    key: text().primaryKey(),
    value: jsonb().$type<unknown>().notNull(),
    description: text(),
    updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("platform_settings_updated_by_idx").on(t.updatedByUserId)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text().primaryKey(),
    enabled: boolean().notNull().default(false),
    name: text().notNull(),
    description: text(),
    /** Module grouping in the admin UI (e.g. "portals", "commercial", "analytics"). */
    category: text().notNull().default("general"),
    /** Optional targeting rules: { portals?: string[], orgIds?: string[], staffOnly?: boolean } */
    rules: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("feature_flags_updated_by_idx").on(t.updatedByUserId)],
);

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, shared across serverless instances)
// ---------------------------------------------------------------------------

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text().primaryKey(),
    count: integer().notNull().default(0),
    windowStartedAt: tstz().notNull().defaultNow(),
    expiresAt: tstz().notNull(),
  },
  (t) => [index("rate_limit_buckets_expires_idx").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Audit, security and data-access logs (append-only)
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: tstz().notNull().defaultNow(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    actorType: text({ enum: ["user", "staff", "system", "anonymous", "api"] }).notNull(),
    /** Dotted verb, e.g. "job.approved", "user.suspended", "cms.entry_published". */
    action: text().notNull(),
    entityType: text(),
    entityId: text(),
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    ipHash: text(),
    userAgent: text(),
    requestId: text(),
    /** Context and field-level changes. Never store secrets or raw sensitive documents. */
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorUserId, t.occurredAt),
    index("audit_logs_org_idx").on(t.organizationId, t.occurredAt),
    index("audit_logs_action_idx").on(t.action, t.occurredAt),
    index("audit_logs_occurred_idx").on(t.occurredAt),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: tstz().notNull().defaultNow(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** login_succeeded, login_failed, account_locked, password_changed, password_reset, otp_sent,
     *  otp_failed, two_factor_enabled, two_factor_disabled, session_revoked, role_changed, suspicious_activity... */
    type: text().notNull(),
    severity: text({ enum: ["info", "warning", "critical"] }).notNull().default("info"),
    ipHash: text(),
    userAgent: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
  },
  (t) => [index("security_events_user_idx").on(t.userId, t.occurredAt), index("security_events_type_idx").on(t.type, t.occurredAt)],
);

/** Every view/download/reveal of sensitive personal data by staff or organisations. */
export const dataAccessLogs = pgTable(
  "data_access_logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: tstz().notNull().defaultNow(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    actorOrganizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    subjectUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    subjectType: text().notNull(),
    subjectId: text().notNull(),
    /** contact, identity_document, documents, profile, analytics_session, payment, export... */
    dataCategory: text().notNull(),
    accessType: text({ enum: ["view", "reveal", "download", "export", "share"] }).notNull(),
    reason: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
  },
  (t) => [
    index("data_access_logs_subject_idx").on(t.subjectUserId, t.occurredAt),
    index("data_access_logs_actor_idx").on(t.actorUserId, t.occurredAt),
    index("data_access_logs_actor_org_idx").on(t.actorOrganizationId),
  ],
);

// ---------------------------------------------------------------------------
// Privacy / data-subject requests (DPDP Act 2023, GDPR where applicable)
// ---------------------------------------------------------------------------

export const DATA_REQUEST_TYPES = ["access", "export", "correction", "deletion", "consent_withdrawal", "objection", "nomination"] as const;
export const DATA_REQUEST_STATUSES = ["received", "identity_verification", "in_progress", "completed", "rejected", "cancelled"] as const;

export const dataRequests = pgTable(
  "data_requests",
  {
    id: pk(),
    code: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    requesterName: text(),
    requesterEmail: text(),
    requesterPhone: text(),
    type: text({ enum: DATA_REQUEST_TYPES }).notNull(),
    status: text({ enum: DATA_REQUEST_STATUSES }).notNull().default("received"),
    details: text(),
    dueAt: tstz(),
    identityVerifiedAt: tstz(),
    completedAt: tstz(),
    handledByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolution: text(),
    /** Reason some data must be retained despite a deletion request (legal/contractual hold). */
    retentionExceptions: text(),
    exportFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("data_requests_code_uq").on(t.code),
    index("data_requests_status_idx").on(t.status, t.dueAt),
    index("data_requests_user_idx").on(t.userId),
    index("data_requests_handled_by_idx").on(t.handledByUserId),
    index("data_requests_export_file_idx").on(t.exportFileId),
  ],
);

// ---------------------------------------------------------------------------
// Unified approval inbox (/admin/approvals)
// ---------------------------------------------------------------------------

/**
 * Approval types. Each type has a handler in src/modules/approvals/handlers that applies
 * the decision to the underlying entity.
 */
export const APPROVAL_TYPES = [
  "employer_verification",
  "partner_verification",
  "institution_verification",
  "job_publication",
  "candidate_document",
  "candidate_credential",
  "course_publication",
  "testimonial",
  "case_study",
  "partner_announcement",
  "media_asset",
  "content_publication",
  "refund",
  "subscription_exception",
  "partner_settlement",
  "requirement_request",
] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = ["pending", "in_review", "approved", "rejected", "changes_requested", "escalated", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: pk(),
    code: text().notNull(),
    type: text({ enum: APPROVAL_TYPES }).notNull(),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    title: text().notNull(),
    summary: text(),
    /** Snapshot of what is being approved, rendered in the approval detail view. */
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    status: text({ enum: APPROVAL_STATUSES }).notNull().default("pending"),
    priority: text({ enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
    submittedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: tstz(),
    decisionReason: text(),
    dueAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("approval_requests_code_uq").on(t.code),
    index("approval_requests_status_idx").on(t.status, t.type, t.createdAt),
    index("approval_requests_entity_idx").on(t.entityType, t.entityId),
    index("approval_requests_assignee_idx").on(t.assignedToUserId, t.status),
    index("approval_requests_org_idx").on(t.organizationId),
    index("approval_requests_submitted_by_idx").on(t.submittedByUserId),
    index("approval_requests_decided_by_idx").on(t.decidedByUserId),
    // At most one open request per entity and type.
    uniqueIndex("approval_requests_open_uq")
      .on(t.type, t.entityId)
      .where(sql`status in ('pending','in_review','escalated','changes_requested')`),
  ],
);

export const approvalEvents = pgTable(
  "approval_events",
  {
    id: pk(),
    approvalRequestId: uuid()
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    action: text({
      enum: ["submitted", "resubmitted", "assigned", "commented", "approved", "rejected", "changes_requested", "escalated", "cancelled"],
    }).notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    note: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    ...createdAtOnly,
  },
  (t) => [index("approval_events_request_idx").on(t.approvalRequestId, t.createdAt), index("approval_events_actor_idx").on(t.actorUserId)],
);

// ---------------------------------------------------------------------------
// Development outbox: emails/SMS/WhatsApp captured instead of sent when the
// transport is "dev" (viewable by staff at /admin/system/dev-outbox).
// ---------------------------------------------------------------------------

export const devOutbox = pgTable(
  "dev_outbox",
  {
    id: pk(),
    channel: text({ enum: ["email", "sms", "whatsapp"] }).notNull(),
    to: text().notNull(),
    subject: text(),
    bodyText: text(),
    bodyHtml: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    ...createdAtOnly,
  },
  (t) => [index("dev_outbox_created_idx").on(t.createdAt)],
);
