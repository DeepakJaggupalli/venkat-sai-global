import "server-only";

import { and, count, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";

import { whatsappHref } from "@/config/contact";
import { db } from "@/db";
import { countries, cvSubmissions, users, workerReviewRequests, workerReviews } from "@/db/schema";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import type { WorkerReviewRequestChannel, WorkerReviewStatus } from "@/db/schema/worker-reviews";
import { ActionError } from "@/lib/actions";
import { absoluteUrl } from "@/lib/env";
import { maskPhone } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { audit, logDataAccess, logSecurityEvent } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import {
  decisionPublishes,
  defaultDisplayName,
  firstNameOf,
  mentionsContactDetails,
  nextWorkerReviewStatus,
  reviewRequestMessage,
  type WorkerReviewAskInput,
  type WorkerReviewDecision,
  type WorkerReviewModerateInput,
  type WorkerReviewSubmitInput,
  type WorkerReviewSubmitResult,
} from "./schemas";
import { issueWorkerReviewToken, readWorkerReviewToken, workerReviewPath } from "./tokens";

/**
 * Reviews from placed workers. Staff ask departed workers (CV submissions with status "departed") for a review by
 * sending a signed 30-day link on WhatsApp; the worker writes it on /review/<token> without an account (one review
 * per CV submission); staff approve it before it shows on the website (only with the worker's consent), reject it,
 * hide it or show it again. The review text is always the worker's own: staff never write or edit reviews.
 *
 * Authorisation: everything on /admin/reviews needs candidates.manage (asking means sending a link to a candidate's
 * own number; approving means vouching that the review comes from a real placed worker). Phone numbers and
 * WhatsApp links additionally need candidates.view_contact (the view is logged, like the CV list); the CV name and
 * reference next to a review need candidates.view.
 */

export const WORKER_REVIEWS_ADMIN_PATH = "/admin/reviews";

export const WORKER_REVIEW_LINK_EXPIRED = "This review link has expired or is not complete. Message us on WhatsApp and we will send you a new link.";
export const WORKER_REVIEW_ALREADY_SENT = "We already have your review. Thank you. To change it, message us on WhatsApp.";
const TOO_MANY = "Too many tries in a short time. Please wait a little and try again, or message us on WhatsApp.";

const DEPARTED: CvSubmissionStatus = "departed";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertCanManage(ctx: StaffContext): void {
  if (!staffCan(ctx, "candidates.manage")) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

async function enforceLimits(limits: { key: string; limit: number; windowSeconds: number }[], message: string): Promise<void> {
  for (const l of limits) {
    const result = await rateLimit(l.key, l.limit, l.windowSeconds);
    if (!result.allowed) throw new ActionError(message, { code: "rate_limited" });
  }
}

/** A unique-constraint violation (drizzle wraps the driver error in `cause`). */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (const c of [error, (error as { cause?: unknown } | null)?.cause]) {
    if (c && typeof c === "object" && (c as { code?: unknown }).code === "23505") {
      const name = (c as { constraint?: unknown }).constraint;
      return name === undefined || name === constraint;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public: the review link and form (/review/<token>)
// ---------------------------------------------------------------------------

export type WorkerReviewLink =
  | {
      state: "open";
      firstName: string;
      /** Prefilled form values (the worker can change them). */
      displayName: string;
      trade: string;
      countryCode: string | null;
      expiresAt: Date;
    }
  | { state: "used"; firstName: string }
  | { state: "expired" };

/**
 * What the review page shows for a token: the form (prefilled with "first name + last initial", the trade and the
 * country from the CV submission), "already sent" (one review per submission) or "expired" (forged, expired, or the
 * CV submission no longer exists). Nothing else stored is revealed.
 */
export async function resolveWorkerReviewLink(token: string | null | undefined): Promise<WorkerReviewLink> {
  const claims = readWorkerReviewToken(token);
  if (!claims) return { state: "expired" };
  const [row] = await db
    .select({ name: cvSubmissions.name, trade: cvSubmissions.tradeLabel, countryCode: cvSubmissions.preferredCountryCode, reviewId: workerReviews.id })
    .from(cvSubmissions)
    .leftJoin(workerReviews, eq(workerReviews.cvSubmissionId, cvSubmissions.id))
    .where(eq(cvSubmissions.id, claims.submissionId))
    .limit(1);
  if (!row) return { state: "expired" };
  const firstName = firstNameOf(row.name);
  if (row.reviewId) return { state: "used", firstName };
  return { state: "open", firstName, displayName: defaultDisplayName(row.name), trade: row.trade, countryCode: row.countryCode ?? null, expiresAt: claims.expiresAt };
}

/**
 * Save a worker's review (status "pending" until staff approve it). Honeypot hits are dropped silently (security
 * event only). Rate limited per network and per link. Exactly one review per CV submission: the submission row is
 * locked while checking, and the unique index is the final guard. Audited without the text.
 */
export async function submitWorkerReview(input: WorkerReviewSubmitInput, meta: { ipHash: string | null }): Promise<WorkerReviewSubmitResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "worker_review" } });
    return { firstName: "", consentToPublish: input.consentToPublish };
  }
  await enforceLimits(
    meta.ipHash
      ? [
          { key: `review:ip:${meta.ipHash}`, limit: 10, windowSeconds: 10 * 60 },
          { key: `review:ip-day:${meta.ipHash}`, limit: 40, windowSeconds: 24 * 60 * 60 },
        ]
      : [],
    TOO_MANY,
  );
  const claims = readWorkerReviewToken(input.token);
  if (!claims) throw new ActionError(WORKER_REVIEW_LINK_EXPIRED, { code: "link_expired" });
  await enforceLimits([{ key: `review:sub:${claims.submissionId}`, limit: 5, windowSeconds: 60 * 60 }], TOO_MANY);

  if (input.countryCode) {
    const [country] = await db
      .select({ code: countries.code })
      .from(countries)
      .where(and(eq(countries.code, input.countryCode), eq(countries.isActive, true)))
      .limit(1);
    if (!country) throw new ActionError("Please check the highlighted fields.", { fieldErrors: { countryCode: ["Choose a country from the list"] } });
  }

  try {
    return await db.transaction(async (tx) => {
      // Lock the CV submission so two taps on "Send" cannot both pass the "no review yet" check.
      const [submission] = await tx
        .select({ id: cvSubmissions.id, name: cvSubmissions.name })
        .from(cvSubmissions)
        .where(eq(cvSubmissions.id, claims.submissionId))
        .for("update")
        .limit(1);
      if (!submission) throw new ActionError(WORKER_REVIEW_LINK_EXPIRED, { code: "link_expired" });
      const [existing] = await tx.select({ id: workerReviews.id }).from(workerReviews).where(eq(workerReviews.cvSubmissionId, submission.id)).limit(1);
      if (existing) throw new ActionError(WORKER_REVIEW_ALREADY_SENT, { code: "already_reviewed" });

      const [row] = await tx
        .insert(workerReviews)
        .values({
          cvSubmissionId: submission.id,
          displayName: input.displayName,
          trade: input.trade,
          countryCode: input.countryCode ?? null,
          rating: input.rating,
          body: input.body,
          consentToPublish: input.consentToPublish,
          ipHash: meta.ipHash,
        })
        .returning({ id: workerReviews.id });
      await audit({
        action: "worker_review.received",
        entityType: "worker_review",
        entityId: row!.id,
        actorUserId: null,
        actorType: "anonymous",
        metadata: { cvSubmissionId: submission.id, rating: input.rating, consentToPublish: input.consentToPublish },
        tx,
      });
      return { firstName: firstNameOf(submission.name), consentToPublish: input.consentToPublish };
    });
  } catch (error) {
    if (isUniqueViolation(error, "worker_reviews_cv_submission_uq")) throw new ActionError(WORKER_REVIEW_ALREADY_SENT, { code: "already_reviewed" });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff: counts and the "Ask for a review" list
// ---------------------------------------------------------------------------

export type WorkerReviewCounts = { ask: number; pending: number; published: number; rejected: number };

/** Tab counts: departed workers without a review, and reviews per state (published = on the website + hidden). */
export async function workerReviewCounts(ctx: StaffContext): Promise<WorkerReviewCounts> {
  assertCanManage(ctx);
  const [askRows, statusRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(cvSubmissions)
      .leftJoin(workerReviews, eq(workerReviews.cvSubmissionId, cvSubmissions.id))
      .where(and(eq(cvSubmissions.status, DEPARTED), isNull(workerReviews.id))),
    db.select({ status: workerReviews.status, value: count() }).from(workerReviews).groupBy(workerReviews.status),
  ]);
  const by: Partial<Record<WorkerReviewStatus, number>> = {};
  for (const r of statusRows) by[r.status] = r.value;
  return { ask: askRows[0]?.value ?? 0, pending: by.pending ?? 0, published: (by.approved ?? 0) + (by.hidden ?? 0), rejected: by.rejected ?? 0 };
}

export type ReviewAskItem = {
  submissionId: string;
  code: string;
  name: string;
  firstName: string;
  tradeLabel: string;
  countryCode: string | null;
  countryName: string | null;
  /** When the stage was set to Departed (falls back to when the CV arrived). */
  departedAt: Date;
  /** E.164 when the viewer may see contact details, else null (see `phoneMasked`). */
  phone: string | null;
  phoneMasked: string;
  askCount: number;
  lastAskedAt: Date | null;
  lastAskedByName: string | null;
  lastAskedChannel: WorkerReviewRequestChannel | null;
  /** A fresh signed review link (absolute URL, valid 30 days). */
  reviewUrl: string;
  linkExpiresAt: Date;
  /** wa.me to the worker's own number with the message and the link (null without candidates.view_contact). */
  whatsappUrl: string | null;
};

const ASK_COLUMNS = {
  id: cvSubmissions.id,
  code: cvSubmissions.code,
  name: cvSubmissions.name,
  phone: cvSubmissions.phone,
  tradeLabel: cvSubmissions.tradeLabel,
  status: cvSubmissions.status,
  countryCode: cvSubmissions.preferredCountryCode,
  countryName: countries.name,
  statusChangedAt: cvSubmissions.statusChangedAt,
  createdAt: cvSubmissions.createdAt,
};

type AskRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  tradeLabel: string;
  countryCode: string | null;
  countryName: string | null;
  statusChangedAt: Date | null;
  createdAt: Date;
};

/** Newest departures first. */
const ASK_ORDER = [desc(sql`coalesce(${cvSubmissions.statusChangedAt}, ${cvSubmissions.createdAt})`), desc(cvSubmissions.createdAt)];

async function buildAskItems(ctx: StaffContext, rows: AskRow[]): Promise<ReviewAskItem[]> {
  if (!rows.length) return [];
  const canContact = staffCan(ctx, "candidates.view_contact");
  const ids = rows.map((r) => r.id);
  const [latest, totals] = await Promise.all([
    db
      .selectDistinctOn([workerReviewRequests.cvSubmissionId], {
        submissionId: workerReviewRequests.cvSubmissionId,
        at: workerReviewRequests.createdAt,
        channel: workerReviewRequests.channel,
        byName: users.displayName,
      })
      .from(workerReviewRequests)
      .leftJoin(users, eq(users.id, workerReviewRequests.requestedByUserId))
      .where(inArray(workerReviewRequests.cvSubmissionId, ids))
      .orderBy(workerReviewRequests.cvSubmissionId, desc(workerReviewRequests.createdAt)),
    db
      .select({ submissionId: workerReviewRequests.cvSubmissionId, value: count() })
      .from(workerReviewRequests)
      .where(inArray(workerReviewRequests.cvSubmissionId, ids))
      .groupBy(workerReviewRequests.cvSubmissionId),
  ]);
  const lastBy = new Map(latest.map((l) => [l.submissionId, l]));
  const countBy = new Map(totals.map((t) => [t.submissionId, t.value]));
  return rows.map((r): ReviewAskItem => {
    const { token, expiresAt } = issueWorkerReviewToken(r.id);
    const reviewUrl = absoluteUrl(workerReviewPath(token));
    const firstName = firstNameOf(r.name);
    const last = lastBy.get(r.id);
    return {
      submissionId: r.id,
      code: r.code,
      name: r.name,
      firstName,
      tradeLabel: r.tradeLabel,
      countryCode: r.countryCode ?? null,
      countryName: r.countryName ?? null,
      departedAt: r.statusChangedAt ?? r.createdAt,
      phone: canContact ? r.phone : null,
      phoneMasked: maskPhone(r.phone),
      askCount: countBy.get(r.id) ?? 0,
      lastAskedAt: last?.at ?? null,
      lastAskedByName: last?.byName ?? null,
      lastAskedChannel: last?.channel ?? null,
      reviewUrl,
      linkExpiresAt: expiresAt,
      whatsappUrl: canContact ? whatsappHref(reviewRequestMessage(firstName, reviewUrl), r.phone) : null,
    };
  });
}

async function logContactView(ctx: StaffContext, items: ReviewAskItem[], reason: string): Promise<void> {
  if (!items.some((i) => i.phone)) return;
  await logDataAccess({
    actorUserId: ctx.user.id,
    subjectType: "cv_submission",
    subjectId: items.length === 1 ? items[0]!.submissionId : "list",
    dataCategory: "contact",
    accessType: "view",
    reason,
    metadata: { codes: items.map((i) => i.code) },
  });
}

/**
 * Departed workers who have not sent a review yet, newest departures first (candidates.manage), each with a fresh
 * review link and, with candidates.view_contact, a WhatsApp link to their own number (the view is logged).
 */
export async function listReviewAskQueue(ctx: StaffContext, page: PageQuery, opts: { excludeId?: string | null } = {}): Promise<Paginated<ReviewAskItem>> {
  assertCanManage(ctx);
  const conditions: SQL[] = [eq(cvSubmissions.status, DEPARTED), isNull(workerReviews.id)];
  if (opts.excludeId && UUID.test(opts.excludeId)) conditions.push(ne(cvSubmissions.id, opts.excludeId));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db
      .select(ASK_COLUMNS)
      .from(cvSubmissions)
      .leftJoin(workerReviews, eq(workerReviews.cvSubmissionId, cvSubmissions.id))
      .leftJoin(countries, eq(countries.code, cvSubmissions.preferredCountryCode))
      .where(where)
      .orderBy(...ASK_ORDER)
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(cvSubmissions).leftJoin(workerReviews, eq(workerReviews.cvSubmissionId, cvSubmissions.id)).where(where),
  ]);
  const items = await buildAskItems(ctx, rows);
  await logContactView(ctx, items, "Worker reviews: departed workers to ask for a review on WhatsApp");
  return paginated(items, totals[0]?.value ?? 0, page);
}

export type ReviewAskLookup =
  | { state: "eligible"; item: ReviewAskItem }
  | { state: "not_departed"; submissionId: string; code: string; name: string; status: CvSubmissionStatus }
  | { state: "reviewed"; submissionId: string; code: string; name: string; reviewStatus: WorkerReviewStatus }
  | { state: "not_found" };

/** One CV submission for /admin/reviews?ask=<id> (linked from the CV page): can we ask this worker now? */
export async function getReviewAskItem(ctx: StaffContext, submissionId: string): Promise<ReviewAskLookup> {
  assertCanManage(ctx);
  if (!UUID.test(submissionId)) return { state: "not_found" };
  const [row] = await db
    .select({ ...ASK_COLUMNS, reviewStatus: workerReviews.status })
    .from(cvSubmissions)
    .leftJoin(workerReviews, eq(workerReviews.cvSubmissionId, cvSubmissions.id))
    .leftJoin(countries, eq(countries.code, cvSubmissions.preferredCountryCode))
    .where(eq(cvSubmissions.id, submissionId))
    .limit(1);
  if (!row) return { state: "not_found" };
  if (row.reviewStatus) return { state: "reviewed", submissionId: row.id, code: row.code, name: row.name, reviewStatus: row.reviewStatus };
  if (row.status !== DEPARTED) return { state: "not_departed", submissionId: row.id, code: row.code, name: row.name, status: row.status };
  const [item] = await buildAskItems(ctx, [row]);
  await logContactView(ctx, [item!], "Worker reviews: ask a departed worker for a review on WhatsApp");
  return { state: "eligible", item: item! };
}

/**
 * Record that staff sent the review link (WhatsApp button or "Copy link"), so the list shows who asked and when.
 * Only for departed workers without a review. Audited (never the link itself).
 */
export async function recordReviewRequest(ctx: StaffContext, input: WorkerReviewAskInput): Promise<{ askedAt: Date }> {
  assertCanManage(ctx);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: cvSubmissions.id, status: cvSubmissions.status, reviewId: workerReviews.id })
      .from(cvSubmissions)
      .leftJoin(workerReviews, eq(workerReviews.cvSubmissionId, cvSubmissions.id))
      .where(eq(cvSubmissions.id, input.submissionId))
      .limit(1);
    if (!row) throw new ActionError("This CV submission could not be found.");
    if (row.reviewId) throw new ActionError("This worker has already sent a review.", { code: "already_reviewed" });
    if (row.status !== DEPARTED) throw new ActionError("Set the stage to Departed on the CV page before asking for a review.", { code: "not_departed" });
    const [request] = await tx
      .insert(workerReviewRequests)
      .values({ cvSubmissionId: row.id, channel: input.channel, requestedByUserId: ctx.user.id })
      .returning({ createdAt: workerReviewRequests.createdAt });
    await audit({ action: "worker_review.requested", entityType: "cv_submission", entityId: row.id, actorUserId: ctx.user.id, metadata: { channel: input.channel }, tx });
    return { askedAt: request!.createdAt };
  });
}

// ---------------------------------------------------------------------------
// Staff: approving, rejecting, hiding
// ---------------------------------------------------------------------------

export type StaffReviewTab = "pending" | "published" | "rejected";

const TAB_STATUSES: Record<StaffReviewTab, WorkerReviewStatus[]> = {
  pending: ["pending"],
  published: ["approved", "hidden"],
  rejected: ["rejected"],
};

export type StaffWorkerReview = {
  id: string;
  status: WorkerReviewStatus;
  rating: number;
  body: string;
  displayName: string;
  trade: string;
  countryCode: string | null;
  countryName: string | null;
  consentToPublish: boolean;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  publishedAt: Date | null;
  /** The worker's CV submission (null without candidates.view, or when the submission was deleted). */
  cv: { id: string; code: string; name: string } | null;
  /** The text seems to contain a phone number, email or link: check before approving. */
  mentionsContactDetails: boolean;
};

/** Reviews in one tab, newest first (candidates.manage). */
export async function listWorkerReviewsForStaff(ctx: StaffContext, tab: StaffReviewTab, page: PageQuery): Promise<Paginated<StaffWorkerReview>> {
  assertCanManage(ctx);
  const canViewCv = staffCan(ctx, "candidates.view");
  const where = inArray(workerReviews.status, TAB_STATUSES[tab]);
  const order =
    tab === "published"
      ? [desc(sql`coalesce(${workerReviews.publishedAt}, ${workerReviews.createdAt})`), desc(workerReviews.createdAt)]
      : tab === "rejected"
        ? [desc(sql`coalesce(${workerReviews.reviewedAt}, ${workerReviews.createdAt})`), desc(workerReviews.createdAt)]
        : [desc(workerReviews.createdAt)];
  const [rows, totals] = await Promise.all([
    db
      .select({ r: workerReviews, countryName: countries.name, reviewedByName: users.displayName, cvCode: cvSubmissions.code, cvName: cvSubmissions.name })
      .from(workerReviews)
      .leftJoin(countries, eq(countries.code, workerReviews.countryCode))
      .leftJoin(users, eq(users.id, workerReviews.reviewedByUserId))
      .leftJoin(cvSubmissions, eq(cvSubmissions.id, workerReviews.cvSubmissionId))
      .where(where)
      .orderBy(...order)
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(workerReviews).where(where),
  ]);
  const items = rows.map(
    ({ r, countryName, reviewedByName, cvCode, cvName }): StaffWorkerReview => ({
      id: r.id,
      status: r.status,
      rating: r.rating,
      body: r.body,
      displayName: r.displayName,
      trade: r.trade,
      countryCode: r.countryCode ?? null,
      countryName: countryName ?? null,
      consentToPublish: r.consentToPublish,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      reviewedByName: reviewedByName ?? null,
      publishedAt: r.publishedAt,
      cv: canViewCv && r.cvSubmissionId && cvCode && cvName ? { id: r.cvSubmissionId, code: cvCode, name: cvName } : null,
      mentionsContactDetails: mentionsContactDetails(r.body),
    }),
  );
  return paginated(items, totals[0]?.value ?? 0, page);
}

const DECISION_ACTIONS: Record<WorkerReviewDecision, string> = {
  approve: "worker_review.approved",
  reject: "worker_review.rejected",
  hide: "worker_review.hidden",
  unhide: "worker_review.unhidden",
};

/**
 * Approve (on the website; only with the worker's consent; also undoes a rejection), reject, hide or show again
 * (candidates.manage). The row is locked so two staff deciding at once cannot both win; a decision that no longer
 * applies says so. publishedAt keeps the first publication date. Audited.
 */
export async function moderateWorkerReview(ctx: StaffContext, input: WorkerReviewModerateInput): Promise<{ status: WorkerReviewStatus }> {
  assertCanManage(ctx);
  return db.transaction(async (tx) => {
    const [review] = await tx.select().from(workerReviews).where(eq(workerReviews.id, input.id)).for("update").limit(1);
    if (!review) throw new ActionError("This review could not be found.");
    if (decisionPublishes(input.decision) && !review.consentToPublish) {
      throw new ActionError("The worker did not allow us to show this review on the website, so it stays private.", { code: "no_consent" });
    }
    const next = nextWorkerReviewStatus(review.status, input.decision, review.consentToPublish);
    if (!next) throw new ActionError("This review was already updated. Refresh the page to see where it is now.", { code: "stale" });
    const now = new Date();
    await tx
      .update(workerReviews)
      .set({ status: next, reviewedByUserId: ctx.user.id, reviewedAt: now, ...(next === "approved" && !review.publishedAt ? { publishedAt: now } : {}) })
      .where(eq(workerReviews.id, review.id));
    await audit({
      action: DECISION_ACTIONS[input.decision],
      entityType: "worker_review",
      entityId: review.id,
      actorUserId: ctx.user.id,
      metadata: { from: review.status, to: next, cvSubmissionId: review.cvSubmissionId },
      tx,
    });
    return { status: next };
  });
}
