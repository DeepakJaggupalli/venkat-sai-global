import "server-only";

import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { toDataURL } from "qrcode";

import { BRAND } from "@/config/site";
import { db } from "@/db";
import { userTwoFactor } from "@/db/schema";
import { decryptField, hmacToken, safeEqual } from "@/lib/crypto";

import { RECOVERY_CODE_COUNT } from "./types";

/**
 * TOTP two-factor authentication (RFC 6238: SHA-1, 6 digits, 30-second steps) and recovery codes.
 *
 * - Secrets are 160-bit, stored AES-256-GCM encrypted (encryptField) in user_two_factor.
 * - Verification accepts the previous, current and next step (±1) and rejects any step at or
 *   before `lastUsedStep`, so an observed code cannot be replayed.
 * - Recovery codes (10 × ~50 bits) are shown once; only HMAC hashes are stored. Each works once.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ALGORITHM = "SHA1";
export const TOTP_WINDOW = 1;

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** otpauth:// URI understood by Google Authenticator, Microsoft Authenticator, 1Password, etc. */
export function buildTotpUri(secretBase32: string, accountLabel: string): string {
  return new TOTP({
    issuer: BRAND.name,
    label: accountLabel,
    secret: Secret.fromBase32(secretBase32),
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  }).toString();
}

export async function totpQrCodeDataUrl(uri: string): Promise<string> {
  return toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#101c35", light: "#ffffff" } });
}

/** "JBSW Y3DP EHPK 3PXP" — easier to type into an authenticator app. */
export function formatManualKey(secretBase32: string): string {
  return secretBase32.replace(/=+$/, "").replace(/(.{4})/g, "$1 ").trim();
}

export function totpStepAt(timestampMs: number): number {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
}

export type TotpVerification = { ok: true; step: number } | { ok: false; reason: "malformed" | "invalid" | "replayed" };

/** Verify a 6-digit code with a ±1 step window and replay protection. Pure (no I/O). */
export function verifyTotpCode(input: { secret: string; code: string; lastUsedStep: number | null; now?: number }): TotpVerification {
  const token = input.code.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(token)) return { ok: false, reason: "malformed" };
  const timestamp = input.now ?? Date.now();
  let delta: number | null;
  try {
    delta = TOTP.validate({
      token,
      secret: Secret.fromBase32(input.secret),
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      timestamp,
      window: TOTP_WINDOW,
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (delta === null) return { ok: false, reason: "invalid" };
  const step = totpStepAt(timestamp) + delta;
  if (input.lastUsedStep !== null && step <= input.lastUsedStep) return { ok: false, reason: "replayed" };
  return { ok: true, step };
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

/** No 0/o, 1/l/i: easy to read back from paper. 31 symbols × 10 ≈ 49.5 bits per code. */
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type RecoveryCodeEntry = { hash: string; usedAt: string | null };

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}

export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return hmacToken(normalizeRecoveryCode(code), "recovery-code");
}

export function hashRecoveryCodes(codes: string[]): RecoveryCodeEntry[] {
  return codes.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null }));
}

export function countRemainingRecoveryCodes(entries: RecoveryCodeEntry[] | null | undefined): number {
  return (entries ?? []).filter((entry) => !entry.usedAt).length;
}

/** Mark a matching unused code as used. Pure: returns the updated list. */
export function consumeRecoveryCode(
  entries: RecoveryCodeEntry[],
  input: string,
  now: Date = new Date(),
): { ok: true; entries: RecoveryCodeEntry[]; remaining: number } | { ok: false } {
  const normalized = normalizeRecoveryCode(input);
  if (normalized.length !== 10) return { ok: false };
  const hash = hashRecoveryCode(normalized);
  let matched = false;
  const updated = entries.map((entry) => {
    // Compare every entry (constant work regardless of position).
    const equal = safeEqual(entry.hash, hash);
    if (equal && !entry.usedAt && !matched) {
      matched = true;
      return { ...entry, usedAt: now.toISOString() };
    }
    return entry;
  });
  if (!matched) return { ok: false };
  return { ok: true, entries: updated, remaining: countRemainingRecoveryCodes(updated) };
}

// ---------------------------------------------------------------------------
// Database-backed second-factor check (sign-in challenge, re-authentication)
// ---------------------------------------------------------------------------

export type SecondFactorResult =
  | { ok: true; method: "totp" | "recovery"; recoveryCodesRemaining: number }
  | { ok: false; reason: "not_enabled" | "invalid" };

/**
 * Verify a TOTP code or a recovery code for a user with 2FA enabled. Locks the row so concurrent
 * attempts cannot reuse the same step / recovery code, and records the accepted step.
 */
export async function verifySecondFactor(
  userId: string,
  input: { code: string; method?: "totp" | "recovery" | "auto" },
  opts: { now?: Date } = {},
): Promise<SecondFactorResult> {
  const now = opts.now ?? new Date();
  const raw = input.code.trim();
  // Recovery codes are 10 characters (and may contain only digits), authenticator codes exactly 6 digits.
  const method = input.method && input.method !== "auto" ? input.method : /^\d{6}$/.test(raw.replace(/[\s-]/g, "")) ? "totp" : "recovery";

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(userTwoFactor).where(eq(userTwoFactor.userId, userId)).limit(1).for("update");
    if (!row?.enabledAt) return { ok: false, reason: "not_enabled" } as const;

    if (method === "totp") {
      let secret: string;
      try {
        secret = decryptField(row.totpSecretEncrypted);
      } catch {
        return { ok: false, reason: "invalid" } as const;
      }
      const check = verifyTotpCode({ secret, code: raw, lastUsedStep: row.lastUsedStep ?? null, now: now.getTime() });
      if (!check.ok) return { ok: false, reason: "invalid" } as const;
      await tx.update(userTwoFactor).set({ lastUsedStep: check.step }).where(eq(userTwoFactor.userId, userId));
      return { ok: true, method: "totp", recoveryCodesRemaining: countRemainingRecoveryCodes(row.recoveryCodes) } as const;
    }

    const consumed = consumeRecoveryCode(row.recoveryCodes ?? [], raw, now);
    if (!consumed.ok) return { ok: false, reason: "invalid" } as const;
    await tx.update(userTwoFactor).set({ recoveryCodes: consumed.entries }).where(eq(userTwoFactor.userId, userId));
    return { ok: true, method: "recovery", recoveryCodesRemaining: consumed.remaining } as const;
  });
}
