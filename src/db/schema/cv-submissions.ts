/**
 * CVs sent through the public "Send your CV" form (/send-cv). Layer 17 — after content (it may point at the
 * requirement poster the candidate applied from).
 *
 * The owner's main funnel: a tradesperson sends name, phone, trade and a CV without creating an account; staff
 * call or WhatsApp them back. Personal data supplied voluntarily for that purpose (consent to be contacted is
 * required); the CV file (purpose `cv_submission`) is private, staff-only and read access is logged.
 * `ipHash` only (never the raw IP).
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { countryCode, createdAtOnly, pk, timestamps, tstz } from "./_shared";
import { cmsEntries } from "./content";
import { files, users } from "./core";
import { countries, jobCategories } from "./taxonomy";

/**
 * The placement journey staff move a candidate through (in order), plus two side states. Migration 0006 rewrote the
 * values used before it: new → received, shortlisted → trade_test (LEGACY_CV_SUBMISSION_STATUSES keeps old links working).
 */
export const CV_SUBMISSION_STATUSES = ["received", "contacted", "trade_test", "selected", "medical", "visa", "ticket", "departed", "not_suitable", "on_hold"] as const;
export type CvSubmissionStatus = (typeof CV_SUBMISSION_STATUSES)[number];
export const LEGACY_CV_SUBMISSION_STATUSES = { new: "received", shortlisted: "trade_test" } as const satisfies Record<string, CvSubmissionStatus>;

export const cvSubmissions = pgTable(
  "cv_submissions",
  {
    id: pk(),
    /** VSG-CV-000123 — nextCode("CV"). */
    code: text().notNull(),
    name: text().notNull(),
    /** E.164 mobile / WhatsApp number. */
    phone: text().notNull(),
    /** Trade picked from the job categories (null when the candidate typed their own). */
    jobCategoryId: uuid().references(() => jobCategories.id, { onDelete: "set null" }),
    /** Trade typed by the candidate ("Other"). */
    tradeOther: text(),
    /** Trade as shown to staff (category name at submission time, or the typed trade). */
    tradeLabel: text().notNull(),
    experienceYears: smallint(),
    preferredCountryCode: countryCode().references(() => countries.code),
    /** null = not answered. */
    hasPassport: boolean(),
    /**
     * Passport number exactly as the candidate typed it (normalised), encryptField() like
     * candidate_profiles.passportNumberEncrypted. Reveal only with candidates.view_documents (logged).
     */
    passportNumberEncrypted: text(),
    passportNumberLast4: text(),
    /** hmacToken(number, "passport") — blind index for matching with candidate profiles; never displayed. */
    passportNumberHash: text(),
    /** Passport expiry date as the candidate gave it (optional; drives the documents.expiry_alerts task). */
    passportExpiry: date({ mode: "string" }),
    /** The candidate's own remarks from the form ("Notes for us"). */
    candidateNotes: text(),
    /**
     * The submitted CV (purpose cv_submission). Further documents (passport scans, certificates) attach to the
     * submission through the files module (files.metadata / grants with contextType "cv_submission", contextId = id).
     */
    cvFileId: uuid()
      .notNull()
      .references(() => files.id),
    /** Requirement poster (cms_entries, collection requirement_posts) the candidate applied from. */
    requirementEntryId: uuid().references(() => cmsEntries.id, { onDelete: "set null" }),
    /** Poster title at submission time (kept if the poster is later deleted). */
    requirementTitle: text(),
    status: text({ enum: CV_SUBMISSION_STATUSES }).notNull().default("received"),
    /**
     * Short note shown to the candidate on the public /status page (e.g. "Trade test on 5 December at our office").
     * Separate from staffRemarks; changes are audited without the text.
     */
    candidateNote: text(),
    candidateNoteUpdatedAt: tstz(),
    /** Staff-only remarks (editable on the admin view, audited; never shown to the candidate). */
    staffRemarks: text(),
    remarksUpdatedAt: tstz(),
    remarksUpdatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    consentToContact: boolean().notNull(),
    /** Version of the privacy notice shown on the form. */
    privacyNoticeVersion: text(),
    sourcePage: text(),
    ipHash: text(),
    /** First time staff marked it contacted (or later). */
    contactedAt: tstz(),
    statusChangedAt: tstz(),
    statusChangedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cv_submissions_code_uq").on(t.code),
    index("cv_submissions_status_idx").on(t.status, t.createdAt),
    index("cv_submissions_created_idx").on(t.createdAt),
    index("cv_submissions_job_category_idx").on(t.jobCategoryId),
    index("cv_submissions_country_idx").on(t.preferredCountryCode),
    index("cv_submissions_file_idx").on(t.cvFileId),
    index("cv_submissions_requirement_idx").on(t.requirementEntryId),
    index("cv_submissions_phone_idx").on(t.phone),
    index("cv_submissions_status_changed_by_idx").on(t.statusChangedByUserId),
    index("cv_submissions_remarks_by_idx").on(t.remarksUpdatedByUserId),
    index("cv_submissions_passport_hash_idx").on(t.passportNumberHash),
    check("cv_submissions_passport_last4_chk", sql`${t.passportNumberLast4} is null or char_length(${t.passportNumberLast4}) <= 4`),
    check("cv_submissions_notes_chk", sql`${t.candidateNotes} is null or char_length(${t.candidateNotes}) <= 1000`),
    check("cv_submissions_consent_chk", sql`${t.consentToContact} = true`),
    check("cv_submissions_name_chk", sql`btrim(${t.name}) <> ''`),
    check("cv_submissions_trade_chk", sql`btrim(${t.tradeLabel}) <> ''`),
    check("cv_submissions_candidate_note_chk", sql`${t.candidateNote} is null or char_length(${t.candidateNote}) <= 500`),
    index("cv_submissions_passport_expiry_idx").on(t.passportExpiry).where(sql`${t.passportExpiry} is not null`),
    check("cv_submissions_experience_chk", sql`${t.experienceYears} is null or ${t.experienceYears} between 0 and 60`),
  ],
);

/**
 * Stage history of a CV submission (one row per change, newest last): the public /status tracker shows the date each
 * stage was reached. `candidateNote` is the note shown to the candidate when the change was made (never staff remarks).
 */
export const cvSubmissionStageEvents = pgTable(
  "cv_submission_stage_events",
  {
    id: pk(),
    submissionId: uuid()
      .notNull()
      .references(() => cvSubmissions.id, { onDelete: "cascade" }),
    fromStatus: text({ enum: CV_SUBMISSION_STATUSES }),
    toStatus: text({ enum: CV_SUBMISSION_STATUSES }).notNull(),
    candidateNote: text(),
    /** null = system (submission received, migration backfill). */
    changedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...createdAtOnly,
  },
  (t) => [index("cv_submission_stage_events_submission_idx").on(t.submissionId, t.createdAt), index("cv_submission_stage_events_changed_by_idx").on(t.changedByUserId)],
);

/**
 * Expiry alerts already sent by the daily documents.expiry_alerts task: one row per item, expiry date and threshold
 * (6, 3 or 1 month), so each item alerts once per threshold (a renewed document has a new date and alerts again).
 */
export const DOCUMENT_EXPIRY_ITEM_TYPES = ["cv_submission_passport", "candidate_passport", "candidate_document", "candidate_credential"] as const;
export type DocumentExpiryItemType = (typeof DOCUMENT_EXPIRY_ITEM_TYPES)[number];

export const documentExpiryAlerts = pgTable(
  "document_expiry_alerts",
  {
    id: pk(),
    itemType: text({ enum: DOCUMENT_EXPIRY_ITEM_TYPES }).notNull(),
    itemId: uuid().notNull(),
    expiresOn: date({ mode: "string" }).notNull(),
    /** Months before expiry: 6, 3 or 1. */
    thresholdMonths: smallint().notNull(),
    ...createdAtOnly,
  },
  (t) => [
    uniqueIndex("document_expiry_alerts_item_uq").on(t.itemType, t.itemId, t.expiresOn, t.thresholdMonths),
    check("document_expiry_alerts_threshold_chk", sql`${t.thresholdMonths} in (1, 3, 6)`),
  ],
);

/**
 * Extra documents attached to a CV submission, one file per upload (certificates, licences, passport pages, photo).
 * Uploaded by the candidate through a signed, short-lived link (uploadedByUserId null) or by staff on their behalf.
 * Files use purpose `cv_submission_document` (private, sensitive, same staff read permissions as the CV).
 */
export const CV_SUBMISSION_DOCUMENT_KINDS = [
  "certificate",
  "licence",
  "passport_cover",
  "passport_first_page",
  "passport_last_page",
  "photo",
  "other",
] as const;
export type CvSubmissionDocumentKind = (typeof CV_SUBMISSION_DOCUMENT_KINDS)[number];

export const cvSubmissionDocuments = pgTable(
  "cv_submission_documents",
  {
    id: pk(),
    submissionId: uuid()
      .notNull()
      .references(() => cvSubmissions.id, { onDelete: "cascade" }),
    kind: text({ enum: CV_SUBMISSION_DOCUMENT_KINDS }).notNull(),
    fileId: uuid()
      .notNull()
      .references(() => files.id),
    /** Order within the kind (certificates and licences keep the order staff set; CV pack follows it). */
    sortOrder: integer().notNull().default(0),
    /** null = the candidate, through the upload link. */
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...createdAtOnly,
  },
  (t) => [
    index("cv_submission_documents_submission_idx").on(t.submissionId, t.kind, t.sortOrder),
    index("cv_submission_documents_file_idx").on(t.fileId),
    index("cv_submission_documents_uploaded_by_idx").on(t.uploadedByUserId),
  ],
);
