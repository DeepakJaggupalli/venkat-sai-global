import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Integration tests against an ISOLATED database (never the main one):
 *   node scripts/test-db.mjs vsg_test_auth
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_auth'; npx vitest run src/modules/identity
 * Skipped unless DATABASE_URL points at a database whose name starts with "vsg_test_".
 */
const integration = vi.hoisted(() => {
  const url = process.env.DATABASE_URL;
  let name = "";
  try {
    name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    name = "";
  }
  if (!url) process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
  return name.startsWith("vsg_test_");
});

import { db, pool } from "@/db";
import { featureFlags, users, verificationTokens } from "@/db/schema";
import type { SendResult } from "@/modules/messaging";

import { AuthError } from "./errors";
import type { OtpDelivery } from "./messages";
import { consumeLinkToken, hashOtpCode, issueLinkToken, issueOtp, peekLinkToken, verifyOtp } from "./otp";

function capture() {
  const sent: OtpDelivery[] = [];
  const deliver = async (delivery: OtpDelivery): Promise<SendResult> => {
    sent.push(delivery);
    return { ok: true, provider: "test" };
  };
  const lastCode = (): string => {
    const last = sent.at(-1);
    const text = last?.channel === "email" ? last.message.text : (last?.message.body ?? "");
    const match = text.match(/\b(\d{6})\b/);
    if (!match) throw new Error("No code captured");
    return match[1]!;
  };
  return { sent, deliver, lastCode };
}

const uniqueEmail = () => `otp-${randomUUID()}@example.test`;
const uniquePhone = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

async function createUser(): Promise<string> {
  const [row] = await db.insert(users).values({ email: uniqueEmail(), displayName: "Test User", status: "active" }).returning({ id: users.id });
  return row!.id;
}

async function setFlag(key: "auth.email_otp" | "auth.phone_otp", enabled: boolean): Promise<void> {
  await db
    .insert(featureFlags)
    .values({ key, enabled, name: key, category: "Authentication" })
    .onConflictDoUpdate({ target: featureFlags.key, set: { enabled } });
}

afterAll(async () => {
  if (integration) await pool.end();
});

describe.skipIf(!integration)("one-time codes (integration)", () => {
  beforeAll(async () => {
    await setFlag("auth.email_otp", true);
    await setFlag("auth.phone_otp", true);
  });

  it("issues a 6-digit code, stores only its HMAC, and verifies it once", async () => {
    const userId = await createUser();
    const target = uniqueEmail();
    const t = capture();
    const issued = await issueOtp({ purpose: "email_verification", channel: "email", target, userId }, { deliver: t.deliver });
    const code = t.lastCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(t.sent[0]!.channel).toBe("email");

    const [row] = await db.select().from(verificationTokens).where(eq(verificationTokens.id, issued.tokenId));
    expect(row!.secretHash).not.toContain(code);
    expect(row!.secretHash).toBe(hashOtpCode(code, "email_verification", target));
    expect(row!.maxAttempts).toBe(5);
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(10 * 60_000);

    const ok = await verifyOtp({ purpose: "email_verification", target, code, userId });
    expect(ok).toMatchObject({ ok: true, tokenId: issued.tokenId, userId, channel: "email" });

    // Consumed: the same code cannot be used again.
    expect(await verifyOtp({ purpose: "email_verification", target, code, userId })).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("binds the code to its purpose, target and user", async () => {
    const userId = await createUser();
    const otherUser = await createUser();
    const target = uniqueEmail();
    const t = capture();
    await issueOtp({ purpose: "email_change", channel: "email", target, userId }, { deliver: t.deliver });
    const code = t.lastCode();
    expect(await verifyOtp({ purpose: "password_reset", target, code })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await verifyOtp({ purpose: "email_change", target: uniqueEmail(), code })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await verifyOtp({ purpose: "email_change", target, code, userId: otherUser })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await verifyOtp({ purpose: "email_change", target, code, userId })).toMatchObject({ ok: true });
  });

  it("locks the code after 5 wrong attempts, even for the right code", async () => {
    const target = uniqueEmail();
    const t = capture();
    await issueOtp({ purpose: "signup_otp", channel: "email", target }, { deliver: t.deliver });
    const code = t.lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await verifyOtp({ purpose: "signup_otp", target, code: wrong }));
    expect(results.slice(0, 4).map((r) => (r.ok ? "ok" : r.reason))).toEqual(["invalid", "invalid", "invalid", "invalid"]);
    expect(results.slice(0, 4).map((r) => (r.ok ? -1 : r.attemptsRemaining))).toEqual([4, 3, 2, 1]);
    expect(results[4]).toMatchObject({ ok: false, reason: "too_many_attempts", attemptsRemaining: 0 });
    expect(await verifyOtp({ purpose: "signup_otp", target, code })).toMatchObject({ ok: false, reason: "too_many_attempts" });
  });

  it("expires after 10 minutes", async () => {
    const target = uniqueEmail();
    const t = capture();
    const now = new Date();
    await issueOtp({ purpose: "login_otp", channel: "email", target }, { deliver: t.deliver, now });
    const code = t.lastCode();
    expect(await verifyOtp({ purpose: "login_otp", target, code }, { now: new Date(now.getTime() + 10 * 60_000 + 1) })).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("enforces the resend cooldown and keeps only the newest code valid", async () => {
    const target = uniquePhone();
    const t = capture();
    const now = new Date();
    await issueOtp({ purpose: "phone_verification", channel: "sms", target }, { deliver: t.deliver, now });
    const first = t.lastCode();
    expect(t.sent[0]!.channel).toBe("sms");

    await expect(issueOtp({ purpose: "phone_verification", channel: "sms", target }, { deliver: t.deliver, now: new Date(now.getTime() + 10_000) })).rejects.toMatchObject({
      authCode: "otp_cooldown",
    });

    const later = new Date(now.getTime() + 61_000);
    await issueOtp({ purpose: "phone_verification", channel: "sms", target }, { deliver: t.deliver, now: later });
    const second = t.lastCode();
    if (first !== second) {
      expect(await verifyOtp({ purpose: "phone_verification", target, code: first }, { now: later })).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(await verifyOtp({ purpose: "phone_verification", target, code: second }, { now: later })).toMatchObject({ ok: true });
  });

  it("respects the channel feature flags", async () => {
    await setFlag("auth.phone_otp", false);
    await setFlag("auth.email_otp", false);
    try {
      const t = capture();
      await expect(issueOtp({ purpose: "login_otp", channel: "sms", target: uniquePhone() }, { deliver: t.deliver })).rejects.toBeInstanceOf(AuthError);
      await expect(issueOtp({ purpose: "phone_change", channel: "sms", target: uniquePhone() }, { deliver: t.deliver })).rejects.toMatchObject({
        authCode: "phone_otp_disabled",
      });
      await expect(issueOtp({ purpose: "login_otp", channel: "email", target: uniqueEmail() }, { deliver: t.deliver })).rejects.toMatchObject({
        authCode: "email_otp_disabled",
      });
      // Codes that prove ownership of an email address are still sent.
      await expect(issueOtp({ purpose: "signup_otp", channel: "email", target: uniqueEmail() }, { deliver: t.deliver })).resolves.toHaveProperty("tokenId");
      expect(t.sent).toHaveLength(1);
    } finally {
      await setFlag("auth.phone_otp", true);
      await setFlag("auth.email_otp", true);
    }
  });

  it("removes the code when delivery fails so a retry is not blocked", async () => {
    const target = uniqueEmail();
    const failing = async (): Promise<SendResult> => ({ ok: false, error: "smtp down", provider: "test" });
    await expect(issueOtp({ purpose: "email_verification", channel: "email", target }, { deliver: failing })).rejects.toMatchObject({
      authCode: "otp_delivery_failed",
    });
    const rows = await db.select().from(verificationTokens).where(eq(verificationTokens.target, target));
    expect(rows).toHaveLength(0);
    const t = capture();
    await expect(issueOtp({ purpose: "email_verification", channel: "email", target }, { deliver: t.deliver })).resolves.toHaveProperty("tokenId");
  });
});

describe.skipIf(!integration)("password reset links (integration)", () => {
  it("validates, consumes once and rejects tampering and expiry", async () => {
    const userId = await createUser();
    const target = uniqueEmail();
    const now = new Date();
    const { token, expiresAt } = await issueLinkToken({ purpose: "password_reset", target, userId, ttlMinutes: 30 }, { now });
    expect(expiresAt.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);

    expect(await peekLinkToken(token, "password_reset")).toMatchObject({ ok: true, userId, target });
    const [id, secret] = token.split(".");
    expect(await peekLinkToken(`${id}.${secret!.startsWith("A") ? "B" : "A"}${secret!.slice(1)}`, "password_reset")).toEqual({ ok: false, reason: "invalid" });
    expect(await peekLinkToken("garbage", "password_reset")).toEqual({ ok: false, reason: "invalid" });
    expect(await peekLinkToken(token, "email_change")).toEqual({ ok: false, reason: "invalid" });
    expect(await peekLinkToken(token, "password_reset", { now: new Date(now.getTime() + 31 * 60_000) })).toEqual({ ok: false, reason: "expired" });

    expect(await consumeLinkToken(token, "password_reset")).toMatchObject({ ok: true, userId });
    expect(await consumeLinkToken(token, "password_reset")).toEqual({ ok: false, reason: "used" });
  });

  it("supersedes an older link when a new one is issued", async () => {
    const userId = await createUser();
    const target = uniqueEmail();
    const first = await issueLinkToken({ purpose: "password_reset", target, userId, ttlMinutes: 30 });
    const second = await issueLinkToken({ purpose: "password_reset", target, userId, ttlMinutes: 30 });
    expect(await peekLinkToken(first.token, "password_reset")).toEqual({ ok: false, reason: "used" });
    expect(await peekLinkToken(second.token, "password_reset")).toMatchObject({ ok: true });
  });
});
