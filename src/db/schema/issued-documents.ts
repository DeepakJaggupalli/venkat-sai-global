/**
 * Interns and the certificates / letters generated for interns and trainees. Layer 23 — after training.
 *
 * internship_participants: the people doing one of the internship programmes (online or on site). A participant
 * may be linked to a People Portal profile (candidateId) or just carry a name, email and phone typed by staff, so
 * online interns without an account still get their documents.
 *
 * issued_documents: course completion certificates, internship offer letters, internship completion certificates
 * and letters of recommendation. They are created automatically (a course completed, an intern started or
 * finished) or on request (the person asks from the People Portal), wait for staff approval (training.certificates),
 * and only then can be downloaded or checked by verificationCode. The printed wording lives in `content` (validated
 * by documentContentSchema in src/modules/documents/content.ts) so staff can edit every line before approving.
 * The PDF is rendered on demand from `content`, so an edit never leaves a stale file behind. Documents are never
 * deleted: reject or revoke them.
 */
import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { candidateProfiles } from "./candidates";
import { users } from "./core";
import { enrolments, internshipProgrammes } from "./training";

export const INTERN_STATUSES = ["applied", "active", "completed", "dropped", "rejected"] as const;
export type InternStatus = (typeof INTERN_STATUSES)[number];

export const internshipParticipants = pgTable(
  "internship_participants",
  {
    id: pk(),
    programmeId: uuid()
      .notNull()
      .references(() => internshipProgrammes.id),
    /** People Portal profile, when the intern has one (applied online or was matched by email / phone). */
    candidateId: uuid().references(() => candidateProfiles.id),
    fullName: text().notNull(),
    /** Lower-cased. */
    email: text(),
    /** E.164 when possible. */
    phone: text(),
    /** College or institute. */
    institutionName: text(),
    /** Role or track, e.g. "Welding inspection intern". */
    track: text(),
    status: text({ enum: INTERN_STATUSES }).notNull().default("active"),
    startsOn: date(),
    endsOn: date(),
    /** Staff words about the intern's work (used in the letter of recommendation). */
    performanceNote: text(),
    completedAt: tstz(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("internship_participants_programme_idx").on(t.programmeId, t.status),
    index("internship_participants_candidate_idx").on(t.candidateId),
    index("internship_participants_email_idx").on(t.email),
    index("internship_participants_created_by_idx").on(t.createdByUserId),
    uniqueIndex("internship_participants_programme_candidate_uq").on(t.programmeId, t.candidateId).where(sql`candidate_id is not null`),
    check("internship_participants_dates_chk", sql`${t.endsOn} is null or ${t.startsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
    check("internship_participants_completed_chk", sql`${t.status} <> 'completed' or ${t.completedAt} is not null`),
  ],
);

export const ISSUED_DOCUMENT_KINDS = ["course_certificate", "internship_offer_letter", "internship_certificate", "recommendation_letter"] as const;
export type IssuedDocumentKind = (typeof ISSUED_DOCUMENT_KINDS)[number];

/** pending = waiting for staff approval; approved = can be downloaded and verified. */
export const ISSUED_DOCUMENT_STATUSES = ["pending", "approved", "rejected", "revoked"] as const;
export type IssuedDocumentStatus = (typeof ISSUED_DOCUMENT_STATUSES)[number];

/** auto = created when a course or internship reached the right stage; requested = asked for by the person; staff = made by staff. */
export const ISSUED_DOCUMENT_ORIGINS = ["auto", "requested", "staff"] as const;
export type IssuedDocumentOrigin = (typeof ISSUED_DOCUMENT_ORIGINS)[number];

export const issuedDocuments = pgTable(
  "issued_documents",
  {
    id: pk(),
    /** VSG-DOC-000123 (nextCode("DOC")), printed as the reference number. */
    code: text().notNull(),
    kind: text({ enum: ISSUED_DOCUMENT_KINDS }).notNull(),
    status: text({ enum: ISSUED_DOCUMENT_STATUSES }).notNull().default("pending"),
    origin: text({ enum: ISSUED_DOCUMENT_ORIGINS }).notNull(),
    candidateId: uuid().references(() => candidateProfiles.id),
    enrolmentId: uuid().references(() => enrolments.id),
    internshipParticipantId: uuid().references(() => internshipParticipants.id),
    /** Copied from content for lists and search. */
    holderName: text().notNull(),
    /** Where to send the document (interns without an account). */
    holderEmail: text(),
    holderPhone: text(),
    /** DocumentContent (every printed line, editable by staff until approval). */
    content: jsonb().notNull().default(emptyJsonObject),
    /** What the person wrote when asking for the document. */
    requestNote: text(),
    /** Random, unguessable public lookup / download token (Crockford, 12 characters). */
    verificationCode: text().notNull(),
    approvedAt: tstz(),
    approvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Shown to the person. */
    rejectedReason: text(),
    rejectedAt: tstz(),
    revokedAt: tstz(),
    revokedReason: text(),
    decidedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    lastEditedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("issued_documents_code_uq").on(t.code),
    uniqueIndex("issued_documents_verification_code_uq").on(t.verificationCode),
    index("issued_documents_status_idx").on(t.status, t.createdAt),
    index("issued_documents_candidate_idx").on(t.candidateId),
    index("issued_documents_enrolment_idx").on(t.enrolmentId),
    index("issued_documents_participant_idx").on(t.internshipParticipantId),
    index("issued_documents_approved_by_idx").on(t.approvedByUserId),
    index("issued_documents_decided_by_idx").on(t.decidedByUserId),
    index("issued_documents_edited_by_idx").on(t.lastEditedByUserId),
    // Automatic creation is idempotent: one live (pending or approved) document of a kind per enrolment / intern.
    uniqueIndex("issued_documents_live_enrolment_uq").on(t.enrolmentId, t.kind).where(sql`status in ('pending', 'approved') and enrolment_id is not null`),
    uniqueIndex("issued_documents_live_participant_uq")
      .on(t.internshipParticipantId, t.kind)
      .where(sql`status in ('pending', 'approved') and internship_participant_id is not null`),
    check("issued_documents_verification_code_chk", sql`char_length(${t.verificationCode}) >= 8`),
    check("issued_documents_approved_chk", sql`${t.status} <> 'approved' or ${t.approvedAt} is not null`),
    check("issued_documents_revoked_chk", sql`${t.status} <> 'revoked' or ${t.revokedAt} is not null`),
  ],
);
