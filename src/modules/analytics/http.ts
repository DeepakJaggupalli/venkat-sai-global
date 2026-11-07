import "server-only";

import { isSameOrigin } from "@/lib/request";

import { CONSENT_COOKIE, effectiveConsent, parseConsentCookie, readCookieValue, type ConsentCategories, type StoredConsent } from "./consent";

/**
 * Request helpers shared by POST /api/v1/collect and POST /api/v1/consent.
 */

/**
 * CSRF guard for the beacon endpoints: same Origin, or — when a browser omits Origin on a beacon — the
 * Fetch Metadata header `Sec-Fetch-Site: same-origin` (which pages cannot forge).
 */
export function isSameSiteBeacon(request: Request): boolean {
  if (request.headers.get("origin")) return isSameOrigin(request);
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export type BodyResult = { ok: true; text: string } | { ok: false; status: 400 | 413 };

/** Read the request body as text, refusing anything larger than `maxBytes` (without buffering it all). */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(buffer) };
}

/** Global Privacy Control signal sent by the browser (`Sec-GPC: 1`). */
export function hasGpcHeader(request: Request): boolean {
  return request.headers.get("sec-gpc")?.trim() === "1";
}

/** The visitor's stored choice and what it allows right now, read from the request cookies. */
export function consentFromRequest(request: Request, currentVersion: string): { stored: StoredConsent | null; effective: ConsentCategories } {
  const stored = parseConsentCookie(readCookieValue(request.headers.get("cookie") ?? "", CONSENT_COOKIE));
  return { stored, effective: effectiveConsent(stored, currentVersion, hasGpcHeader(request)) };
}

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/** 204 No Content (the collector's answer whether or not the batch was stored). */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
