import "server-only";

import { signToken, verifyToken } from "@/lib/signed-token";

import { CV_DOCUMENT_CANDIDATE_LINK_HOURS, CV_DOCUMENT_STAFF_LINK_DAYS } from "./cv-submission-schemas";

/**
 * Signed upload links for "Add your documents" (HMAC with the app secret, bound to one CV submission). The candidate
 * gets a short link right after sending the CV; staff can issue a fresh 7-day link to send on WhatsApp. A token only
 * lets its holder ADD documents to that submission: it never reveals any stored file or personal data.
 */

export const CV_DOCUMENT_TOKEN_PURPOSE = "cv_submission_documents";

export function issueCvDocumentUploadToken(submissionId: string, issuedFor: "candidate" | "staff_link"): { token: string; expiresAt: Date } {
  const ttl = issuedFor === "candidate" ? CV_DOCUMENT_CANDIDATE_LINK_HOURS * 3600 : CV_DOCUMENT_STAFF_LINK_DAYS * 24 * 3600;
  return signToken(CV_DOCUMENT_TOKEN_PURPOSE, submissionId, ttl);
}

/** The submission id the token is for, or null (forged, expired). The caller still checks the row exists. */
export function readCvDocumentUploadToken(token: string | null | undefined): { submissionId: string; expiresAt: Date } | null {
  const claims = verifyToken(token, CV_DOCUMENT_TOKEN_PURPOSE);
  if (!claims || !/^[0-9a-f-]{36}$/i.test(claims.subject)) return null;
  return { submissionId: claims.subject, expiresAt: claims.expiresAt };
}

/** Path of the public upload page for a token. */
export function cvDocumentUploadPath(token: string): string {
  return `/send-cv/documents?t=${encodeURIComponent(token)}`;
}
