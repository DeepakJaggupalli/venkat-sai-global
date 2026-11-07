import "server-only";

import { eq, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { sessions, users } from "@/db/schema";
import { getLocale } from "@/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { audit, logSecurityEvent } from "@/modules/audit";
import { getSettings, isFeatureEnabled } from "@/modules/settings";

import { recordConsent } from "./consent";
import { AuthError } from "./errors";
import { newAuthFlow, readAuthFlow, setAuthFlow } from "./flow";
import {
  assertStrongPassword,
  cooldownSecondsFrom,
  emulateOtpCooldown,
  establishSession,
  findUserByContact,
  otpFailureError,
  postAuthDestination,
  sendSecurityAlert,
  sendWelcome,
  type UserRow,
} from "./login";
import { issueOtp, targetRateKey, verifyOtp } from "./otp";
import { hashPassword } from "./password";
import { sanitizeReturnTo } from "./redirects";
import type { SignUpInput } from "./schemas";
import { OTP_RESEND_COOLDOWN_SECONDS, type SignupIntent } from "./types";

/**
 * Registration: the account is created as `pending_verification`, consent is recorded in the
 * ledger, and a 6-digit code is sent to the email / phone. Verifying the code activates the
 * account and signs the person in.
 *
 * Re-registering an address that is still pending replaces the earlier, never-verified details
 * (including any password), so nobody can pre-claim someone else's address. Registering an address
 * that already belongs to an active account reveals nothing: the visitor sees the same next step
 * and the real owner is told about the attempt.
 */

export type ConsentVersions = { terms: string; privacy: string };

export async function currentPolicyVersions(): Promise<ConsentVersions> {
  const s = await getSettings(["privacy.terms_version", "privacy.policy_version"]);
  return { terms: s["privacy.terms_version"], privacy: s["privacy.policy_version"] };
}

/** Record the consents captured at sign-up (required terms + privacy, optional marketing choices). */
export async function recordSignupConsents(
  userId: string,
  input: {
    versions: ConsentVersions;
    marketing: { email: boolean; sms: boolean; whatsapp: boolean } | null;
    source: string;
    evidence: Record<string, unknown>;
  },
  tx: DbOrTx = db,
): Promise<void> {
  const base = { userId, source: input.source, evidence: input.evidence };
  await recordConsent({ ...base, purpose: "terms_of_service", granted: true, policyVersion: input.versions.terms }, tx);
  await recordConsent({ ...base, purpose: "privacy_notice", granted: true, policyVersion: input.versions.privacy }, tx);
  if (input.marketing) {
    await recordConsent({ ...base, purpose: "marketing_email", granted: input.marketing.email, policyVersion: input.versions.privacy }, tx);
    await recordConsent({ ...base, purpose: "marketing_sms", granted: input.marketing.sms, policyVersion: input.versions.privacy }, tx);
    await recordConsent({ ...base, purpose: "whatsapp_updates", granted: input.marketing.whatsapp, policyVersion: input.versions.privacy }, tx);
  }
}

export function signupIntentOf(user: Pick<UserRow, "preferences">): SignupIntent | null {
  const value = (user.preferences as Record<string, unknown> | null)?.signupIntent;
  return value === "candidate" || value === "employer" || value === "partner" || value === "institution" ? value : null;
}

/** Create (or restart) a pending account, send the code and store the /verify flow. */
export async function registerAccount(input: SignUpInput): Promise<void> {
  const meta = await getRequestMeta().catch(() => null);
  if (meta?.ipHash) {
    const perIp = await rateLimit(`signup:ip:${meta.ipHash}`, 10, 60 * 60);
    if (!perIp.allowed) throw new AuthError("too_many_attempts");
  }
  const perTarget = await rateLimit(`signup:target:${targetRateKey(input.contact.value)}`, 6, 60 * 60);
  if (!perTarget.allowed) throw new AuthError("too_many_attempts");

  const { contact } = input;
  const channel = contact.kind === "email" ? "email" : "sms";
  if (channel === "sms" && !(await isFeatureEnabled("auth.phone_otp"))) throw new AuthError("phone_signup_disabled", { field: "phone" });

  if (input.password) {
    await assertStrongPassword(input.password, { email: contact.kind === "email" ? contact.value : null, name: input.displayName }, "password");
  }
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const locale = await getLocale();
  const versions = await currentPolicyVersions();
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    // Serialise registrations for the same address.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`user-contact:${contact.value}`}, 0))`);
    const existing = await findUserByContact(contact, tx);
    if (existing && existing.status !== "pending_verification") return { kind: "existing" as const, user: existing };

    const details = {
      displayName: input.displayName,
      passwordHash,
      passwordChangedAt: passwordHash ? now : null,
      locale,
      signupSource: "web",
      failedLoginCount: 0,
      lockedUntil: null,
    };
    let user: UserRow | undefined;
    if (existing) {
      [user] = await tx
        .update(users)
        .set({ ...details, preferences: sql`${users.preferences} || ${JSON.stringify({ signupIntent: input.intent })}::jsonb` })
        .where(eq(users.id, existing.id))
        .returning();
      await tx.delete(sessions).where(eq(sessions.userId, existing.id));
    } else {
      [user] = await tx
        .insert(users)
        .values({
          ...details,
          email: contact.kind === "email" ? contact.value : null,
          phone: contact.kind === "phone" ? contact.value : null,
          status: "pending_verification",
          preferences: { signupIntent: input.intent },
        })
        .returning();
    }
    if (!user) throw new Error("User could not be saved");

    await recordSignupConsents(
      user.id,
      { versions, marketing: input.marketing, source: "signup", evidence: { method: "signup_form", intent: input.intent, channel } },
      tx,
    );
    await audit({
      action: existing ? "user.registration_restarted" : "user.registered",
      entityType: "user",
      entityId: user.id,
      actorUserId: user.id,
      actorType: "user",
      metadata: { intent: input.intent, channel, withPassword: Boolean(passwordHash) },
      tx,
    });
    return { kind: existing ? ("restarted" as const) : ("created" as const), user };
  });

  let userId: string | null = null;
  let resendAvailableAt = Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000;
  try {
    if (outcome.kind === "existing") {
      await logSecurityEvent({ userId: outcome.user.id, type: "signup_attempt_existing_account", metadata: { channel } });
      const hourBucket = Math.floor(Date.now() / 3_600_000);
      await sendSecurityAlert([{ userId: outcome.user.id }], "signup_attempt", {}, { dedupeKey: `signup-attempt:${outcome.user.id}:${hourBucket}` });
      resendAvailableAt = await emulateOtpCooldown("signup_otp", contact.value);
    } else {
      userId = outcome.user.id;
      const issued = await issueOtp({ purpose: "signup_otp", channel, target: contact.value, userId, locale });
      resendAvailableAt = issued.resendAvailableAt.getTime();
      await logSecurityEvent({ userId, type: "signup_started", metadata: { channel, intent: input.intent } });
    }
  } catch (error) {
    // A code was sent moments ago (double submit): it is still valid, continue to /verify.
    const seconds = cooldownSecondsFrom(error);
    if (seconds === null) throw error;
    resendAvailableAt = Date.now() + seconds * 1000;
  }

  await setAuthFlow(
    newAuthFlow({
      kind: "signup",
      purpose: "signup_otp",
      channel,
      target: contact.value,
      userId,
      intent: input.intent,
      returnTo: sanitizeReturnTo(input.returnTo),
      resendAvailableAt,
    }),
  );
}

/** Check the sign-up code, activate the account and sign in. Returns the next path. */
export async function completeSignupVerification(code: string): Promise<string> {
  const flow = await readAuthFlow();
  if (!flow || flow.kind !== "signup") throw new AuthError("flow_expired");
  if (!flow.userId) {
    // The address belongs to an existing account: behave exactly like a wrong code.
    await rateLimit(`otp:verify:${targetRateKey(flow.target)}`, 20, 15 * 60);
    throw new AuthError("otp_invalid", { field: "code" });
  }

  const result = await verifyOtp({ purpose: "signup_otp", target: flow.target, code, userId: flow.userId });
  if (!result.ok) throw otpFailureError(result.reason);

  const flowUserId = flow.userId;
  const activated = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, flowUserId)).limit(1).for("update");
    if (!user) throw new AuthError("flow_expired");
    if (user.status === "suspended" || user.status === "closed") throw new AuthError("account_unavailable");
    const contactMatches = flow.channel === "email" ? user.email === flow.target : user.phone === flow.target;
    if (!contactMatches) throw new AuthError("flow_expired");

    const verifiedAt = new Date();
    const [updated] = await tx
      .update(users)
      .set({
        status: "active",
        ...(flow.channel === "email" ? { emailVerifiedAt: user.emailVerifiedAt ?? verifiedAt } : { phoneVerifiedAt: user.phoneVerifiedAt ?? verifiedAt }),
      })
      .where(eq(users.id, user.id))
      .returning();
    const wasPending = user.status === "pending_verification";
    if (wasPending) {
      await audit({
        action: "user.activated",
        entityType: "user",
        entityId: user.id,
        actorUserId: user.id,
        actorType: "user",
        metadata: { channel: flow.channel, via: "signup_otp" },
        tx,
      });
    }
    return { user: updated ?? user, wasPending };
  });

  await logSecurityEvent({ userId: flowUserId, type: flow.channel === "email" ? "email_verified" : "phone_verified", metadata: { purpose: "signup_otp" } });
  if (activated.wasPending) {
    await logSecurityEvent({ userId: flowUserId, type: "signup_completed", metadata: { channel: flow.channel, intent: flow.intent } });
    const destination = await postAuthDestination(activated.user, { returnTo: flow.returnTo, intent: flow.intent, isNewUser: true });
    await sendWelcome(activated.user, flow.intent, destination);
  }
  return establishSession(activated.user, { method: "signup_otp", returnTo: flow.returnTo, intent: flow.intent, isNewUser: activated.wasPending });
}
