import "server-only";

import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { users } from "@/db/schema";
import { absoluteUrl } from "@/lib/env";
import { maskEmail } from "@/lib/format";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { audit, logSecurityEvent } from "@/modules/audit";
import { sendEmail } from "@/modules/messaging";
import { isFeatureEnabled } from "@/modules/settings";

import { AuthError } from "./errors";
import { clearAuthFlow, newAuthFlow, readAuthFlow, setAuthFlow } from "./flow";
import {
  assertStrongPassword,
  cooldownSecondsFrom,
  emulateOtpCooldown,
  findUserByContact,
  findUserById,
  otpFailureError,
  sendPasswordChangedNotice,
  type UserRow,
} from "./login";
import { buildPasswordResetEmail, resolveLocale } from "./messages";
import { consumeLinkToken, invalidateActiveTokens, issueLinkToken, issueOtp, peekLinkToken, targetRateKey, verifyOtp } from "./otp";
import { hashPassword } from "./password";
import { invalidateUserSessions } from "./session";
import { PASSWORD_RESET_LINK_TTL_MINUTES, type Contact } from "./types";

/**
 * Password reset: an e-mailed single-use link (30 minutes) or an SMS code (10 minutes).
 * Requests always look successful (no account enumeration). A completed reset signs the
 * account out everywhere and sends a "password changed" notice.
 */

export async function requestPasswordReset(identifier: Contact): Promise<{ channel: "email" | "sms" }> {
  const meta = await getRequestMeta().catch(() => null);
  if (meta?.ipHash) {
    const perIp = await rateLimit(`reset:ip:${meta.ipHash}`, 10, 60 * 60);
    if (!perIp.allowed) throw new AuthError("too_many_attempts");
  }

  if (identifier.kind === "phone" && !(await isFeatureEnabled("auth.phone_otp"))) {
    throw new AuthError("sms_reset_disabled", { field: "identifier" });
  }
  const perTarget = await rateLimit(`reset:target:${targetRateKey(identifier.value)}`, 3, 15 * 60);
  if (!perTarget.allowed) throw new AuthError("too_many_attempts");

  const user = await findUserByContact(identifier);
  const eligible = user?.status === "active" ? user : null;
  await logSecurityEvent({
    userId: user?.id ?? null,
    type: "password_reset_requested",
    metadata: { channel: identifier.kind === "email" ? "email" : "sms", accountFound: Boolean(eligible) },
  });

  if (identifier.kind === "email") {
    if (eligible) await sendResetLink(eligible, identifier.value);
    return { channel: "email" };
  }

  let resendAvailableAt: number;
  try {
    if (eligible) {
      const issued = await issueOtp({ purpose: "password_reset", channel: "sms", target: identifier.value, userId: eligible.id, locale: eligible.locale });
      resendAvailableAt = issued.resendAvailableAt.getTime();
    } else {
      resendAvailableAt = await emulateOtpCooldown("password_reset", identifier.value);
    }
  } catch (error) {
    const seconds = cooldownSecondsFrom(error);
    if (seconds === null) throw error;
    resendAvailableAt = Date.now() + seconds * 1000;
  }
  await setAuthFlow(
    newAuthFlow({
      kind: "reset",
      purpose: "password_reset",
      channel: "sms",
      target: identifier.value,
      userId: eligible?.id ?? null,
      intent: null,
      returnTo: null,
      resendAvailableAt,
    }),
  );
  return { channel: "sms" };
}

async function sendResetLink(user: UserRow, email: string): Promise<void> {
  const { token } = await issueLinkToken({ purpose: "password_reset", target: email, userId: user.id, ttlMinutes: PASSWORD_RESET_LINK_TTL_MINUTES });
  const message = buildPasswordResetEmail({
    to: email,
    name: user.displayName,
    link: absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`),
    minutes: PASSWORD_RESET_LINK_TTL_MINUTES,
    locale: resolveLocale(user.locale),
  });
  try {
    const result = await sendEmail(message);
    if (!result.ok) logger.error("Password reset e-mail could not be sent", { provider: result.provider, error: result.error });
  } catch (error) {
    // Never reveal the failure to the visitor (it would confirm the account exists); ops see the log.
    logger.error("Password reset e-mail could not be sent", { error });
  }
}

export type ResetTokenStatus = { valid: true; maskedEmail: string } | { valid: false; reason: "invalid" | "expired" | "used" };

/** For /reset-password?token=…: is the link usable? (does not consume it) */
export async function inspectPasswordResetToken(token: string): Promise<ResetTokenStatus> {
  const result = await peekLinkToken(token, "password_reset");
  if (!result.ok) return { valid: false, reason: result.reason };
  return { valid: true, maskedEmail: maskEmail(result.target) };
}

async function applyNewPassword(
  tx: DbOrTx,
  user: UserRow,
  passwordHash: string,
  verified: { email?: boolean; phone?: boolean },
  via: "email_link" | "sms_code",
): Promise<void> {
  const now = new Date();
  await tx
    .update(users)
    .set({
      passwordHash,
      passwordChangedAt: now,
      failedLoginCount: 0,
      lockedUntil: null,
      ...(verified.email && !user.emailVerifiedAt ? { emailVerifiedAt: now } : {}),
      ...(verified.phone && !user.phoneVerifiedAt ? { phoneVerifiedAt: now } : {}),
    })
    .where(eq(users.id, user.id));
  await invalidateActiveTokens({ purpose: "password_reset", userId: user.id }, tx);
  await audit({ action: "user.password_reset", entityType: "user", entityId: user.id, actorUserId: user.id, actorType: "user", metadata: { via }, tx });
}

async function afterReset(user: UserRow, via: "email_link" | "sms_code"): Promise<void> {
  await invalidateUserSessions(user.id);
  await logSecurityEvent({ userId: user.id, type: "password_reset", severity: "warning", metadata: { via } });
  await sendPasswordChangedNotice(user, "reset");
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const peek = await peekLinkToken(token, "password_reset");
  if (!peek.ok) throw new AuthError(peek.reason === "expired" ? "reset_link_expired" : "reset_link_invalid");
  const user = peek.userId ? await findUserById(peek.userId) : null;
  if (!user || user.status !== "active") throw new AuthError("reset_link_invalid");

  // Check the policy before using up the link.
  await assertStrongPassword(newPassword, { email: user.email, name: user.displayName });
  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    const consumed = await consumeLinkToken(token, "password_reset", { tx });
    if (!consumed.ok || consumed.userId !== user.id) {
      throw new AuthError(consumed.ok || consumed.reason !== "expired" ? "reset_link_invalid" : "reset_link_expired");
    }
    await applyNewPassword(tx, user, passwordHash, { email: user.email === consumed.target }, "email_link");
  });
  await afterReset(user, "email_link");
}

export async function resetPasswordWithCode(code: string, newPassword: string): Promise<void> {
  const flow = await readAuthFlow();
  if (!flow || flow.kind !== "reset") throw new AuthError("flow_expired");
  if (!flow.userId) {
    await rateLimit(`otp:verify:${targetRateKey(flow.target)}`, 20, 15 * 60);
    throw new AuthError("otp_invalid", { field: "code" });
  }
  const user = await findUserById(flow.userId);
  if (!user || user.status !== "active") throw new AuthError("account_unavailable");

  await assertStrongPassword(newPassword, { email: user.email, name: user.displayName });
  const result = await verifyOtp({ purpose: "password_reset", target: flow.target, code, userId: user.id });
  if (!result.ok) throw otpFailureError(result.reason);
  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await applyNewPassword(tx, user, passwordHash, { phone: user.phone === flow.target }, "sms_code");
  });
  await clearAuthFlow();
  await afterReset(user, "sms_code");
}
