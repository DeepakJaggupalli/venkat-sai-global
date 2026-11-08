import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "./env";

/**
 * Short, stateless capability tokens: `base64url(JSON payload).base64url(HMAC-SHA256)`, keyed with SESSION_SECRET and
 * bound to a purpose (a token for one feature is useless for another). Used for links sent to people without an
 * account (CV document uploads, resume downloads). A `version` lets the owner of the subject revoke every link issued
 * before (store the current version on the row and compare).
 *
 * Tokens are bearer secrets: never log them, and keep their lifetime short.
 */

export type SignedTokenClaims = {
  /** Subject id (e.g. a cv_submissions.id). */
  subject: string;
  expiresAt: Date;
  version: number;
};

type Payload = { s: string; e: number; v?: number };

function mac(secret: string, purpose: string, body: string): string {
  return createHmac("sha256", secret).update(`signed-token:${purpose}:${body}`).digest("base64url");
}

/** Pure: sign with an explicit secret (tests, scripts). */
export function signTokenWith(secret: string, purpose: string, subject: string, expiresAt: Date, version = 1): string {
  const payload: Payload = { s: subject, e: Math.floor(expiresAt.getTime() / 1000), ...(version !== 1 ? { v: version } : {}) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, purpose, body)}`;
}

/** Pure: verify with an explicit secret. Null when malformed, forged, for another purpose or expired. */
export function verifyTokenWith(secret: string, token: string | null | undefined, purpose: string, now: Date = new Date()): SignedTokenClaims | null {
  if (!token || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts as [string, string];
  const expected = Buffer.from(mac(secret, purpose, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
  if (typeof payload?.s !== "string" || typeof payload.e !== "number") return null;
  if (payload.e * 1000 <= now.getTime()) return null;
  return { subject: payload.s, expiresAt: new Date(payload.e * 1000), version: typeof payload.v === "number" ? payload.v : 1 };
}

/** Sign a token valid for `ttlSeconds` with the app secret. */
export function signToken(purpose: string, subject: string, ttlSeconds: number, version = 1): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  return { token: signTokenWith(env().SESSION_SECRET, purpose, subject, expiresAt, version), expiresAt };
}

/** Verify a token signed with the app secret. */
export function verifyToken(token: string | null | undefined, purpose: string): SignedTokenClaims | null {
  return verifyTokenWith(env().SESSION_SECRET, token, purpose);
}
