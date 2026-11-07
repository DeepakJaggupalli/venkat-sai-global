import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { afterAll, describe, expect, it, vi } from "vitest";

/** Integration tests (isolated database only — see otp.test.ts for the setup commands). */
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
import { sessions, users, userTwoFactor, verificationTokens } from "@/db/schema";
import { encryptField } from "@/lib/crypto";

import { cleanupIdentityData } from "./maintenance";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCodes, verifySecondFactor } from "./totp";

async function userWithTwoFactor(opts: { enabled?: boolean } = {}) {
  const [user] = await db
    .insert(users)
    .values({ email: `tf-${randomUUID()}@example.test`, displayName: "Two Factor", status: "active" })
    .returning({ id: users.id });
  const secret = generateTotpSecret();
  const codes = generateRecoveryCodes();
  await db.insert(userTwoFactor).values({
    userId: user!.id,
    totpSecretEncrypted: encryptField(secret),
    enabledAt: opts.enabled === false ? null : new Date(),
    recoveryCodes: hashRecoveryCodes(codes),
  });
  return { userId: user!.id, secret, codes };
}

const totpAt = (secret: string, timestamp: number) =>
  TOTP.generate({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30, timestamp });

afterAll(async () => {
  if (integration) await pool.end();
});

describe.skipIf(!integration)("verifySecondFactor (integration)", () => {
  it("accepts a current code once and records the step (replay protection)", async () => {
    const { userId, secret } = await userWithTwoFactor();
    const now = new Date();
    const code = totpAt(secret, now.getTime());
    expect(await verifySecondFactor(userId, { code }, { now })).toMatchObject({ ok: true, method: "totp", recoveryCodesRemaining: 10 });
    const [row] = await db.select().from(userTwoFactor).where(eq(userTwoFactor.userId, userId));
    expect(row!.lastUsedStep).toBe(Math.floor(now.getTime() / 30_000));
    // The same code (and the previous step) can no longer be used.
    expect(await verifySecondFactor(userId, { code }, { now: new Date(now.getTime() + 5_000) })).toEqual({ ok: false, reason: "invalid" });
    expect(await verifySecondFactor(userId, { code: totpAt(secret, now.getTime() - 30_000) }, { now })).toEqual({ ok: false, reason: "invalid" });
    // The next step works.
    const later = new Date(now.getTime() + 30_000);
    expect(await verifySecondFactor(userId, { code: totpAt(secret, later.getTime()) }, { now: later })).toMatchObject({ ok: true });
  });

  it("accepts each recovery code once, detected automatically", async () => {
    const { userId, codes } = await userWithTwoFactor();
    const first = codes[2]!;
    expect(await verifySecondFactor(userId, { code: first.toUpperCase(), method: "auto" })).toEqual({ ok: true, method: "recovery", recoveryCodesRemaining: 9 });
    expect(await verifySecondFactor(userId, { code: first, method: "auto" })).toEqual({ ok: false, reason: "invalid" });
    expect(await verifySecondFactor(userId, { code: codes[5]!.replace("-", " "), method: "recovery" })).toEqual({
      ok: true,
      method: "recovery",
      recoveryCodesRemaining: 8,
    });
  });

  it("refuses when two-factor authentication is not enabled", async () => {
    const { userId, secret } = await userWithTwoFactor({ enabled: false });
    expect(await verifySecondFactor(userId, { code: totpAt(secret, Date.now()) })).toEqual({ ok: false, reason: "not_enabled" });
    expect(await verifySecondFactor(randomUUID(), { code: "123456" })).toEqual({ ok: false, reason: "not_enabled" });
  });
});

describe.skipIf(!integration)("identity.cleanup (integration)", () => {
  it("removes expired sessions and stale verification tokens only", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `cleanup-${randomUUID()}@example.test`, displayName: "Cleanup", status: "active" })
      .returning({ id: users.id });
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const expiredId = `expired-${randomUUID()}`;
    const liveId = `live-${randomUUID()}`;
    await db.insert(sessions).values([
      { id: expiredId, userId: user!.id, expiresAt: new Date(now.getTime() - 1000) },
      { id: liveId, userId: user!.id, expiresAt: new Date(now.getTime() + day) },
    ]);
    const target = `cleanup-${randomUUID()}@example.test`;
    const base = { purpose: "email_verification" as const, channel: "email" as const, target, secretHash: "x", metadata: { kind: "otp" } };
    const [oldExpired, oldConsumed, recentConsumed, fresh] = await db
      .insert(verificationTokens)
      .values([
        { ...base, expiresAt: new Date(now.getTime() - 8 * day), createdAt: new Date(now.getTime() - 8 * day) },
        { ...base, expiresAt: new Date(now.getTime() - 9 * day), consumedAt: new Date(now.getTime() - 8 * day) },
        { ...base, expiresAt: new Date(now.getTime() - day), consumedAt: new Date(now.getTime() - day) },
        { ...base, expiresAt: new Date(now.getTime() + 10 * 60_000) },
      ])
      .returning({ id: verificationTokens.id });

    const result = await cleanupIdentityData(now);
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.verificationTokens).toBeGreaterThanOrEqual(2);

    const remainingSessions = (await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user!.id))).map((r) => r.id);
    expect(remainingSessions).toEqual([liveId]);
    const remainingTokens = (await db.select({ id: verificationTokens.id }).from(verificationTokens).where(eq(verificationTokens.target, target))).map(
      (r) => r.id,
    );
    expect(remainingTokens.sort()).toEqual([recentConsumed!.id, fresh!.id].sort());
    expect(remainingTokens).not.toContain(oldExpired!.id);
    expect(remainingTokens).not.toContain(oldConsumed!.id);
  });
});
