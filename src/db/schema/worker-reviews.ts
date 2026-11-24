/**
 * Reviews from placed workers (/review/<token>). Layer 22 — after cv_submissions (17): each review belongs to one CV
 * submission.
 *
 * Staff send a departed worker a signed 30-day link on WhatsApp (no account needed). The worker gives 1 to 5 stars,
 * a short text in their own words, the name to show (e.g. "Ravi K."), trade and country, and may allow us to show
 * the review on the website (`consentToPublish`). Every review starts `pending`; staff with candidates.manage
 * approve it (only with consent), reject it, hide it or show it again at /admin/reviews. Only approved reviews with
 * consent are public. Reviews are never seeded or written by staff. `ipHash` only (never the raw IP).
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { countryCode, createdAtOnly, pk, timestamps, tstz } from "./_shared";
import { users } from "./core";
import { cvSubmissions } from "./cv-submissions";
import { countries } from "./taxonomy";

/** pending → approved (on the website) or rejected (not shown); approved ⇄ hidden. */
export const WORKER_REVIEW_STATUSES = ["pending", "approved", "rejected", "hidden"] as const;
export type WorkerReviewStatus = (typeof WORKER_REVIEW_STATUSES)[number];

export const workerReviews = pgTable(
  "worker_reviews",
  {
    id: pk(),
    /**
     * The placed worker's CV submission: one review per submission (unique; PostgreSQL treats NULLs as distinct, so
     * the rule applies only while the link exists). Null only after the CV submission itself was deleted.
     */
    cvSubmissionId: uuid().references(() => cvSubmissions.id, { onDelete: "set null" }),
    /** Name as the worker wants it shown, e.g. "Ravi K.". */
    displayName: text().notNull(),
    /** Trade as the worker gave it (prefilled from the CV submission). */
    trade: text().notNull(),
    /** Country where the worker works (flag and name on the website). */
    countryCode: countryCode().references(() => countries.code),
    /** 1 to 5 stars. */
    rating: smallint().notNull(),
    /** The worker's own words, plain text (never edited by staff). */
    body: text().notNull(),
    /** "You may show my review on your website". Must be true to publish. */
    consentToPublish: boolean().notNull().default(false),
    status: text({ enum: WORKER_REVIEW_STATUSES }).notNull().default("pending"),
    /** Last staff decision (approve, reject, hide, show again). */
    reviewedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: tstz(),
    /** First time the review went on the website (kept when it is hidden and shown again). */
    publishedAt: tstz(),
    ipHash: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("worker_reviews_cv_submission_uq").on(t.cvSubmissionId),
    index("worker_reviews_status_idx").on(t.status, t.createdAt),
    index("worker_reviews_public_idx").on(t.publishedAt).where(sql`${t.status} = 'approved' and ${t.consentToPublish} = true`),
    index("worker_reviews_country_idx").on(t.countryCode),
    index("worker_reviews_reviewed_by_idx").on(t.reviewedByUserId),
    check("worker_reviews_rating_chk", sql`${t.rating} between 1 and 5`),
    check("worker_reviews_body_chk", sql`btrim(${t.body}) <> '' and char_length(${t.body}) <= 800`),
    check("worker_reviews_display_name_chk", sql`btrim(${t.displayName}) <> '' and char_length(${t.displayName}) <= 60`),
    check("worker_reviews_trade_chk", sql`btrim(${t.trade}) <> '' and char_length(${t.trade}) <= 120`),
    check("worker_reviews_publish_consent_chk", sql`${t.status} not in ('approved', 'hidden') or ${t.consentToPublish} = true`),
  ],
);

/** How staff sent the review link: the WhatsApp button, or "Copy link" (pasted anywhere). */
export const WORKER_REVIEW_REQUEST_CHANNELS = ["whatsapp", "link"] as const;
export type WorkerReviewRequestChannel = (typeof WORKER_REVIEW_REQUEST_CHANNELS)[number];

/**
 * Each time staff sent a worker the review link (append-only), so the "Ask for a review" list can say "Asked 3 days
 * ago by Lakshmi" and nobody asks the same worker twice by mistake. The link itself is never stored.
 */
export const workerReviewRequests = pgTable(
  "worker_review_requests",
  {
    id: pk(),
    cvSubmissionId: uuid()
      .notNull()
      .references(() => cvSubmissions.id, { onDelete: "cascade" }),
    channel: text({ enum: WORKER_REVIEW_REQUEST_CHANNELS }).notNull(),
    requestedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...createdAtOnly,
  },
  (t) => [index("worker_review_requests_submission_idx").on(t.cvSubmissionId, t.createdAt), index("worker_review_requests_requested_by_idx").on(t.requestedByUserId)],
);
