import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, type DbOrTx } from "@/db";
import { securityEvents, users } from "@/db/schema";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request";
import { logSecurityEvent } from "@/modules/audit";
import { notify, type NotificationRecipient } from "@/modules/notifications";

import { rateLimit } from "@/lib/rate-limit";

import { getPortalAccess, portalHomePath } from "./authz";
import { describeDevice, deviceFingerprint } from "./device";
import { AuthError } from "./errors";
import { clearAuthFlow } from "./flow";
import { targetRateKey, type VerifyOtpFailureReason } from "./otp";
import { checkPasswordStrength } from "./password";
import { resolvePostAuthRedirect } from "./redirects";
import { createSession, hasTwoFactor, type SessionUser } from "./session";
import { OTP_RESEND_COOLDOWN_SECONDS, type AuthMethod, type Contact, type OtpPurpose, type SignupIntent } from "./types";

/**
 * Shared building blocks for the sign-in / sign-up flows: user lookup, session establishment
 * (with the TOTP hand-off), the locale cookie, post-auth destinations and account notifications.
 */

export type UserRow = typeof users.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function findUserByContact(contact: Contact, tx: DbOrTx = db): Promise<UserRow | null> {
  const column = contact.kind === "email" ? users.email : users.phone;
  const [row] = await tx.select().from(users).where(eq(column, contact.value)).limit(1);
  return row ?? null;
}

export async function findUserById(id: string, tx: DbOrTx = db): Promise<UserRow | null> {
  const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export function toSessionUser(row: UserRow, twoFactorEnabled: boolean): SessionUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    displayName: row.displayName,
    avatarFileId: row.avatarFileId,
    status: row.status,
    isStaff: row.isStaff,
    locale: row.locale,
    timezone: row.timezone,
    hasPassword: Boolean(row.passwordHash),
    twoFactorEnabled,
  };
}

/** Throw the matching "weak_password_*" AuthError when a new password breaks the policy. */
export async function assertStrongPassword(
  password: string,
  context: { email?: string | null; name?: string | null },
  field = "newPassword",
): Promise<void> {
  const check = await checkPasswordStrength(password, context);
  if (!check.ok) throw new AuthError(`weak_password_${check.code}`, { vars: { min: check.minLength }, field });
}

/** Map a failed code check to the user-facing error. */
export function otpFailureError(reason: VerifyOtpFailureReason, field = "code"): AuthError {
  if (reason === "invalid") return new AuthError("otp_invalid", { field });
  if (reason === "too_many_attempts") return new AuthError("otp_too_many_attempts", { field });
  return new AuthError("otp_expired", { field });
}

/**
 * When no account exists we send nothing, but keep the same resend cooldown so the response
 * does not reveal whether the address is registered. Returns when "Resend" becomes available.
 */
export async function emulateOtpCooldown(purpose: OtpPurpose, target: string): Promise<number> {
  const rl = await rateLimit(`otp:ghost:${purpose}:${targetRateKey(target)}`, 1, OTP_RESEND_COOLDOWN_SECONDS);
  if (!rl.allowed) {
    throw new AuthError("otp_cooldown", { vars: { seconds: Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } });
  }
  return Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

/** Seconds from an "otp_cooldown" error, or null for any other error. */
export function cooldownSecondsFrom(error: unknown): number | null {
  if (error instanceof AuthError && error.authCode === "otp_cooldown") return Number(error.vars.seconds ?? OTP_RESEND_COOLDOWN_SECONDS);
  return null;
}

/** Remember the user's language (same cookie the language switcher writes). */
export async function setLocaleCookie(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false });
}

export async function postAuthDestination(
  user: UserRow,
  opts: { returnTo?: string | null; intent?: SignupIntent | null; isNewUser?: boolean },
): Promise<string> {
  const access = await getPortalAccess(toSessionUser(user, false));
  return resolvePostAuthRedirect({
    returnTo: opts.returnTo,
    intent: opts.intent,
    access,
    isNewUser: opts.isNewUser,
    homePath: portalHomePath(access),
  });
}

/**
 * Create the session after a successful first factor and return where to go next.
 * Users with TOTP get a short-lived pending session and are sent to /sign-in/two-factor
 * (the final destination travels as `returnTo`).
 */
export async function establishSession(
  user: UserRow,
  opts: { method: AuthMethod; returnTo?: string | null; intent?: SignupIntent | null; isNewUser?: boolean },
): Promise<string> {
  const twoFactorEnabled = await hasTwoFactor(user.id);
  await createSession(user.id, { isStaff: user.isStaff, pendingTwoFactor: twoFactorEnabled });
  await setLocaleCookie(user.locale);
  await clearAuthFlow();
  const destination = await postAuthDestination(user, opts);
  if (twoFactorEnabled) {
    await logSecurityEvent({ userId: user.id, type: "login_first_factor_succeeded", metadata: { method: opts.method } });
    return `/sign-in/two-factor?returnTo=${encodeURIComponent(destination)}`;
  }
  await recordSuccessfulLogin(user, opts.method);
  return destination;
}

/** Security log entry for a completed sign-in + alert when the device has not been seen before. */
export async function recordSuccessfulLogin(user: Pick<UserRow, "id">, method: AuthMethod): Promise<void> {
  const meta = await getRequestMeta().catch(() => null);
  const deviceHash = deviceFingerprint(meta?.userAgent);
  const [prior] = await db
    .select({ id: securityEvents.id })
    .from(securityEvents)
    .where(and(eq(securityEvents.userId, user.id), eq(securityEvents.type, "login_succeeded")))
    .limit(1);
  let knownDevice = true;
  if (prior && deviceHash) {
    const [seen] = await db
      .select({ id: securityEvents.id })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.userId, user.id),
          eq(securityEvents.type, "login_succeeded"),
          gt(securityEvents.occurredAt, new Date(Date.now() - 365 * DAY_MS)),
          sql`${securityEvents.metadata}->>'deviceHash' = ${deviceHash}`,
        ),
      )
      .limit(1);
    knownDevice = Boolean(seen);
  }
  await logSecurityEvent({ userId: user.id, type: "login_succeeded", metadata: { method, deviceHash } });
  if (prior && !knownDevice) {
    const device = describeDevice(meta?.userAgent);
    await logSecurityEvent({ userId: user.id, type: "new_device_sign_in", severity: "warning", metadata: { method, deviceHash, device: device.label } });
    await sendSecurityAlert([{ userId: user.id }], "new_sign_in", { device: device.label });
  }
}

// ---------------------------------------------------------------------------
// Account notifications (templates live in the notifications module)
// ---------------------------------------------------------------------------

/**
 * `data.kind` values sent with "account.security_alert". `data.summary` is an English fallback;
 * templates may localise by kind. Never include codes, tokens or passwords.
 */
export type SecurityAlertKind =
  | "new_sign_in"
  | "account_locked"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "recovery_code_used"
  | "recovery_codes_regenerated"
  | "email_changed"
  | "phone_changed"
  | "google_linked"
  | "google_unlinked"
  | "signup_attempt";

const ALERT_SUMMARY: Record<SecurityAlertKind, (data: Record<string, string | number>) => string> = {
  new_sign_in: (d) => `New sign-in to your account on ${d.device ?? "a new device"}.`,
  account_locked: () => "Sign-in to your account was paused after several failed attempts.",
  two_factor_enabled: () => "Two-factor authentication was turned on for your account.",
  two_factor_disabled: () => "Two-factor authentication was turned off for your account.",
  recovery_code_used: (d) => `A recovery code was used to sign in. ${d.remaining ?? 0} recovery codes are left.`,
  recovery_codes_regenerated: () => "New recovery codes were created. Your old recovery codes no longer work.",
  email_changed: () => "The email address on your account was changed.",
  phone_changed: () => "The mobile number on your account was changed.",
  google_linked: () => "Google sign-in was connected to your account.",
  google_unlinked: () => "Google sign-in was disconnected from your account.",
  signup_attempt: () =>
    "Someone tried to create a new account with your email address or mobile number. If this was you, sign in instead or reset your password.",
};

export async function sendSecurityAlert(
  recipients: NotificationRecipient[],
  kind: SecurityAlertKind,
  data: Record<string, string | number> = {},
  opts: { dedupeKey?: string } = {},
): Promise<void> {
  try {
    await notify({
      event: "account.security_alert",
      recipients,
      data: { ...data, kind, time: new Date().toISOString(), summary: ALERT_SUMMARY[kind](data) },
      link: "/account/security",
      dedupeKey: opts.dedupeKey,
    });
  } catch (error) {
    logger.error("Failed to queue security alert", { error, kind });
  }
}

export async function sendPasswordChangedNotice(user: Pick<UserRow, "id" | "displayName">, method: "change" | "set" | "reset"): Promise<void> {
  try {
    await notify({
      event: "account.password_changed",
      recipients: [{ userId: user.id }],
      data: { name: user.displayName, method, time: new Date().toISOString() },
      link: "/account/security",
    });
  } catch (error) {
    logger.error("Failed to queue password-changed notice", { error });
  }
}

export async function sendWelcome(user: Pick<UserRow, "id" | "displayName">, intent: SignupIntent | null, link: string): Promise<void> {
  try {
    await notify({ event: "account.welcome", recipients: [{ userId: user.id }], data: { name: user.displayName, intent: intent ?? "candidate" }, link });
  } catch (error) {
    logger.error("Failed to queue welcome notification", { error });
  }
}
