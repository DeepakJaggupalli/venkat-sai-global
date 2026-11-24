import { describe, expect, it } from "vitest";

import { signTokenWith } from "@/lib/signed-token";

import { WORKER_REVIEW_LINK_DAYS } from "./schemas";
import { readWorkerReviewTokenWith, signWorkerReviewTokenWith, WORKER_REVIEW_TOKEN_PURPOSE, workerReviewPath } from "./tokens";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const SUBMISSION = "6f1c2b9e-1d1e-4c1a-9a55-2a8a0b2b7c11";
const DAY = 24 * 3600 * 1000;

describe("worker review links", () => {
  const now = new Date("2026-11-23T10:00:00Z");

  it("round-trips the CV submission id and expires 30 days later", () => {
    const { token, expiresAt } = signWorkerReviewTokenWith(SECRET, SUBMISSION, now);
    expect(WORKER_REVIEW_LINK_DAYS).toBe(30);
    expect(expiresAt.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(readWorkerReviewTokenWith(SECRET, token, now)).toEqual({ submissionId: SUBMISSION, expiresAt });
    // Upper-case ids (hand-typed) are normalised.
    const upper = signWorkerReviewTokenWith(SECRET, SUBMISSION.toUpperCase(), now).token;
    expect(readWorkerReviewTokenWith(SECRET, upper, now)?.submissionId).toBe(SUBMISSION);
  });

  it("works until the expiry and not a second after", () => {
    const { token, expiresAt } = signWorkerReviewTokenWith(SECRET, SUBMISSION, now);
    expect(readWorkerReviewTokenWith(SECRET, token, new Date(now.getTime() + 29 * DAY))).not.toBeNull();
    expect(readWorkerReviewTokenWith(SECRET, token, new Date(expiresAt.getTime() - 1000))).not.toBeNull();
    expect(readWorkerReviewTokenWith(SECRET, token, expiresAt)).toBeNull();
    expect(readWorkerReviewTokenWith(SECRET, token, new Date(now.getTime() + 31 * DAY))).toBeNull();
  });

  it("rejects tampering, another secret, another purpose and garbage", () => {
    const { token } = signWorkerReviewTokenWith(SECRET, SUBMISSION, now);
    const [body, signature] = token.split(".") as [string, string];

    // Someone else's submission with the original signature.
    const otherBody = Buffer.from(JSON.stringify({ s: "0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11", e: Math.floor(now.getTime() / 1000) + 3600 })).toString("base64url");
    expect(readWorkerReviewTokenWith(SECRET, `${otherBody}.${signature}`, now)).toBeNull();
    // A later expiry with the original signature.
    const longerBody = Buffer.from(JSON.stringify({ s: SUBMISSION, e: 9_999_999_999 })).toString("base64url");
    expect(readWorkerReviewTokenWith(SECRET, `${longerBody}.${signature}`, now)).toBeNull();
    // A changed signature (same length) and a truncated one (WhatsApp sometimes cuts long links).
    const flipped = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(readWorkerReviewTokenWith(SECRET, `${body}.${flipped}`, now)).toBeNull();
    expect(readWorkerReviewTokenWith(SECRET, `${body}.${signature.slice(0, -4)}`, now)).toBeNull();
    expect(readWorkerReviewTokenWith(SECRET, token.slice(0, 40), now)).toBeNull();

    expect(readWorkerReviewTokenWith(`${SECRET}x`, token, now)).toBeNull();
    // A CV document upload link for the same submission is not a review link (and vice versa).
    const uploadLink = signTokenWith(SECRET, "cv_submission_documents", SUBMISSION, new Date(now.getTime() + DAY));
    expect(readWorkerReviewTokenWith(SECRET, uploadLink, now)).toBeNull();

    for (const junk of ["", "garbage", "a.b.c", `${token}.extra`, null, undefined, "x".repeat(600)]) {
      expect(readWorkerReviewTokenWith(SECRET, junk, now)).toBeNull();
    }
  });

  it("only accepts CV submission ids as the subject", () => {
    const notAnId = signTokenWith(SECRET, WORKER_REVIEW_TOKEN_PURPOSE, "VSG-CV-000123", new Date(now.getTime() + DAY));
    expect(readWorkerReviewTokenWith(SECRET, notAnId, now)).toBeNull();
  });

  it("builds the public page path (token characters are URL-safe)", () => {
    const { token } = signWorkerReviewTokenWith(SECRET, SUBMISSION, now);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(workerReviewPath(token)).toBe(`/review/${token}`);
  });
});
