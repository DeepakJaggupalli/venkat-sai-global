/**
 * "Prepare my resume" requests (/resume-service). Layer 18 — after cv_submissions (a request may be linked to the
 * candidate's CV submission by phone number).
 *
 * A paid resume-writing service (never a placement fee). The candidate's details (validated by
 * `resumeDetailsSchema` in src/modules/resume-service/schemas.ts) are sensitive personal data: staff access needs
 * candidates.manage and every read of the details or documents is logged. The photo and the generated DOCX/PDF are
 * private files with purpose `resume_service`. The passport number is kept out of the JSON and stored encrypted.
 * The candidate downloads the documents through a signed link (`downloadTokenVersion` bumps revoke every link
 * issued before).
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { currencyCode, moneyMinor, pk, timestamps, tstz } from "./_shared";
import { files, users } from "./core";
import { cvSubmissions } from "./cv-submissions";
import { currencies } from "./taxonomy";

export const RESUME_REQUEST_STATUS_VALUES = ["submitted", "awaiting_payment", "paid", "waived", "generated", "delivered", "cancelled"] as const;
export const RESUME_PAYMENT_METHODS = ["offline", "razorpay", "waived"] as const;

export const resumeRequests = pgTable(
  "resume_requests",
  {
    id: pk(),
    /** VSG-RES-000123 — nextCode("RES"). */
    code: text().notNull(),
    status: text({ enum: RESUME_REQUEST_STATUS_VALUES }).notNull().default("submitted"),
    /** Copied from the details for the staff list and search. */
    name: text().notNull(),
    /** E.164. */
    phone: text().notNull(),
    email: text(),
    /** ResumeDetails JSON (validated with zod on every write) WITHOUT the passport number (stored encrypted below). */
    details: jsonb().notNull(),
    /** encryptField(passport number) like candidate_profiles; merged back into the details only to render or edit. */
    passportNumberEncrypted: text(),
    passportNumberLast4: text(),
    /** The candidate's own remarks ("Notes for us"). */
    candidateNotes: text(),
    photoFileId: uuid().references(() => files.id),
    /** Price when the request was made (null amount = price on request). */
    priceAmountMinor: moneyMinor(),
    priceCurrency: currencyCode().references(() => currencies.code),
    paymentMethod: text({ enum: RESUME_PAYMENT_METHODS }),
    /** UPI / bank reference typed by staff, or the gateway payment id. */
    paymentReference: text(),
    /** Gateway order id (Razorpay, once online payments are switched on). */
    gatewayOrderId: text(),
    paidAt: tstz(),
    paymentRecordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    generatedDocxFileId: uuid().references(() => files.id),
    generatedPdfFileId: uuid().references(() => files.id),
    generatedAt: tstz(),
    deliveredAt: tstz(),
    cancelledAt: tstz(),
    statusChangedAt: tstz(),
    statusChangedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Staff-only notes (never shown to the candidate). */
    staffNotes: text(),
    notesUpdatedAt: tstz(),
    notesUpdatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Signed download links carry this version; incrementing it revokes older links. */
    downloadTokenVersion: integer().notNull().default(1),
    /** The candidate's CV submission (same phone number), when there is one. */
    cvSubmissionId: uuid().references(() => cvSubmissions.id, { onDelete: "set null" }),
    consentToContact: boolean().notNull(),
    privacyNoticeVersion: text(),
    ipHash: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("resume_requests_code_uq").on(t.code),
    index("resume_requests_status_idx").on(t.status, t.createdAt),
    index("resume_requests_created_idx").on(t.createdAt),
    index("resume_requests_phone_idx").on(t.phone),
    index("resume_requests_cv_submission_idx").on(t.cvSubmissionId),
    index("resume_requests_photo_idx").on(t.photoFileId),
    index("resume_requests_docx_idx").on(t.generatedDocxFileId),
    index("resume_requests_pdf_idx").on(t.generatedPdfFileId),
    index("resume_requests_paid_by_idx").on(t.paymentRecordedByUserId),
    index("resume_requests_status_by_idx").on(t.statusChangedByUserId),
    index("resume_requests_notes_by_idx").on(t.notesUpdatedByUserId),
    check("resume_requests_consent_chk", sql`${t.consentToContact} = true`),
    check("resume_requests_name_chk", sql`btrim(${t.name}) <> ''`),
    check("resume_requests_price_chk", sql`${t.priceAmountMinor} is null or ${t.priceAmountMinor} >= 0`),
    check("resume_requests_notes_chk", sql`${t.candidateNotes} is null or char_length(${t.candidateNotes}) <= 1000`),
  ],
);
