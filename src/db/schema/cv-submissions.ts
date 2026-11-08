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
import { boolean, check, index, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { countryCode, pk, timestamps, tstz } from "./_shared";
import { cmsEntries } from "./content";
import { files, users } from "./core";
import { countries, jobCategories } from "./taxonomy";

export const CV_SUBMISSION_STATUSES = ["new", "contacted", "shortlisted", "not_suitable"] as const;
export type CvSubmissionStatus = (typeof CV_SUBMISSION_STATUSES)[number];

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
    status: text({ enum: CV_SUBMISSION_STATUSES }).notNull().default("new"),
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
    check("cv_submissions_experience_chk", sql`${t.experienceYears} is null or ${t.experienceYears} between 0 and 60`),
  ],
);
