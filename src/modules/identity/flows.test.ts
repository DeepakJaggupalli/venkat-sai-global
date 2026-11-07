import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end tests of the identity flows against an ISOLATED database (see otp.test.ts):
 * the real services run with an in-memory cookie jar / request headers (next/headers mocked),
 * a capturing message transport and a stubbed Google token endpoint.
 */
const env = vi.hoisted(() => {
  const url = process.env.DATABASE_URL;
  let name = "";
  try {
    name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    name = "";
  }
  if (!url) process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
  return { integration: name.startsWith("vsg_test_") };
});

const browser = vi.hoisted(() => {
  const store = new Map<string, string>();
  const state = { ip: "203.0.113.1", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };
  const jar = {
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) as string } : undefined),
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    has: (name: string) => store.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === "string") store.set(name, value ?? "");
      else store.set(name.name, name.value);
    },
    delete: (name: string | { name: string }) => {
      store.delete(typeof name === "string" ? name : name.name);
    },
  };
  return { store, state, jar };
});

const outbox = vi.hoisted(() => ({ messages: [] as { channel: "email" | "sms"; to: string; text: string }[] }));

const google = vi.hoisted(() => ({ claims: {} as Record<string, unknown> }));

const analytics = vi.hoisted(() => ({ calls: [] as { event: string; props?: Record<string, unknown> }[] }));

vi.mock("@/modules/analytics/server", () => ({
  trackServer: async (event: string, props?: Record<string, unknown>) => {
    analytics.calls.push({ event, props });
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => browser.jar,
  headers: async () => new Headers({ "user-agent": browser.state.userAgent, "x-forwarded-for": browser.state.ip, host: "localhost:3000" }),
}));

vi.mock("@/modules/messaging", () => ({
  sendEmail: async (m: { to: string; text: string }) => {
    outbox.messages.push({ channel: "email", to: m.to, text: m.text });
    return { ok: true, provider: "test" };
  },
  sendSms: async (m: { to: string; body: string }) => {
    outbox.messages.push({ channel: "sms", to: m.to, text: m.body });
    return { ok: true, provider: "test" };
  },
  sendWhatsApp: async () => ({ ok: true, provider: "test" }),
}));

vi.mock("./google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google")>();
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    ...actual,
    isGoogleSignInEnabled: async () => true,
    googleCredentials: () => ({ clientId: "test-client.apps.googleusercontent.com", clientSecret: "test-secret" }),
    exchangeGoogleAuthorizationCode: async () => ({ idToken: `${part({ alg: "RS256" })}.${part(google.claims)}.sig` }),
  };
});

import { db, pool } from "@/db";
import { backgroundJobs, consentRecords, featureFlags, oauthAccounts, sessions, users } from "@/db/schema";

import { AuthError } from "./errors";
import { readAuthFlow } from "./flow";
import { hashPassword, verifyPassword } from "./password";
import {
  beginTwoFactorSetup,
  completeGoogleSignIn,
  completeLoginOtp,
  completeSignupVerification,
  completeTwoFactorChallenge,
  confirmTwoFactorSetup,
  registerAccount,
  requestLoginOtp,
  requestPasswordReset,
  resetPasswordWithToken,
  signInWithPassword,
  startGoogleSignIn,
} from "./service";
import { getCurrentSession, SESSION_COOKIE } from "./session";

const email = () => `flow-${randomUUID()}@example.test`;
const newBrowser = () => {
  browser.store.clear();
  // Fresh pseudonymous IP per simulated browser so persisted rate-limit buckets never collide across runs.
  browser.state.ip = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
};
const lastMessageTo = (to: string) => {
  const message = [...outbox.messages].reverse().find((m) => m.to === to);
  if (!message) throw new Error(`No message to ${to}`);
  return message;
};
const lastCodeTo = (to: string) => lastMessageTo(to).text.match(/\b(\d{6})\b/)![1]!;
const lastResetTokenTo = (to: string) => decodeURIComponent(lastMessageTo(to).text.match(/token=([^\s]+)/)![1]!);

async function expectAuthError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).authCode).toBe(code);
}

async function createActiveUser(opts: { email?: string; password?: string; verified?: boolean; status?: "active" | "pending_verification" | "suspended" } = {}) {
  const address = opts.email ?? email();
  const [row] = await db
    .insert(users)
    .values({
      email: address,
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      displayName: "Flow Tester",
      status: opts.status ?? "active",
      passwordHash: opts.password ? await hashPassword(opts.password) : null,
    })
    .returning();
  return row!;
}

async function setFlag(key: "auth.email_otp" | "auth.phone_otp", enabled: boolean) {
  await db.insert(featureFlags).values({ key, enabled, name: key, category: "Authentication" }).onConflictDoUpdate({ target: featureFlags.key, set: { enabled } });
}

const PASSWORD = "river-kite-orange-42";

describe.skipIf(!env.integration)("identity flows (integration)", () => {
  beforeAll(async () => {
    await setFlag("auth.email_otp", true);
    await setFlag("auth.phone_otp", true);
  });
  beforeEach(() => {
    newBrowser();
    analytics.calls.length = 0;
  });
  afterAll(async () => {
    await pool.end();
  });

  it("registers with email, records consent, verifies the code and signs in", async () => {
    const address = email();
    await registerAccount({
      intent: "employer",
      displayName: "Asha Rao",
      contact: { kind: "email", value: address },
      password: PASSWORD,
      marketing: { email: true, sms: false, whatsapp: false },
      returnTo: null,
    });
    const [pending] = await db.select().from(users).where(eq(users.email, address));
    expect(pending).toMatchObject({ status: "pending_verification", emailVerifiedAt: null, displayName: "Asha Rao" });
    expect(await verifyPassword(pending!.passwordHash!, PASSWORD)).toBe(true);

    const consents = await db.select().from(consentRecords).where(eq(consentRecords.userId, pending!.id));
    const byPurpose = Object.fromEntries(consents.map((c) => [c.purpose, c]));
    expect(byPurpose.terms_of_service).toMatchObject({ granted: true, source: "signup", policyVersion: "2026-11-01" });
    expect(byPurpose.privacy_notice).toMatchObject({ granted: true, policyVersion: "2026-11-01" });
    expect(byPurpose.marketing_email?.granted).toBe(true);
    expect(byPurpose.marketing_sms?.granted).toBe(false);

    const flow = await readAuthFlow();
    expect(flow).toMatchObject({ kind: "signup", purpose: "signup_otp", userId: pending!.id, intent: "employer" });

    await expectAuthError(completeSignupVerification(lastCodeTo(address) === "000000" ? "111111" : "000000"), "otp_invalid");
    const next = await completeSignupVerification(lastCodeTo(address));
    expect(next).toBe("/employer/onboarding");

    const [active] = await db.select().from(users).where(eq(users.id, pending!.id));
    expect(active!.status).toBe("active");
    expect(active!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(browser.store.has(SESSION_COOKIE)).toBe(true);
    expect((await getCurrentSession())?.user.id).toBe(pending!.id);
    expect(await readAuthFlow()).toBeNull();

    const jobs = await db.select().from(backgroundJobs).where(eq(backgroundJobs.type, "notifications.dispatch")).orderBy(desc(backgroundJobs.id)).limit(20);
    expect(jobs.some((job) => (job.payload as { event?: string; recipients?: { userId?: string }[] }).event === "account.welcome")).toBe(true);
    // One server-side conversion for the new account, and no login conversion on top of it.
    expect(analytics.calls).toEqual([{ event: "registration_completed", props: { intent: "employer" } }]);
  });

  it("does not reveal that an address is already registered", async () => {
    const existing = await createActiveUser({ password: PASSWORD });
    const before = outbox.messages.length;
    await registerAccount({
      intent: null,
      displayName: "Someone Else",
      contact: { kind: "email", value: existing.email! },
      password: null,
      marketing: { email: false, sms: false, whatsapp: false },
      returnTo: null,
    });
    expect(outbox.messages.length).toBe(before); // no code sent
    expect((await readAuthFlow())?.userId).toBeNull();
    await expectAuthError(completeSignupVerification("123456"), "otp_invalid");
    const [unchanged] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(unchanged!.displayName).toBe("Flow Tester");
  });

  it("replaces an abandoned registration's password when the address is registered again", async () => {
    const address = email();
    const base = { intent: null, displayName: "First Try", contact: { kind: "email" as const, value: address }, marketing: { email: false, sms: false, whatsapp: false }, returnTo: null };
    await registerAccount({ ...base, password: "orchid-lantern-55" });
    newBrowser();
    await registerAccount({ ...base, displayName: "Second Try", password: null });
    const [row] = await db.select().from(users).where(eq(users.email, address));
    expect(row).toMatchObject({ status: "pending_verification", displayName: "Second Try", passwordHash: null });
  });

  it("signs in with a password, locks after repeated failures and explains status only to the owner", async () => {
    const user = await createActiveUser({ password: PASSWORD });
    const identifier = { kind: "email" as const, value: user.email! };
    await expectAuthError(signInWithPassword({ identifier, password: "wrong-password-1" }), "invalid_credentials");

    for (let i = 0; i < 6; i++) await expectAuthError(signInWithPassword({ identifier, password: `wrong-${i}-xyz` }), "invalid_credentials");
    await expectAuthError(signInWithPassword({ identifier, password: "wrong-final" }), "account_locked"); // 8th failure
    await expectAuthError(signInWithPassword({ identifier, password: PASSWORD }), "account_locked");

    await db.update(users).set({ lockedUntil: null }).where(eq(users.id, user.id));
    expect(analytics.calls).toEqual([]);
    const { redirectTo } = await signInWithPassword({ identifier, password: PASSWORD, returnTo: "/talent/jobs" });
    expect(redirectTo).toBe("/talent/jobs");
    expect(analytics.calls).toEqual([{ event: "login_completed", props: undefined }]);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after!.failedLoginCount).toBe(0);

    const suspended = await createActiveUser({ password: PASSWORD, status: "suspended" });
    newBrowser();
    await expectAuthError(signInWithPassword({ identifier: { kind: "email", value: suspended.email! }, password: "not-it-123" }), "invalid_credentials");
    await expectAuthError(signInWithPassword({ identifier: { kind: "email", value: suspended.email! }, password: PASSWORD }), "account_unavailable");
  });

  it("treats unknown identifiers exactly like wrong passwords, including the lock", async () => {
    const identifier = { kind: "email" as const, value: email() };
    for (let i = 0; i < 7; i++) await expectAuthError(signInWithPassword({ identifier, password: "whatever-123" }), "invalid_credentials");
    await expectAuthError(signInWithPassword({ identifier, password: "whatever-123" }), "account_locked");
  });

  it("signs in with a one-time code and claims a never-verified registration safely", async () => {
    const pending = await createActiveUser({ password: "set-by-someone-else-1", verified: false, status: "pending_verification" });
    await requestLoginOtp({ identifier: { kind: "email", value: pending.email! } });
    expect((await readAuthFlow())?.kind).toBe("login");
    const next = await completeLoginOtp(lastCodeTo(pending.email!));
    expect(next).toBe("/talent"); // no sign-up intent recorded → portal home
    const [row] = await db.select().from(users).where(eq(users.id, pending.id));
    expect(row).toMatchObject({ status: "active", passwordHash: null });
    expect(row!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(analytics.calls).toEqual([{ event: "registration_completed", props: { intent: null } }]);
  });

  it("asks unknown addresses for a code without sending one", async () => {
    const address = email();
    const before = outbox.messages.length;
    await requestLoginOtp({ identifier: { kind: "email", value: address } });
    expect(outbox.messages.length).toBe(before);
    expect((await readAuthFlow())?.userId).toBeNull();
    await expectAuthError(completeLoginOtp("123456"), "otp_invalid");
  });

  it("resets a password with an e-mailed link, once, and signs out every session", async () => {
    const user = await createActiveUser({ password: PASSWORD });
    await db.insert(sessions).values({ id: `old-${randomUUID()}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) });
    await requestPasswordReset({ kind: "email", value: user.email! });
    const token = lastResetTokenTo(user.email!);
    await expectAuthError(resetPasswordWithToken(token, "short"), "weak_password_short");
    await resetPasswordWithToken(token, "a-brand-new-passphrase-9");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(await verifyPassword(row!.passwordHash!, "a-brand-new-passphrase-9")).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    await expectAuthError(resetPasswordWithToken(token, "another-passphrase-77"), "reset_link_invalid");
  });

  it("sets up TOTP, then requires it at sign-in (recovery codes work once)", async () => {
    const user = await createActiveUser({ password: PASSWORD });
    const identifier = { kind: "email" as const, value: user.email! };
    await signInWithPassword({ identifier, password: PASSWORD });
    const current = await getCurrentSession();
    const actor = { user: current!.user, sessionId: current!.session.id };

    const setup = await beginTwoFactorSetup(actor.user);
    expect(setup.qrCodeDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const secret = new URL(setup.otpauthUri).searchParams.get("secret")!;
    expect(setup.manualKey.replace(/\s/g, "")).toBe(secret);
    await expectAuthError(confirmTwoFactorSetup(actor, "000000"), "two_factor_invalid");
    const code = TOTP.generate({ secret: Secret.fromBase32(secret), timestamp: Date.now() - 30_000 });
    const { recoveryCodes } = await confirmTwoFactorSetup(actor, code);
    expect(recoveryCodes).toHaveLength(10);

    newBrowser();
    analytics.calls.length = 0;
    const { redirectTo } = await signInWithPassword({ identifier, password: PASSWORD, returnTo: "/account/security" });
    expect(redirectTo).toBe("/sign-in/two-factor?returnTo=%2Faccount%2Fsecurity");
    expect((await getCurrentSession())?.needsTwoFactor).toBe(true);
    expect(analytics.calls).toEqual([]); // not signed in until the second factor
    await expectAuthError(completeTwoFactorChallenge({ method: "totp", code: "000000", returnTo: "/account/security" }), "two_factor_invalid");
    const next = await completeTwoFactorChallenge({ method: "recovery", code: recoveryCodes[0]!, returnTo: "/account/security" });
    expect(next).toBe("/account/security");
    expect((await getCurrentSession())?.needsTwoFactor).toBe(false);
    expect(analytics.calls).toEqual([{ event: "login_completed", props: undefined }]);

    newBrowser();
    await signInWithPassword({ identifier, password: PASSWORD });
    await expectAuthError(completeTwoFactorChallenge({ method: "recovery", code: recoveryCodes[0]!, returnTo: null }), "two_factor_invalid");
  });

  describe("Google sign-in linking rules", () => {
    async function googleRound(identity: { sub: string; email: string; emailVerified?: boolean; nonce?: (n: string) => string; state?: (s: string) => string }) {
      const location = await startGoogleSignIn({ intent: null, returnTo: null, consent: "notice", marketing: { email: false, sms: false, whatsapp: false }, mode: "signin" });
      const url = new URL(location);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      const state = url.searchParams.get("state")!;
      const nonce = url.searchParams.get("nonce")!;
      const now = Math.floor(Date.now() / 1000);
      google.claims = {
        iss: "https://accounts.google.com",
        aud: "test-client.apps.googleusercontent.com",
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.emailVerified ?? true,
        name: "Google Person",
        iat: now,
        exp: now + 3600,
        nonce: identity.nonce ? identity.nonce(nonce) : nonce,
      };
      return completeGoogleSignIn({ code: "auth-code", state: identity.state ? identity.state(state) : state, error: null });
    }

    it("creates a verified account for a new Google user and records notice-based consent", async () => {
      const address = email();
      const sub = randomUUID();
      expect(await googleRound({ sub, email: address })).toBe("/talent");
      const [row] = await db.select().from(users).where(eq(users.email, address));
      expect(row).toMatchObject({ status: "active", signupSource: "google", passwordHash: null });
      expect(row!.emailVerifiedAt).toBeInstanceOf(Date);
      const [link] = await db.select().from(oauthAccounts).where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, sub)));
      expect(link!.userId).toBe(row!.id);
      const consents = await db.select().from(consentRecords).where(eq(consentRecords.userId, row!.id));
      expect(consents.map((c) => c.purpose).sort()).toEqual(["privacy_notice", "terms_of_service"]);
      expect(analytics.calls).toEqual([{ event: "registration_completed", props: { intent: null } }]);
      // Signing in again uses the existing link.
      newBrowser();
      analytics.calls.length = 0;
      expect(await googleRound({ sub, email: address })).toBe("/talent");
      expect(analytics.calls).toEqual([{ event: "login_completed", props: undefined }]);
    });

    it("links to an existing account only when its email is verified", async () => {
      const verified = await createActiveUser({ password: PASSWORD });
      expect(await googleRound({ sub: randomUUID(), email: verified.email! })).toBe("/talent");
      expect(await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, verified.id))).toHaveLength(1);

      newBrowser();
      const unverified = await createActiveUser({ password: PASSWORD, verified: false });
      const location = await googleRound({ sub: randomUUID(), email: unverified.email! });
      expect(location).toContain("error=google_email_conflict");
      expect(await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, unverified.id))).toHaveLength(0);
      expect(browser.store.has(SESSION_COOKIE)).toBe(false);
    });

    it("replaces a never-verified registration and wipes its password", async () => {
      const pending = await createActiveUser({ password: "attacker-chosen-pw-1", verified: false, status: "pending_verification" });
      expect(await googleRound({ sub: randomUUID(), email: pending.email! })).toBe("/talent");
      const [row] = await db.select().from(users).where(eq(users.id, pending.id));
      expect(row).toMatchObject({ status: "active", passwordHash: null, displayName: "Google Person" });
    });

    it("rejects a wrong state, a wrong nonce and unverified Google emails", async () => {
      expect(await googleRound({ sub: randomUUID(), email: email(), state: (s) => `${s}x` })).toContain("error=google_failed");
      newBrowser();
      expect(await googleRound({ sub: randomUUID(), email: email(), nonce: (n) => `${n}x` })).toContain("error=google_failed");
      newBrowser();
      expect(await googleRound({ sub: randomUUID(), email: email(), emailVerified: false })).toContain("error=google_email_unverified");
      newBrowser();
      // No state cookie at all (e.g. a forged callback link).
      expect(await completeGoogleSignIn({ code: "x", state: "y".repeat(43), error: null })).toContain("error=google_failed");
    });
  });
});
