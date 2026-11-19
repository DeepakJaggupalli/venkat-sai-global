import "server-only";

import { hmacToken, safeEqual } from "@/lib/crypto";

/**
 * Signed, short-lived tokens for a shared upload (purpose `shared_upload`, no table):
 *
 *   v1.<fileId>.<expiresAtUnixSeconds>.<HMAC-SHA256(SESSION_SECRET, purpose "shared-upload")>
 *
 * The token is the visitor's only handle on the file (guests have no session): it opens the preview on
 * /share/choose and is spent once by "Send as my CV" or "Post a requirement". Bound to one file id, valid for
 * SHARED_UPLOAD_TTL_MINUTES; longer-lived tokens are refused even when correctly signed.
 */
export const SHARED_UPLOAD_TTL_MINUTES = 120;

const PURPOSE = "shared-upload";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(fileId: string, exp: number): string {
  return hmacToken(`${fileId}.${exp}`, PURPOSE);
}

export function signSharedUploadToken(fileId: string, now: Date = new Date()): { token: string; expiresAt: Date } {
  if (!UUID.test(fileId)) throw new Error("Invalid file id");
  const id = fileId.toLowerCase();
  const exp = Math.floor(now.getTime() / 1000) + SHARED_UPLOAD_TTL_MINUTES * 60;
  return { token: `v1.${id}.${exp}.${signature(id, exp)}`, expiresAt: new Date(exp * 1000) };
}

/** The file id when the token is well-formed, correctly signed and unexpired; otherwise null (never throws). */
export function verifySharedUploadToken(token: string | null | undefined, now: Date = new Date()): { fileId: string; expiresAt: Date } | null {
  if (!token || token.length > 200) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 4) return null;
  const [prefix, fileId, expRaw, sig] = parts as [string, string, string, string];
  if (prefix !== "v1" || !UUID.test(fileId) || !/^\d{1,12}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (exp <= nowSeconds || exp - nowSeconds > SHARED_UPLOAD_TTL_MINUTES * 60) return null;
  if (!safeEqual(sig, signature(fileId.toLowerCase(), exp))) return null;
  return { fileId: fileId.toLowerCase(), expiresAt: new Date(exp * 1000) };
}
