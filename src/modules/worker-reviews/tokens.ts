import "server-only";

import { signToken, signTokenWith, verifyToken, verifyTokenWith } from "@/lib/signed-token";

import { WORKER_REVIEW_LINK_DAYS } from "./schemas";

/**
 * Signed review links ("How was your experience?"): the CV submission id + an expiry 30 days ahead, HMAC-signed with
 * the app secret (src/lib/signed-token, the same helper as the CV document upload links; verification is
 * timing-safe). A token only lets its holder send ONE review for that submission (the service enforces one review
 * per submission); it never reveals anything stored except the worker's first name and trade on the form.
 */

export const WORKER_REVIEW_TOKEN_PURPOSE = "worker_review";
const TTL_SECONDS = WORKER_REVIEW_LINK_DAYS * 24 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkerReviewTokenClaims = { submissionId: string; expiresAt: Date };

/** Pure (tests, scripts): a link for a submission, valid WORKER_REVIEW_LINK_DAYS from `now`. */
export function signWorkerReviewTokenWith(secret: string, submissionId: string, now: Date = new Date()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000);
  return { token: signTokenWith(secret, WORKER_REVIEW_TOKEN_PURPOSE, submissionId, expiresAt), expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000) };
}

function toClaims(claims: { subject: string; expiresAt: Date } | null): WorkerReviewTokenClaims | null {
  if (!claims || !UUID.test(claims.subject)) return null;
  return { submissionId: claims.subject.toLowerCase(), expiresAt: claims.expiresAt };
}

/** Pure: the submission a token is for, or null (malformed, forged, another purpose, expired). */
export function readWorkerReviewTokenWith(secret: string, token: string | null | undefined, now: Date = new Date()): WorkerReviewTokenClaims | null {
  return toClaims(verifyTokenWith(secret, token, WORKER_REVIEW_TOKEN_PURPOSE, now));
}

/** A fresh 30-day review link token for a CV submission (signed with the app secret). */
export function issueWorkerReviewToken(submissionId: string): { token: string; expiresAt: Date } {
  return signToken(WORKER_REVIEW_TOKEN_PURPOSE, submissionId, TTL_SECONDS);
}

/** The submission a token is for, or null. The caller still checks the submission exists and has no review yet. */
export function readWorkerReviewToken(token: string | null | undefined): WorkerReviewTokenClaims | null {
  return toClaims(verifyToken(token, WORKER_REVIEW_TOKEN_PURPOSE));
}

/** Path of the public review page for a token. */
export function workerReviewPath(token: string): string {
  return `/review/${encodeURIComponent(token)}`;
}
