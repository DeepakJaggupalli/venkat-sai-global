import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { hmacToken } from "@/lib/crypto";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { audit, logSecurityEvent } from "@/modules/audit";
import { getSettings, isFeatureEnabled } from "@/modules/settings";

import { AuthError } from "./errors";
import { AUTH_FLOW_TTL_MS, newAuthFlow, readAuthFlow, setAuthFlow, type AuthFlow } from "./flow";
import {
  cooldownSecondsFrom,
  emulateOtpCooldown,
  establishSession,
  findUserByContact,
  otpFailureError,
  postAuthDestination,
  recordSuccessfulLogin,
  sendSecurityAlert,
  sendWelcome,
  type UserRow,
} from "./login";
import { issueOtp, targetRateKey, verifyOtp } from "./otp";
import { verifyPassword, verifyPasswordAgainstDummy } from "./password";
import { sanitizeReturnTo } from "./redirects";
import { signupIntentOf } from "./registration";
import { getCurrentSession, markSessionTwoFactorVerified, refreshSessionCookieExpiry } from "./session";
import { verifySecondFactor } from "./totp";
import type { Contact, SignupIntent } from "./types";

/**
 * Sign-in with password, sign-in with a one-time code, and the TOTP challenge.
 * Error messages never reveal whether an account exists. Failed passwords lock the account for
 * `security.lockout_minutes` after `security.max_failed_logins` attempts; identifiers that do not
 * exist hit the same limit through a rate-limit bucket, so both behave identically.
 */

const LOGIN_LIMIT_PER_IDENTIFIER = { limit: 10, windowSeconds: 15 * 60 };
const LOGIN_LIMIT_PER_IP = { limit: 30, windowSeconds: 15 * 60 };

function identifierKey(contact: Contact): string {
  return hmacToken(contact.value, "login-identifier").slice(0, 32);
}

type SignInTarget = { returnTo?: string | null; intent?: SignupIntent | null };

async function enforceLoginRateLimits(contact: Contact): Promise<void> {
  const meta = await getRequestMeta().catch(() => null);
  const perIdentifier = await rateLimit(`login:id:${identifierKey(contact)}`, LOGIN_LIMIT_PER_IDENTIFIER.limit, LOGIN_LIMIT_PER_IDENTIFIER.windowSeconds);
  const perIp = meta?.ipHash ? await rateLimit(`login:ip:${meta.ipHash}`, LOGIN_LIMIT_PER_IP.limit, LOGIN_LIMIT_PER_IP.windowSeconds) : null;
  if (!perIdentifier.allowed || (perIp && !perIp.allowed)) {
    await logSecurityEvent({ type: "login_rate_limited", severity: "warning", metadata: { kind: contact.kind } });
    throw new AuthError("too_many_attempts");
  }
}

function minutesUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60_000));
}

/** Count a failure for an identifier without an account (or without a password). */
async function failUnknownIdentifier(contact: Contact, maxFailed: number, lockoutMinutes: number): Promise<never> {
  const bucket = await rateLimit(`login:fail:${identifierKey(contact)}`, maxFailed, lockoutMinutes * 60);
  if (!bucket.allowed || bucket.count >= maxFailed) throw new AuthError("account_locked", { vars: { minutes: minutesUntil(bucket.resetAt) } });
  throw new AuthError("invalid_credentials");
}

export async function signInWithPassword(input: { identifier: Contact; password: string } & SignInTarget): Promise<{ redirectTo: string }> {
  const { identifier } = input;
  await enforceLoginRateLimits(identifier);
  const settings = await getSettings(["security.max_failed_logins", "security.lockout_minutes"]);
  const maxFailed = Math.max(1, settings["security.max_failed_logins"]);
  const lockoutMinutes = Math.max(1, settings["security.lockout_minutes"]);

  const user = await findUserByContact(identifier);
  if (!user) {
    await verifyPasswordAgainstDummy(input.password);
    await logSecurityEvent({ type: "login_failed", severity: "warning", metadata: { method: "password", reason: "unknown_identifier" } });
    return failUnknownIdentifier(identifier, maxFailed, lockoutMinutes);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await logSecurityEvent({ userId: user.id, type: "login_blocked_locked", severity: "warning", metadata: { method: "password" } });
    throw new AuthError("account_locked", { vars: { minutes: minutesUntil(user.lockedUntil) } });
  }

  if (!user.passwordHash) {
    await verifyPasswordAgainstDummy(input.password);
    await logSecurityEvent({ userId: user.id, type: "login_failed", severity: "warning", metadata: { method: "password", reason: "no_password" } });
    return failUnknownIdentifier(identifier, maxFailed, lockoutMinutes);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    const [counters] = await db
      .update(users)
      .set({
        failedLoginCount: sql`${users.failedLoginCount} + 1`,
        lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${maxFailed}::int then now() + make_interval(mins => ${lockoutMinutes}::int) else ${users.lockedUntil} end`,
      })
      .where(eq(users.id, user.id))
      .returning({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil });
    const locked = Boolean(counters?.lockedUntil && counters.lockedUntil.getTime() > Date.now());
    await logSecurityEvent({ userId: user.id, type: "login_failed", severity: "warning", metadata: { method: "password", failedCount: counters?.failedLoginCount ?? null } });
    if (locked && counters?.lockedUntil) {
      await logSecurityEvent({ userId: user.id, type: "account_locked", severity: "warning", metadata: { minutes: lockoutMinutes } });
      await sendSecurityAlert([{ userId: user.id }], "account_locked", { minutes: lockoutMinutes });
      // Start a new count once the lock has expired.
      await db.update(users).set({ failedLoginCount: 0 }).where(eq(users.id, user.id));
      throw new AuthError("account_locked", { vars: { minutes: minutesUntil(counters.lockedUntil) } });
    }
    throw new AuthError("invalid_credentials");
  }

  // The password is right: from here on it is safe to explain the account state.
  if (user.status === "suspended" || user.status === "closed") {
    await logSecurityEvent({ userId: user.id, type: "login_blocked_status", severity: "warning", metadata: { status: user.status } });
    throw new AuthError("account_unavailable");
  }
  await resetRateLimit(`login:fail:${identifierKey(identifier)}`);

  if (user.status === "pending_verification") {
    return { redirectTo: await resumePendingSignup(user, identifier, input) };
  }
  return { redirectTo: await establishSession(user, { method: "password", returnTo: input.returnTo, intent: input.intent }) };
}

/** A registered-but-unverified account signed in with the right password: send a fresh sign-up code. */
async function resumePendingSignup(user: UserRow, identifier: Contact, target: SignInTarget): Promise<string> {
  const channel = identifier.kind === "email" ? "email" : "sms";
  let resendAvailableAt: number;
  try {
    const issued = await issueOtp({ purpose: "signup_otp", channel, target: identifier.value, userId: user.id, locale: user.locale });
    resendAvailableAt = issued.resendAvailableAt.getTime();
  } catch (error) {
    const seconds = cooldownSecondsFrom(error);
    if (seconds === null) throw error;
    resendAvailableAt = Date.now() + seconds * 1000;
  }
  await setAuthFlow(
    newAuthFlow({
      kind: "signup",
      purpose: "signup_otp",
      channel,
      target: identifier.value,
      userId: user.id,
      intent: target.intent ?? signupIntentOf(user),
      returnTo: sanitizeReturnTo(target.returnTo),
      resendAvailableAt,
    }),
  );
  return "/verify";
}

// ---------------------------------------------------------------------------
// One-time code sign-in
// ---------------------------------------------------------------------------

/** Send a sign-in code (if the account exists) and store the /verify flow. */
export async function requestLoginOtp(input: { identifier: Contact } & SignInTarget): Promise<void> {
  const { identifier } = input;
  const channel = identifier.kind === "email" ? "email" : "sms";
  const flagEnabled = await isFeatureEnabled(channel === "email" ? "auth.email_otp" : "auth.phone_otp");
  if (!flagEnabled) throw new AuthError(channel === "email" ? "email_otp_disabled" : "phone_otp_disabled", { field: "identifier" });

  const meta = await getRequestMeta().catch(() => null);
  if (meta?.ipHash) {
    const perIp = await rateLimit(`otp:login-ip:${meta.ipHash}`, 20, 60 * 60);
    if (!perIp.allowed) throw new AuthError("otp_rate_limited");
  }

  const user = await findUserByContact(identifier);
  const eligible = user && (user.status === "active" || user.status === "pending_verification");
  let resendAvailableAt: number;
  if (eligible) {
    const issued = await issueOtp({ purpose: "login_otp", channel, target: identifier.value, userId: user.id, locale: user.locale });
    resendAvailableAt = issued.resendAvailableAt.getTime();
  } else {
    resendAvailableAt = await emulateOtpCooldown("login_otp", identifier.value);
  }
  await logSecurityEvent({ userId: user?.id ?? null, type: "login_otp_requested", metadata: { channel, accountFound: Boolean(eligible) } });

  await setAuthFlow(
    newAuthFlow({
      kind: "login",
      purpose: "login_otp",
      channel,
      target: identifier.value,
      userId: eligible ? user.id : null,
      intent: input.intent ?? null,
      returnTo: sanitizeReturnTo(input.returnTo),
      resendAvailableAt,
    }),
  );
}

/** Verify the sign-in code and create the session. Returns the next path. */
export async function completeLoginOtp(code: string): Promise<string> {
  const flow = await readAuthFlow();
  if (!flow || flow.kind !== "login") throw new AuthError("flow_expired");
  if (!flow.userId) {
    await rateLimit(`otp:verify:${targetRateKey(flow.target)}`, 20, 15 * 60);
    await logSecurityEvent({ type: "login_failed", severity: "warning", metadata: { method: "otp", reason: "unknown_identifier" } });
    throw new AuthError("otp_invalid", { field: "code" });
  }

  const result = await verifyOtp({ purpose: "login_otp", target: flow.target, code, userId: flow.userId });
  if (!result.ok) {
    await logSecurityEvent({ userId: flow.userId, type: "login_failed", severity: "warning", metadata: { method: "otp", reason: result.reason } });
    throw otpFailureError(result.reason);
  }

  const flowUserId = flow.userId;
  const outcome = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, flowUserId)).limit(1).for("update");
    if (!user) throw new AuthError("flow_expired");
    if (user.status === "suspended" || user.status === "closed") throw new AuthError("account_unavailable");

    const now = new Date();
    const wasPending = user.status === "pending_verification";
    const matchesEmail = flow.channel === "email" && user.email === flow.target;
    const matchesPhone = flow.channel === "sms" && user.phone === flow.target;
    if (!matchesEmail && !matchesPhone) throw new AuthError("flow_expired");

    const [updated] = await tx
      .update(users)
      .set({
        // A code proves the visitor controls this address.
        ...(matchesEmail && !user.emailVerifiedAt ? { emailVerifiedAt: now } : {}),
        ...(matchesPhone && !user.phoneVerifiedAt ? { phoneVerifiedAt: now } : {}),
        // Claiming a never-verified registration: drop the password chosen during that
        // unverified sign-up (it may not have been set by the owner of this address).
        ...(wasPending ? { status: "active" as const, passwordHash: null, passwordChangedAt: null } : {}),
      })
      .where(eq(users.id, user.id))
      .returning();
    if (wasPending) {
      await audit({
        action: "user.activated",
        entityType: "user",
        entityId: user.id,
        actorUserId: user.id,
        actorType: "user",
        metadata: { via: "login_otp", passwordCleared: Boolean(user.passwordHash) },
        tx,
      });
    }
    return { user: updated ?? user, wasPending, newlyVerified: (matchesEmail && !user.emailVerifiedAt) || (matchesPhone && !user.phoneVerifiedAt) };
  });

  if (outcome.newlyVerified) {
    await logSecurityEvent({ userId: flowUserId, type: flow.channel === "email" ? "email_verified" : "phone_verified", metadata: { purpose: "login_otp" } });
  }
  if (outcome.wasPending) {
    const intent = flow.intent ?? signupIntentOf(outcome.user);
    const destination = await postAuthDestination(outcome.user, { returnTo: flow.returnTo, intent, isNewUser: true });
    await sendWelcome(outcome.user, intent, destination);
    return establishSession(outcome.user, { method: "otp", returnTo: flow.returnTo, intent, isNewUser: true });
  }
  return establishSession(outcome.user, { method: "otp", returnTo: flow.returnTo, intent: flow.intent });
}

/** "Resend code" on /verify and /reset-password. Returns when the next resend is allowed. */
export async function resendFlowCode(expectedKinds: AuthFlow["kind"][]): Promise<{ resendAvailableAt: number }> {
  const flow = await readAuthFlow();
  if (!flow || !expectedKinds.includes(flow.kind)) throw new AuthError("flow_expired");

  let resendAvailableAt: number;
  if (!flow.userId) {
    resendAvailableAt = await emulateOtpCooldown(flow.purpose, flow.target);
  } else {
    const [user] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, flow.userId)).limit(1);
    const issued = await issueOtp({ purpose: flow.purpose, channel: flow.channel, target: flow.target, userId: flow.userId, locale: user?.locale });
    resendAvailableAt = issued.resendAvailableAt.getTime();
  }
  await setAuthFlow({ ...flow, resendAvailableAt, expiresAt: Math.max(flow.expiresAt, Date.now() + AUTH_FLOW_TTL_MS) });
  return { resendAvailableAt };
}

// ---------------------------------------------------------------------------
// TOTP challenge (/sign-in/two-factor)
// ---------------------------------------------------------------------------

export async function completeTwoFactorChallenge(input: { method: "totp" | "recovery"; code: string; returnTo?: string | null }): Promise<string> {
  const current = await getCurrentSession();
  if (!current) throw new AuthError("session_expired");
  const { user, session } = current;
  const returnTo = sanitizeReturnTo(input.returnTo);
  const destination = async (): Promise<string> => {
    if (returnTo) return returnTo;
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    return row ? postAuthDestination(row, {}) : "/";
  };
  if (!current.needsTwoFactor) return destination();

  const limiter = await rateLimit(`2fa:challenge:${user.id}`, 10, 15 * 60);
  if (!limiter.allowed) {
    await logSecurityEvent({ userId: user.id, type: "two_factor_rate_limited", severity: "warning" });
    throw new AuthError("too_many_attempts");
  }

  const result = await verifySecondFactor(user.id, { code: input.code, method: input.method });
  if (!result.ok) {
    await logSecurityEvent({ userId: user.id, type: "two_factor_failed", severity: "warning", metadata: { method: input.method } });
    throw new AuthError("two_factor_invalid", { field: input.method === "totp" ? "code" : "recoveryCode" });
  }

  const expiresAt = await markSessionTwoFactorVerified(session.id, { isStaff: user.isStaff });
  if (expiresAt) await refreshSessionCookieExpiry(expiresAt);
  await logSecurityEvent({ userId: user.id, type: "two_factor_succeeded", metadata: { method: result.method } });
  if (result.method === "recovery") {
    await logSecurityEvent({ userId: user.id, type: "recovery_code_used", severity: "warning", metadata: { remaining: result.recoveryCodesRemaining } });
    await sendSecurityAlert([{ userId: user.id }], "recovery_code_used", { remaining: result.recoveryCodesRemaining });
  }
  await recordSuccessfulLogin(user, "two_factor");
  return destination();
}
