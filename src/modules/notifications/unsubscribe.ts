import "server-only";

import { hmacToken, safeEqual } from "@/lib/crypto";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "@/db/schema/notifications";

import type { NotificationCategory, NotificationChannel } from "./events";

/**
 * Signed one-click unsubscribe tokens (no table): `<payload>.<signature>` where payload is base64url JSON
 * `{ v: 1, u: userId, c: category, ch: channel, t: issuedAtSeconds }` and signature is
 * HMAC-SHA256(SESSION_SECRET, "notification-unsubscribe:<payload>") via hmacToken(). Tokens are bound to one
 * user + category + channel, cannot be forged or altered, and expire after a year (old emails then point
 * people to their preferences instead). Rotating SESSION_SECRET invalidates every outstanding link.
 */
const PURPOSE = "notification-unsubscribe";
const VERSION = 1;
export const UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UnsubscribeClaims = {
  userId: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  issuedAt: Date;
};

export type UnsubscribeTokenResult = ({ ok: true } & UnsubscribeClaims) | { ok: false; reason: "malformed" | "invalid" | "expired" };

export function createUnsubscribeToken(
  input: { userId: string; category: NotificationCategory; channel?: NotificationChannel },
  now: Date = new Date(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ v: VERSION, u: input.userId, c: input.category, ch: input.channel ?? "email", t: Math.floor(now.getTime() / 1000) }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${hmacToken(payload, PURPOSE)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined, now: Date = new Date()): UnsubscribeTokenResult {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [payload, signature] = parts as [string, string];
  if (!safeEqual(signature, hmacToken(payload, PURPOSE))) return { ok: false, reason: "invalid" };

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!claims || typeof claims !== "object") return { ok: false, reason: "malformed" };
  const c = claims as Record<string, unknown>;
  if (
    c.v !== VERSION ||
    typeof c.u !== "string" ||
    !UUID.test(c.u) ||
    typeof c.c !== "string" ||
    !(NOTIFICATION_CATEGORIES as readonly string[]).includes(c.c) ||
    typeof c.ch !== "string" ||
    !(NOTIFICATION_CHANNELS as readonly string[]).includes(c.ch) ||
    typeof c.t !== "number" ||
    !Number.isFinite(c.t)
  ) {
    return { ok: false, reason: "malformed" };
  }
  const issuedAt = new Date(c.t * 1000);
  const ageSeconds = (now.getTime() - issuedAt.getTime()) / 1000;
  if (ageSeconds > UNSUBSCRIBE_TOKEN_MAX_AGE_SECONDS || ageSeconds < -300) return { ok: false, reason: "expired" };
  return { ok: true, userId: c.u, category: c.c as NotificationCategory, channel: c.ch as NotificationChannel, issuedAt };
}
