import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { verificationTokens, type VerificationPurpose } from "@/db/schema";
import { hmacToken, randomNumericCode, randomToken, safeEqual } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { logSecurityEvent } from "@/modules/audit";
import { sendEmail, sendSms, type SendResult } from "@/modules/messaging";
import { isFeatureEnabled } from "@/modules/settings";

import { AuthError } from "./errors";
import { buildOtpDelivery, resolveLocale, type OtpDelivery } from "./messages";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, type OtpChannel, type OtpPurpose } from "./types";

/**
 * One-time codes (6 digits) and single-use link tokens stored in `verification_tokens`.
 *
 * - Only an HMAC of the secret is stored (bound to purpose + target, or to the token id for links).
 * - Codes expire after 10 minutes, allow 5 attempts, can be consumed once, and issuing a new code
 *   supersedes every earlier unconsumed code for the same target and purpose.
 * - Resend cooldown 60 s; sends are rate-limited per target and per IP; verification per target.
 * - Channel feature flags: SMS needs `auth.phone_otp`; email sign-in codes need `auth.email_otp`.
 *   Email codes that prove ownership of an address (sign-up, verification, email change) are always
 *   allowed, otherwise email accounts could never be verified.
 */

// Compile-time guard: types.ts OTP_PURPOSES must mirror the database enum.
type Assert<T extends true> = T;
export type _OtpPurposeParity = Assert<[VerificationPurpose] extends [OtpPurpose] ? ([OtpPurpose] extends [VerificationPurpose] ? true : false) : false>;

const SEND_LIMIT_PER_TARGET = { limit: 5, windowSeconds: 15 * 60 };
const SEND_LIMIT_PER_IP = { limit: 30, windowSeconds: 60 * 60 };
const VERIFY_LIMIT_PER_TARGET = { limit: 20, windowSeconds: 15 * 60 };

const isOtpRow: SQL = sql`${verificationTokens.metadata}->>'kind' = 'otp'`;
const isLinkRow: SQL = sql`${verificationTokens.metadata}->>'kind' = 'link'`;

export function normalizeOtpTarget(channel: OtpChannel, target: string): string {
  return channel === "email" ? target.trim().toLowerCase() : target.trim();
}

/** Pseudonymous key for rate-limit buckets (no raw email/phone in system tables). */
export function targetRateKey(target: string): string {
  return hmacToken(target.trim().toLowerCase(), "rate-limit-target").slice(0, 32);
}

export function hashOtpCode(code: string, purpose: OtpPurpose, target: string): string {
  return hmacToken(code, `otp:${purpose}:${target}`);
}

function hashLinkSecret(id: string, secret: string, purpose: OtpPurpose): string {
  return hmacToken(secret, `link:${purpose}:${id}`);
}

/** Whether codes for this purpose may be sent over this channel (feature flags). */
export async function isOtpChannelEnabled(purpose: OtpPurpose, channel: OtpChannel): Promise<boolean> {
  if (channel === "sms") return isFeatureEnabled("auth.phone_otp");
  if (purpose === "login_otp") return isFeatureEnabled("auth.email_otp");
  return true;
}

export type OtpDeliverFn = (delivery: OtpDelivery) => Promise<SendResult>;

const deliverViaMessaging: OtpDeliverFn = (delivery) =>
  delivery.channel === "email" ? sendEmail(delivery.message) : sendSms(delivery.message);

export type IssueOtpInput = {
  purpose: OtpPurpose;
  channel: OtpChannel;
  target: string;
  userId?: string | null;
  /** Recipient language for the message (falls back to English). */
  locale?: string | null;
  metadata?: Record<string, unknown>;
};

export type IssueOtpResult = { tokenId: string; expiresAt: Date; resendAvailableAt: Date };

export type IssueOtpOptions = {
  now?: Date;
  /** Transport override (tests). Defaults to the messaging module's sendEmail / sendSms. */
  deliver?: OtpDeliverFn;
};

function cooldownRemainingSeconds(lastCreatedAt: Date | undefined, now: Date): number {
  if (!lastCreatedAt) return 0;
  const elapsed = now.getTime() - lastCreatedAt.getTime();
  const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
  return elapsed >= 0 && elapsed < cooldownMs ? Math.ceil((cooldownMs - elapsed) / 1000) : 0;
}

async function latestOtpCreatedAt(tx: DbOrTx, purpose: OtpPurpose, target: string): Promise<Date | undefined> {
  const [latest] = await tx
    .select({ createdAt: verificationTokens.createdAt })
    .from(verificationTokens)
    .where(and(eq(verificationTokens.target, target), eq(verificationTokens.purpose, purpose), isOtpRow))
    .orderBy(desc(verificationTokens.createdAt))
    .limit(1);
  return latest?.createdAt;
}

/**
 * Create and send a one-time code. Throws AuthError: email_otp_disabled / phone_otp_disabled,
 * otp_cooldown ({ seconds }), otp_rate_limited, otp_delivery_failed.
 */
export async function issueOtp(input: IssueOtpInput, opts: IssueOtpOptions = {}): Promise<IssueOtpResult> {
  const now = opts.now ?? new Date();
  const target = normalizeOtpTarget(input.channel, input.target);
  const userId = input.userId ?? null;

  if (!(await isOtpChannelEnabled(input.purpose, input.channel))) {
    throw new AuthError(input.channel === "sms" ? "phone_otp_disabled" : "email_otp_disabled");
  }

  const waitSeconds = cooldownRemainingSeconds(await latestOtpCreatedAt(db, input.purpose, target), now);
  if (waitSeconds > 0) throw new AuthError("otp_cooldown", { vars: { seconds: waitSeconds } });

  const meta = await getRequestMeta().catch(() => null);
  const perTarget = await rateLimit(`otp:send:${input.purpose}:${targetRateKey(target)}`, SEND_LIMIT_PER_TARGET.limit, SEND_LIMIT_PER_TARGET.windowSeconds);
  const perIp = meta?.ipHash ? await rateLimit(`otp:send-ip:${meta.ipHash}`, SEND_LIMIT_PER_IP.limit, SEND_LIMIT_PER_IP.windowSeconds) : null;
  if (!perTarget.allowed || (perIp && !perIp.allowed)) {
    await logSecurityEvent({ userId, type: "otp_rate_limited", severity: "warning", metadata: { purpose: input.purpose, channel: input.channel } });
    throw new AuthError("otp_rate_limited");
  }

  const code = randomNumericCode(OTP_LENGTH);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

  const tokenId = await db.transaction(async (tx) => {
    // Serialise concurrent sends for the same target + purpose, then re-check the cooldown.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`otp:${input.purpose}:${target}`}, 0))`);
    const seconds = cooldownRemainingSeconds(await latestOtpCreatedAt(tx, input.purpose, target), now);
    if (seconds > 0) throw new AuthError("otp_cooldown", { vars: { seconds } });

    // Only the newest code is valid.
    await tx
      .update(verificationTokens)
      .set({ consumedAt: now })
      .where(and(eq(verificationTokens.target, target), eq(verificationTokens.purpose, input.purpose), isNull(verificationTokens.consumedAt), isOtpRow));

    const [row] = await tx
      .insert(verificationTokens)
      .values({
        purpose: input.purpose,
        channel: input.channel,
        target,
        userId,
        secretHash: hashOtpCode(code, input.purpose, target),
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt,
        ipHash: meta?.ipHash ?? null,
        metadata: { ...(input.metadata ?? {}), kind: "otp" },
        createdAt: now,
      })
      .returning({ id: verificationTokens.id });
    return row!.id;
  });

  const delivery = buildOtpDelivery({
    purpose: input.purpose,
    channel: input.channel,
    to: target,
    code,
    minutes: OTP_TTL_MINUTES,
    locale: resolveLocale(input.locale),
  });
  let result: SendResult;
  try {
    result = await (opts.deliver ?? deliverViaMessaging)(delivery);
  } catch (error) {
    logger.error("One-time code delivery failed", { error, purpose: input.purpose, channel: input.channel });
    result = { ok: false, error: "exception", provider: "unknown" };
  }
  if (!result.ok) {
    // Remove the undeliverable code so the cooldown does not block a corrected retry.
    await db.delete(verificationTokens).where(eq(verificationTokens.id, tokenId));
    await logSecurityEvent({
      userId,
      type: "otp_delivery_failed",
      severity: "warning",
      metadata: { purpose: input.purpose, channel: input.channel, provider: result.provider },
    });
    throw new AuthError("otp_delivery_failed");
  }

  await logSecurityEvent({ userId, type: "otp_sent", metadata: { purpose: input.purpose, channel: input.channel, tokenId } });
  return { tokenId, expiresAt, resendAvailableAt: new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000) };
}

export type VerifyOtpFailureReason = "invalid" | "expired" | "too_many_attempts" | "not_found";

export type VerifyOtpResult =
  | { ok: true; tokenId: string; userId: string | null; channel: OtpChannel; metadata: Record<string, unknown> }
  | { ok: false; reason: VerifyOtpFailureReason; attemptsRemaining: number };

export type VerifyOtpInput = {
  purpose: OtpPurpose;
  target: string;
  code: string;
  /**
   * When given, the code must have been issued for this user (null = issued without a user).
   * Omit to accept a code regardless of the user it was issued for.
   */
  userId?: string | null;
};

/**
 * Check a code against the newest unconsumed code for (target, purpose). Wrong codes count as
 * attempts; the 5th wrong attempt locks the code. A correct code is consumed atomically.
 */
export async function verifyOtp(input: VerifyOtpInput, opts: { now?: Date } = {}): Promise<VerifyOtpResult> {
  const now = opts.now ?? new Date();
  const target = input.target.includes("@") ? input.target.trim().toLowerCase() : input.target.trim();
  const code = input.code.replace(/[\s-]/g, "");
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) return { ok: false, reason: "invalid", attemptsRemaining: OTP_MAX_ATTEMPTS };

  const limiter = await rateLimit(`otp:verify:${targetRateKey(target)}`, VERIFY_LIMIT_PER_TARGET.limit, VERIFY_LIMIT_PER_TARGET.windowSeconds);
  if (!limiter.allowed) {
    await logSecurityEvent({ userId: input.userId ?? null, type: "otp_verify_rate_limited", severity: "warning", metadata: { purpose: input.purpose } });
    return { ok: false, reason: "too_many_attempts", attemptsRemaining: 0 };
  }

  const outcome = await db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.target, target),
          eq(verificationTokens.purpose, input.purpose),
          isNull(verificationTokens.consumedAt),
          isOtpRow,
        ),
      )
      .orderBy(desc(verificationTokens.createdAt))
      .limit(1)
      .for("update");

    if (!token) return { result: { ok: false, reason: "not_found", attemptsRemaining: 0 } as VerifyOtpResult, tokenUserId: null };
    const tokenUserId = token.userId ?? null;
    if (token.expiresAt.getTime() <= now.getTime()) {
      return { result: { ok: false, reason: "expired", attemptsRemaining: 0 } as VerifyOtpResult, tokenUserId };
    }
    if (token.attempts >= token.maxAttempts) {
      return { result: { ok: false, reason: "too_many_attempts", attemptsRemaining: 0 } as VerifyOtpResult, tokenUserId };
    }

    const attempts = token.attempts + 1;
    const codeMatches = safeEqual(token.secretHash, hashOtpCode(code, input.purpose, target));
    const userMatches = input.userId === undefined || tokenUserId === (input.userId ?? null);
    if (!codeMatches || !userMatches) {
      await tx.update(verificationTokens).set({ attempts }).where(eq(verificationTokens.id, token.id));
      const attemptsRemaining = Math.max(0, token.maxAttempts - attempts);
      return {
        result: { ok: false, reason: attemptsRemaining === 0 ? "too_many_attempts" : "invalid", attemptsRemaining } as VerifyOtpResult,
        tokenUserId,
      };
    }

    await tx.update(verificationTokens).set({ attempts, consumedAt: now }).where(eq(verificationTokens.id, token.id));
    const result: VerifyOtpResult = {
      ok: true,
      tokenId: token.id,
      userId: tokenUserId,
      channel: token.channel === "sms" ? "sms" : "email",
      metadata: token.metadata,
    };
    return { result, tokenUserId };
  });

  if (!outcome.result.ok) {
    const { reason } = outcome.result;
    await logSecurityEvent({
      userId: outcome.tokenUserId ?? input.userId ?? null,
      type: reason === "too_many_attempts" ? "otp_locked" : "otp_failed",
      severity: reason === "invalid" || reason === "too_many_attempts" ? "warning" : "info",
      metadata: { purpose: input.purpose, reason },
    });
  }
  return outcome.result;
}

/** Mark every active code / link of a purpose as used (e.g. after a password reset). */
export async function invalidateActiveTokens(filter: { purpose: OtpPurpose; userId?: string; target?: string }, tx: DbOrTx = db): Promise<void> {
  const conditions: SQL[] = [eq(verificationTokens.purpose, filter.purpose), isNull(verificationTokens.consumedAt)];
  if (filter.userId) conditions.push(eq(verificationTokens.userId, filter.userId));
  if (filter.target) conditions.push(eq(verificationTokens.target, filter.target));
  if (!filter.userId && !filter.target) throw new Error("invalidateActiveTokens needs a userId or target");
  await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(and(...conditions));
}

// ---------------------------------------------------------------------------
// Single-use link tokens (password reset e-mails). Token format: "<uuid>.<secret>".
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{40,64}$/;

export function parseLinkToken(token: string): { id: string; secret: string } | null {
  const [id, secret, extra] = token.trim().split(".");
  if (!id || !secret || extra !== undefined || !UUID_RE.test(id) || !SECRET_RE.test(secret)) return null;
  return { id: id.toLowerCase(), secret };
}

export type IssueLinkTokenResult = { token: string; tokenId: string; expiresAt: Date };

export async function issueLinkToken(
  input: { purpose: OtpPurpose; target: string; userId: string; ttlMinutes: number; metadata?: Record<string, unknown> },
  opts: { now?: Date } = {},
): Promise<IssueLinkTokenResult> {
  const now = opts.now ?? new Date();
  const target = normalizeOtpTarget("email", input.target);
  const id = randomUUID();
  const secret = randomToken(32);
  const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000);
  const meta = await getRequestMeta().catch(() => null);
  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ consumedAt: now })
      .where(and(eq(verificationTokens.target, target), eq(verificationTokens.purpose, input.purpose), isNull(verificationTokens.consumedAt), isLinkRow));
    await tx.insert(verificationTokens).values({
      id,
      purpose: input.purpose,
      channel: "email",
      target,
      userId: input.userId,
      secretHash: hashLinkSecret(id, secret, input.purpose),
      attempts: 0,
      maxAttempts: 1,
      expiresAt,
      ipHash: meta?.ipHash ?? null,
      metadata: { ...(input.metadata ?? {}), kind: "link" },
      createdAt: now,
    });
  });
  return { token: `${id}.${secret}`, tokenId: id, expiresAt };
}

export type LinkTokenResult =
  | { ok: true; tokenId: string; userId: string | null; target: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "expired" | "used" };

async function readLinkToken(tx: DbOrTx, token: string, purpose: OtpPurpose, now: Date, lock: boolean): Promise<LinkTokenResult> {
  const parsed = parseLinkToken(token);
  if (!parsed) return { ok: false, reason: "invalid" };
  const query = tx
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.id, parsed.id), eq(verificationTokens.purpose, purpose), isLinkRow))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row || !safeEqual(row.secretHash, hashLinkSecret(row.id, parsed.secret, purpose))) return { ok: false, reason: "invalid" };
  if (row.consumedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, tokenId: row.id, userId: row.userId ?? null, target: row.target, expiresAt: row.expiresAt };
}

/** Validate a link token without using it (e.g. to render the reset form). */
export async function peekLinkToken(token: string, purpose: OtpPurpose, opts: { now?: Date } = {}): Promise<LinkTokenResult> {
  return readLinkToken(db, token, purpose, opts.now ?? new Date(), false);
}

/** Validate and consume a link token atomically (pass `tx` to consume inside a larger transaction). */
export async function consumeLinkToken(token: string, purpose: OtpPurpose, opts: { now?: Date; tx?: DbOrTx } = {}): Promise<LinkTokenResult> {
  const now = opts.now ?? new Date();
  const run = async (tx: DbOrTx) => {
    const result = await readLinkToken(tx, token, purpose, now, true);
    if (result.ok) {
      await tx.update(verificationTokens).set({ consumedAt: now, attempts: 1 }).where(eq(verificationTokens.id, result.tokenId));
    }
    return result;
  };
  return opts.tx ? run(opts.tx) : db.transaction(run);
}
