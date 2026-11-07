import "server-only";

import { hmacToken, safeEqual } from "@/lib/crypto";

import { PREVIEW_TOKEN_DEFAULT_MINUTES, PREVIEW_TOKEN_MAX_MINUTES } from "./constants";

/**
 * Signed, short-lived, entry-scoped preview tokens (no table).
 *
 *   v1.<entryId>.<version|"l">.<expiresAtUnixSeconds>.<HMAC-SHA256(SESSION_SECRET, purpose "cms-preview")>
 *
 * A token only opens the one entry it names, either a pinned version or "l" (the latest saved version at
 * viewing time), until it expires (default 60 minutes, never more than 24 hours — longer-lived tokens are
 * refused even when correctly signed). Tokens are bearer secrets: share them only with reviewers.
 */
const PURPOSE = "cms-preview";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PreviewTokenPayload = { entryId: string; version: number | "latest"; expiresAt: Date };

function signature(entryId: string, version: string, exp: number): string {
  return hmacToken(`${entryId}.${version}.${exp}`, PURPOSE);
}

export function signPreviewToken(
  input: { entryId: string; version: number | "latest"; ttlMinutes?: number },
  now: Date = new Date(),
): { token: string; expiresAt: Date } {
  if (!UUID.test(input.entryId)) throw new Error("Invalid entry id");
  if (input.version !== "latest" && (!Number.isInteger(input.version) || input.version < 1)) throw new Error("Invalid version");
  const ttl = Math.min(Math.max(Math.round(input.ttlMinutes ?? PREVIEW_TOKEN_DEFAULT_MINUTES), 1), PREVIEW_TOKEN_MAX_MINUTES);
  const exp = Math.floor(now.getTime() / 1000) + ttl * 60;
  const version = input.version === "latest" ? "l" : String(input.version);
  const entryId = input.entryId.toLowerCase();
  return { token: `v1.${entryId}.${version}.${exp}.${signature(entryId, version, exp)}`, expiresAt: new Date(exp * 1000) };
}

/** The token's payload when it is well-formed, correctly signed and unexpired; otherwise null (never throws). */
export function verifyPreviewToken(token: string | null | undefined, now: Date = new Date()): PreviewTokenPayload | null {
  if (!token || token.length > 300) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 5) return null;
  const [prefix, entryId, version, expRaw, sig] = parts as [string, string, string, string, string];
  if (prefix !== "v1" || !UUID.test(entryId) || !/^(l|[1-9]\d{0,8})$/.test(version) || !/^\d{1,12}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (exp <= nowSeconds || exp - nowSeconds > PREVIEW_TOKEN_MAX_MINUTES * 60) return null;
  if (!safeEqual(sig, signature(entryId.toLowerCase(), version, exp))) return null;
  return { entryId: entryId.toLowerCase(), version: version === "l" ? "latest" : Number(version), expiresAt: new Date(exp * 1000) };
}
