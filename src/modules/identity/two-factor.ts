import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userTwoFactor } from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { audit, logSecurityEvent } from "@/modules/audit";
import { getSetting } from "@/modules/settings";

import type { AccountActor } from "./account";
import { AuthError } from "./errors";
import { findUserById, sendSecurityAlert, type UserRow } from "./login";
import { verifyPassword } from "./password";
import { markSessionTwoFactorVerified, refreshSessionCookieExpiry, type SessionUser } from "./session";
import {
  buildTotpUri,
  countRemainingRecoveryCodes,
  formatManualKey,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  totpQrCodeDataUrl,
  verifySecondFactor,
  verifyTotpCode,
} from "./totp";
import type { TwoFactorSetupData, TwoFactorStatus } from "./types";

/**
 * Two-factor authentication lifecycle: setup (secret → QR → confirm with a code → recovery codes),
 * recovery-code regeneration and turning it off. Turning off / regenerating requires the current
 * password or an authenticator / recovery code. Staff cannot turn it off while the
 * "security.require_staff_2fa" setting is on.
 */

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [row] = await db
    .select({ enabledAt: userTwoFactor.enabledAt, recoveryCodes: userTwoFactor.recoveryCodes })
    .from(userTwoFactor)
    .where(eq(userTwoFactor.userId, userId))
    .limit(1);
  return {
    enabled: Boolean(row?.enabledAt),
    enabledAt: row?.enabledAt ?? null,
    recoveryCodesRemaining: row?.enabledAt ? countRemainingRecoveryCodes(row.recoveryCodes) : 0,
    pendingSetup: Boolean(row && !row.enabledAt),
  };
}

async function loadUser(user: SessionUser): Promise<UserRow> {
  const row = await findUserById(user.id);
  if (!row || row.status === "suspended" || row.status === "closed") throw new AuthError("session_expired");
  return row;
}

function accountLabel(row: UserRow): string {
  return row.email ?? row.phone ?? row.displayName;
}

/** Step 1: create (or replace) a pending secret and return the QR code + manual key. */
export async function beginTwoFactorSetup(user: SessionUser): Promise<TwoFactorSetupData> {
  const rl = await rateLimit(`2fa:setup:${user.id}`, 10, 60 * 60);
  if (!rl.allowed) throw new AuthError("too_many_attempts");
  const row = await loadUser(user);
  const status = await getTwoFactorStatus(row.id);
  if (status.enabled) throw new AuthError("two_factor_already_enabled");

  const secret = generateTotpSecret();
  const totpSecretEncrypted = encryptField(secret);
  await db
    .insert(userTwoFactor)
    .values({ userId: row.id, totpSecretEncrypted, enabledAt: null, lastUsedStep: null, recoveryCodes: [] })
    .onConflictDoUpdate({ target: userTwoFactor.userId, set: { totpSecretEncrypted, enabledAt: null, lastUsedStep: null, recoveryCodes: [] } });
  await logSecurityEvent({ userId: row.id, type: "two_factor_setup_started" });

  const otpauthUri = buildTotpUri(secret, accountLabel(row));
  return { otpauthUri, qrCodeDataUrl: await totpQrCodeDataUrl(otpauthUri), manualKey: formatManualKey(secret) };
}

/** Step 2: confirm with a code from the app. Returns the recovery codes (shown once). */
export async function confirmTwoFactorSetup(actor: AccountActor, code: string): Promise<{ recoveryCodes: string[] }> {
  const rl = await rateLimit(`2fa:confirm:${actor.user.id}`, 10, 15 * 60);
  if (!rl.allowed) throw new AuthError("too_many_attempts");
  const row = await loadUser(actor.user);
  const recoveryCodes = generateRecoveryCodes();

  await db.transaction(async (tx) => {
    const [factor] = await tx.select().from(userTwoFactor).where(eq(userTwoFactor.userId, row.id)).limit(1).for("update");
    if (!factor) throw new AuthError("two_factor_setup_missing");
    if (factor.enabledAt) throw new AuthError("two_factor_already_enabled");
    let secret: string;
    try {
      secret = decryptField(factor.totpSecretEncrypted);
    } catch {
      throw new AuthError("two_factor_setup_missing");
    }
    const check = verifyTotpCode({ secret, code, lastUsedStep: factor.lastUsedStep ?? null });
    if (!check.ok) throw new AuthError("two_factor_invalid", { field: "code" });
    await tx
      .update(userTwoFactor)
      .set({ enabledAt: new Date(), lastUsedStep: check.step, recoveryCodes: hashRecoveryCodes(recoveryCodes) })
      .where(eq(userTwoFactor.userId, row.id));
    await audit({ action: "user.two_factor_enabled", entityType: "user", entityId: row.id, actorUserId: row.id, tx });
  });

  // This session just proved the factor; other sessions will be asked for it on their next request.
  const expiresAt = await markSessionTwoFactorVerified(actor.sessionId, { isStaff: row.isStaff });
  if (expiresAt) await refreshSessionCookieExpiry(expiresAt);
  await logSecurityEvent({ userId: row.id, type: "two_factor_enabled", severity: "warning" });
  await sendSecurityAlert([{ userId: row.id }], "two_factor_enabled");
  return { recoveryCodes };
}

/** Password OR authenticator / recovery code. */
async function reauthenticate(row: UserRow, input: { password?: string | null; code?: string | null }): Promise<void> {
  if (input.password && row.passwordHash) {
    if (await verifyPassword(row.passwordHash, input.password)) return;
    await logSecurityEvent({ userId: row.id, type: "reauth_failed", severity: "warning", metadata: { factor: "password" } });
    throw new AuthError("reauth_failed", { field: "password" });
  }
  if (input.code) {
    const result = await verifySecondFactor(row.id, { code: input.code, method: "auto" });
    if (result.ok) {
      if (result.method === "recovery") {
        await logSecurityEvent({ userId: row.id, type: "recovery_code_used", severity: "warning", metadata: { remaining: result.recoveryCodesRemaining } });
      }
      return;
    }
    await logSecurityEvent({ userId: row.id, type: "reauth_failed", severity: "warning", metadata: { factor: "two_factor" } });
    throw new AuthError("reauth_failed", { field: "code" });
  }
  throw new AuthError("reauth_failed", { field: input.password ? "password" : "code" });
}

export async function disableTwoFactor(user: SessionUser, input: { password?: string | null; code?: string | null }): Promise<void> {
  const rl = await rateLimit(`2fa:manage:${user.id}`, 10, 15 * 60);
  if (!rl.allowed) throw new AuthError("too_many_attempts");
  const row = await loadUser(user);
  const status = await getTwoFactorStatus(row.id);
  if (!status.enabled) throw new AuthError("two_factor_not_enabled");
  if (row.isStaff && (await getSetting("security.require_staff_2fa"))) throw new AuthError("two_factor_required_for_staff");
  await reauthenticate(row, input);

  await db.delete(userTwoFactor).where(eq(userTwoFactor.userId, row.id));
  await audit({ action: "user.two_factor_disabled", entityType: "user", entityId: row.id, actorUserId: row.id });
  await logSecurityEvent({ userId: row.id, type: "two_factor_disabled", severity: "warning" });
  await sendSecurityAlert([{ userId: row.id }], "two_factor_disabled");
}

export async function regenerateRecoveryCodes(user: SessionUser, input: { password?: string | null; code?: string | null }): Promise<{ recoveryCodes: string[] }> {
  const rl = await rateLimit(`2fa:manage:${user.id}`, 10, 15 * 60);
  if (!rl.allowed) throw new AuthError("too_many_attempts");
  const row = await loadUser(user);
  const status = await getTwoFactorStatus(row.id);
  if (!status.enabled) throw new AuthError("two_factor_not_enabled");
  await reauthenticate(row, input);

  const recoveryCodes = generateRecoveryCodes();
  await db.update(userTwoFactor).set({ recoveryCodes: hashRecoveryCodes(recoveryCodes) }).where(eq(userTwoFactor.userId, row.id));
  await audit({ action: "user.recovery_codes_regenerated", entityType: "user", entityId: row.id, actorUserId: row.id });
  await logSecurityEvent({ userId: row.id, type: "recovery_codes_regenerated", severity: "warning" });
  await sendSecurityAlert([{ userId: row.id }], "recovery_codes_regenerated");
  return { recoveryCodes };
}
