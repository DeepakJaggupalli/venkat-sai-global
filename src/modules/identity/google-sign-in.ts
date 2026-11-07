import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { oauthAccounts, sessions, users } from "@/db/schema";
import { getLocale } from "@/i18n/server";
import { absoluteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { audit, logSecurityEvent } from "@/modules/audit";
import { isFeatureEnabled } from "@/modules/settings";

import { AuthError, type AuthErrorCode } from "./errors";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  decodeJwtPayload,
  exchangeGoogleAuthorizationCode,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_TTL_MS,
  GOOGLE_START_PATH,
  googleCredentials,
  isGoogleSignInEnabled,
  sealGoogleOAuthState,
  statesMatch,
  unsealGoogleOAuthState,
  validateGoogleIdTokenClaims,
  type GoogleConsentMode,
  type GoogleIdentity,
  type GoogleOAuthState,
} from "./google";
import { establishSession, findUserByContact, findUserById, postAuthDestination, sendSecurityAlert, sendWelcome, type UserRow } from "./login";
import { sanitizeReturnTo } from "./redirects";
import { currentPolicyVersions, recordSignupConsents, signupIntentOf } from "./registration";
import { getCurrentUser, type SessionUser } from "./session";
import type { ConnectedAccount, SignupIntent } from "./types";

/**
 * Google sign-in flow and account-linking rules (account-takeover safe):
 *  1. A Google account already linked → sign in to that user.
 *  2. Otherwise the Google email must be verified by Google, and:
 *     - an ACTIVE user whose email matches AND is verified → link + sign in;
 *     - a never-verified registration (pending_verification) holding the email → it is replaced
 *       (credentials wiped) because Google proves who owns the address;
 *     - an active user whose email is NOT verified → refused (linking could hand that account to
 *       someone else; a duplicate cannot be created because emails are unique) — the visitor is
 *       told to verify the email with a one-time code first;
 *     - no user → a new active user with a verified email.
 */

export type GoogleStartParams = {
  intent: SignupIntent | null;
  returnTo: string | null;
  consent: GoogleConsentMode;
  marketing: { email: boolean; sms: boolean; whatsapp: boolean };
  mode: "signin" | "link";
};

function oauthCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // Sent only to /auth/google and /auth/google/callback.
    path: GOOGLE_START_PATH,
    maxAge: maxAgeSeconds,
  };
}

function signInErrorPath(code: AuthErrorCode, returnTo: string | null): string {
  const params = new URLSearchParams({ error: code });
  if (returnTo) params.set("returnTo", returnTo);
  return `/sign-in?${params.toString()}`;
}

/** GET /auth/google: store state/nonce/PKCE in a cookie and return the Google authorization URL. */
export async function startGoogleSignIn(params: GoogleStartParams): Promise<string> {
  const returnTo = sanitizeReturnTo(params.returnTo);
  const credentials = googleCredentials();
  if (!credentials || !(await isGoogleSignInEnabled())) {
    return params.mode === "link" ? "/account/security?google=unavailable" : signInErrorPath("google_unavailable", returnTo);
  }
  const meta = await getRequestMeta().catch(() => null);
  if (meta?.ipHash) {
    const rl = await rateLimit(`oauth:start:${meta.ipHash}`, 30, 10 * 60);
    if (!rl.allowed) return params.mode === "link" ? "/account/security?google=failed" : signInErrorPath("too_many_attempts", returnTo);
  }

  let linkUserId: string | null = null;
  if (params.mode === "link") {
    const user = await getCurrentUser();
    if (!user) return `/sign-in?returnTo=${encodeURIComponent("/account/security")}`;
    linkUserId = user.id;
  }

  const { data, challenge } = createGoogleOAuthState({
    intent: params.intent,
    returnTo,
    consent: params.consent,
    marketing: params.marketing,
    mode: params.mode,
    linkUserId,
  });
  const jar = await cookies();
  jar.set(GOOGLE_OAUTH_COOKIE, sealGoogleOAuthState(data), oauthCookieOptions(Math.floor(GOOGLE_OAUTH_TTL_MS / 1000)));
  return buildGoogleAuthorizationUrl({
    clientId: credentials.clientId,
    redirectUri: absoluteUrl(GOOGLE_CALLBACK_PATH),
    state: data.state,
    nonce: data.nonce,
    codeChallenge: challenge,
  });
}

/** GET /auth/google/callback: validate, exchange, resolve the account and sign in. Returns the next path. */
export async function completeGoogleSignIn(query: { code: string | null; state: string | null; error: string | null }): Promise<string> {
  const jar = await cookies();
  const stored = unsealGoogleOAuthState(jar.get(GOOGLE_OAUTH_COOKIE)?.value);
  jar.delete({ name: GOOGLE_OAUTH_COOKIE, ...oauthCookieOptions(0) });

  if (!stored) {
    await logSecurityEvent({ type: "oauth_failed", severity: "warning", metadata: { provider: "google", reason: "missing_state" } });
    return signInErrorPath("google_failed", null);
  }
  const fail = (code: AuthErrorCode): string =>
    stored.mode === "link" ? `/account/security?google=${code === "google_already_linked" ? "already_linked" : "failed"}` : signInErrorPath(code, stored.returnTo);

  if (query.error) {
    await logSecurityEvent({ userId: stored.linkUserId, type: "oauth_cancelled", metadata: { provider: "google", error: query.error.slice(0, 64) } });
    return fail(query.error === "access_denied" ? "google_cancelled" : "google_failed");
  }
  if (!statesMatch(stored.state, query.state)) {
    await logSecurityEvent({ userId: stored.linkUserId, type: "oauth_failed", severity: "warning", metadata: { provider: "google", reason: "state_mismatch" } });
    return fail("google_failed");
  }
  const credentials = googleCredentials();
  if (!credentials || !(await isGoogleSignInEnabled())) return fail("google_unavailable");
  if (!query.code || query.code.length > 2048) return fail("google_failed");

  let identity: GoogleIdentity;
  try {
    const { idToken } = await exchangeGoogleAuthorizationCode({ code: query.code, verifier: stored.verifier, redirectUri: absoluteUrl(GOOGLE_CALLBACK_PATH) });
    const check = validateGoogleIdTokenClaims(decodeJwtPayload(idToken), { clientId: credentials.clientId, nonce: stored.nonce });
    if (!check.ok) {
      await logSecurityEvent({ userId: stored.linkUserId, type: "oauth_failed", severity: "warning", metadata: { provider: "google", reason: check.reason } });
      return fail(check.reason === "email_unverified" ? "google_email_unverified" : "google_failed");
    }
    identity = check.identity;
  } catch (error) {
    logger.warn("Google token exchange failed", { error });
    await logSecurityEvent({ userId: stored.linkUserId, type: "oauth_failed", severity: "warning", metadata: { provider: "google", reason: "exchange" } });
    return fail("google_failed");
  }

  if (stored.mode === "link") {
    const outcome = await linkGoogleToSignedInUser(stored, identity);
    return outcome === "linked" ? "/account/security?google=linked" : fail(outcome);
  }

  const resolution = await resolveGoogleAccount(identity, stored);
  if (!resolution.ok) {
    await logSecurityEvent({ type: "oauth_failed", severity: "warning", metadata: { provider: "google", reason: resolution.code } });
    return fail(resolution.code);
  }
  const { user, created, linked } = resolution;
  if (created) {
    await logSecurityEvent({ userId: user.id, type: "signup_completed", metadata: { via: "google", intent: stored.intent } });
    const destination = await postAuthDestination(user, { returnTo: stored.returnTo, intent: stored.intent, isNewUser: true });
    await sendWelcome(user, stored.intent, destination);
  }
  if (linked) {
    await logSecurityEvent({ userId: user.id, type: "oauth_linked", severity: "warning", metadata: { provider: "google" } });
    await sendSecurityAlert([{ userId: user.id }], "google_linked");
  }
  await logSecurityEvent({ userId: user.id, type: "oauth_login", metadata: { provider: "google" } });
  return establishSession(user, {
    method: "google",
    returnTo: stored.returnTo,
    intent: stored.intent ?? (created ? null : signupIntentOf(user)),
    isNewUser: created,
  });
}

type Resolution = { ok: true; user: UserRow; created: boolean; linked: boolean } | { ok: false; code: "account_unavailable" | "google_email_conflict" };

function displayNameFrom(identity: GoogleIdentity): string {
  const candidates = [identity.name, identity.givenName, identity.email.split("@")[0] ?? ""];
  for (const candidate of candidates) {
    const clean = (candidate ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (clean.length >= 2) return clean;
  }
  return "Member";
}

async function resolveGoogleAccount(identity: GoogleIdentity, stored: GoogleOAuthState): Promise<Resolution> {
  const [link] = await db
    .select({ userId: oauthAccounts.userId, email: oauthAccounts.email })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, identity.sub)))
    .limit(1);
  if (link) {
    const user = await findUserById(link.userId);
    if (!user || user.status === "suspended" || user.status === "closed" || user.status === "pending_verification") {
      return { ok: false, code: "account_unavailable" };
    }
    if (link.email !== identity.email) {
      await db
        .update(oauthAccounts)
        .set({ email: identity.email })
        .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, identity.sub)));
    }
    return { ok: true, user, created: false, linked: false };
  }

  const locale = await getLocale();
  const versions = await currentPolicyVersions();
  const consentEvidence = { method: stored.consent === "checkbox" ? "signup_form_checkbox" : "notice_with_google_button", intent: stored.intent, provider: "google" };
  const marketing = stored.consent === "checkbox" ? stored.marketing : null;

  return db.transaction(async (tx): Promise<Resolution> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`user-contact:${identity.email}`}, 0))`);
    const existing = await findUserByContact({ kind: "email", value: identity.email }, tx);
    const now = new Date();

    if (existing) {
      if (existing.status === "suspended" || existing.status === "closed") return { ok: false, code: "account_unavailable" };

      if (existing.status === "active" && existing.emailVerifiedAt) {
        await tx
          .insert(oauthAccounts)
          .values({ userId: existing.id, provider: "google", providerAccountId: identity.sub, email: identity.email })
          .onConflictDoNothing();
        await audit({ action: "user.oauth_linked", entityType: "user", entityId: existing.id, actorUserId: existing.id, actorType: "user", metadata: { provider: "google", via: "verified_email_match" }, tx });
        return { ok: true, user: existing, created: false, linked: true };
      }

      if (existing.status === "pending_verification") {
        const [replaced] = await tx
          .update(users)
          .set({
            status: "active",
            emailVerifiedAt: now,
            passwordHash: null,
            passwordChangedAt: null,
            displayName: displayNameFrom(identity),
            phone: existing.phoneVerifiedAt ? existing.phone : null,
            signupSource: "google",
            locale,
            failedLoginCount: 0,
            lockedUntil: null,
            preferences: { signupIntent: stored.intent },
          })
          .where(eq(users.id, existing.id))
          .returning();
        await tx.delete(sessions).where(eq(sessions.userId, existing.id));
        await tx.insert(oauthAccounts).values({ userId: existing.id, provider: "google", providerAccountId: identity.sub, email: identity.email });
        await recordSignupConsents(existing.id, { versions, marketing, source: "signup_google", evidence: consentEvidence }, tx);
        await audit({ action: "user.registered", entityType: "user", entityId: existing.id, actorUserId: existing.id, actorType: "user", metadata: { via: "google", replacedUnverifiedRegistration: true }, tx });
        return { ok: true, user: replaced ?? existing, created: true, linked: false };
      }

      return { ok: false, code: "google_email_conflict" };
    }

    const [created] = await tx
      .insert(users)
      .values({
        email: identity.email,
        emailVerifiedAt: now,
        displayName: displayNameFrom(identity),
        status: "active",
        locale,
        signupSource: "google",
        preferences: { signupIntent: stored.intent },
      })
      .returning();
    if (!created) throw new Error("User could not be created");
    await tx.insert(oauthAccounts).values({ userId: created.id, provider: "google", providerAccountId: identity.sub, email: identity.email });
    await recordSignupConsents(created.id, { versions, marketing, source: "signup_google", evidence: consentEvidence }, tx);
    await audit({ action: "user.registered", entityType: "user", entityId: created.id, actorUserId: created.id, actorType: "user", metadata: { via: "google", intent: stored.intent }, tx });
    return { ok: true, user: created, created: true, linked: false };
  });
}

async function linkGoogleToSignedInUser(stored: GoogleOAuthState, identity: GoogleIdentity): Promise<"linked" | AuthErrorCode> {
  const user = await getCurrentUser();
  if (!user || user.id !== stored.linkUserId) return "session_expired";
  const [existing] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, identity.sub)))
    .limit(1);
  if (existing) return existing.userId === user.id ? "linked" : "google_already_linked";
  const [other] = await db
    .select({ id: oauthAccounts.id })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, user.id), eq(oauthAccounts.provider, "google")))
    .limit(1);
  if (other) return "google_already_linked";

  await db.insert(oauthAccounts).values({ userId: user.id, provider: "google", providerAccountId: identity.sub, email: identity.email }).onConflictDoNothing();
  await audit({ action: "user.oauth_linked", entityType: "user", entityId: user.id, actorUserId: user.id, metadata: { provider: "google", via: "account_settings" } });
  await logSecurityEvent({ userId: user.id, type: "oauth_linked", severity: "warning", metadata: { provider: "google" } });
  await sendSecurityAlert([{ userId: user.id }], "google_linked");
  return "linked";
}

export async function listConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const rows = await db
    .select({ provider: oauthAccounts.provider, email: oauthAccounts.email, createdAt: oauthAccounts.createdAt })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));
  return rows.map((row) => ({ provider: row.provider, email: row.email, linkedAt: row.createdAt }));
}

/** True when the user can still sign in after removing Google (password or verified email/phone code). */
export async function canSignInWithoutGoogle(row: Pick<UserRow, "passwordHash" | "emailVerifiedAt" | "phoneVerifiedAt">): Promise<boolean> {
  if (row.passwordHash) return true;
  if (row.emailVerifiedAt && (await isFeatureEnabled("auth.email_otp"))) return true;
  if (row.phoneVerifiedAt && (await isFeatureEnabled("auth.phone_otp"))) return true;
  return false;
}

export async function disconnectGoogle(user: SessionUser): Promise<void> {
  const row = await findUserById(user.id);
  if (!row) throw new AuthError("session_expired");
  const links = await db
    .select({ id: oauthAccounts.id })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, row.id), eq(oauthAccounts.provider, "google")));
  if (links.length === 0) return;
  if (!(await canSignInWithoutGoogle(row))) throw new AuthError("google_disconnect_blocked");
  await db.delete(oauthAccounts).where(and(eq(oauthAccounts.userId, row.id), eq(oauthAccounts.provider, "google")));
  await audit({ action: "user.oauth_unlinked", entityType: "user", entityId: row.id, actorUserId: row.id, metadata: { provider: "google" } });
  await logSecurityEvent({ userId: row.id, type: "oauth_unlinked", severity: "warning", metadata: { provider: "google" } });
  await sendSecurityAlert([{ userId: row.id }], "google_unlinked");
}
