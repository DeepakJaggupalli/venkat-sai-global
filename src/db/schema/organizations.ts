/**
 * Organisation membership, invitations and verification.
 * Layer 4 — may import: taxonomy, core, identity.
 */
import { foreignKey, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtOnly, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { files, organizations, users } from "./core";
import { roles } from "./identity";

export const MEMBER_STATUSES = ["invited", "active", "disabled"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Role with scope = organisation type (template or org-specific custom role). */
    roleId: uuid()
      .notNull()
      .references(() => roles.id),
    status: text({ enum: MEMBER_STATUSES }).notNull().default("active"),
    jobTitle: text(),
    department: text(),
    /** Branch / office the member belongs to (employers with branches). Soft reference. */
    branchId: uuid(),
    invitedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    joinedAt: tstz(),
    lastActiveAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("organization_members_org_user_uq").on(t.organizationId, t.userId),
    index("organization_members_user_idx").on(t.userId),
  ],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text().notNull(),
    roleId: uuid()
      .notNull()
      .references(() => roles.id),
    tokenHash: text().notNull(),
    invitedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: tstz().notNull(),
    acceptedAt: tstz(),
    acceptedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    revokedAt: tstz(),
    ...createdAtOnly,
  },
  (t) => [
    uniqueIndex("organization_invitations_token_uq").on(t.tokenHash),
    index("organization_invitations_org_idx").on(t.organizationId),
    index("organization_invitations_email_idx").on(t.email),
  ],
);

export const VERIFICATION_SUBMISSION_STATUSES = ["submitted", "under_review", "approved", "rejected", "changes_requested", "withdrawn"] as const;

/** Each verification submission (history kept; the organisation row holds the current status). */
export const organizationVerifications = pgTable(
  "organization_verifications",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: text({ enum: VERIFICATION_SUBMISSION_STATUSES }).notNull().default("submitted"),
    submittedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    submittedAt: tstz().notNull().defaultNow(),
    reviewedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: tstz(),
    decisionNotes: text(),
    /** Reviewer checklist results: { registrationChecked: true, licenceChecked: false, ... } */
    checklist: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    /** Verification validity end (e.g. licence expiry). */
    validUntil: tstz(),
    /** Linked approval request (approvals module). Soft reference. */
    approvalRequestId: uuid(),
    ...timestamps,
  },
  (t) => [index("organization_verifications_org_idx").on(t.organizationId, t.submittedAt)],
);

export const ORG_DOCUMENT_TYPES = [
  "registration_certificate",
  "tax_registration",
  "recruiting_agent_licence",
  "authorisation_letter",
  "accreditation",
  "affiliation",
  "address_proof",
  "agreement",
  "other",
] as const;
export type OrgDocumentType = (typeof ORG_DOCUMENT_TYPES)[number];

export const organizationDocuments = pgTable(
  "organization_documents",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** FK organization_documents_verification_fk (set null). */
    verificationId: uuid(),
    documentType: text({ enum: ORG_DOCUMENT_TYPES }).notNull(),
    title: text(),
    fileId: uuid()
      .notNull()
      .references(() => files.id),
    documentNumber: text(),
    issuedBy: text(),
    issuedAt: tstz(),
    expiresAt: tstz(),
    reviewStatus: text({ enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
    reviewNotes: text(),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("organization_documents_org_idx").on(t.organizationId),
    index("organization_documents_expiry_idx").on(t.expiresAt),
    // Explicit name: the generated one exceeds PostgreSQL's 63-byte limit and is truncated, which made
    // drizzle-kit push drop and re-add the constraint on every run.
    foreignKey({ columns: [t.verificationId], foreignColumns: [organizationVerifications.id], name: "organization_documents_verification_fk" }).onDelete(
      "set null",
    ),
  ],
);
