import "server-only";

import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { isFeatureEnabled } from "@/modules/settings";

import { describeDevice, publicSessionId } from "./device";
import { isGoogleSignInEnabled } from "./google";
import { canSignInWithoutGoogle, listConnectedAccounts } from "./google-sign-in";
import { getTwoFactorStatus } from "./two-factor";
import type { AccountOverview, ConnectedAccount, SessionListItem, TwoFactorStatus } from "./types";

/**
 * Read models for /account and /account/security. Callers pass the authenticated user's id;
 * nothing here accepts another user's id from the client.
 */

export async function getAccountOverview(userId: string): Promise<AccountOverview | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    phone: row.phone,
    phoneVerifiedAt: row.phoneVerifiedAt,
    locale: row.locale,
    timezone: row.timezone,
    hasPassword: Boolean(row.passwordHash),
    passwordChangedAt: row.passwordChangedAt,
    isStaff: row.isStaff,
    createdAt: row.createdAt,
  };
}

/** Active (unexpired) sessions, newest activity first; the current one is flagged. */
export async function listSessionsForAccount(userId: string, currentSessionId: string): Promise<SessionListItem[]> {
  const rows = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      twoFactorVerifiedAt: sessions.twoFactorVerifiedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);
  return rows
    .map((row) => {
      const device = describeDevice(row.userAgent);
      return {
        id: publicSessionId(row.id),
        current: row.id === currentSessionId,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        expiresAt: row.expiresAt,
        twoFactorVerified: Boolean(row.twoFactorVerifiedAt),
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current));
}

export type SecurityOverview = {
  account: AccountOverview;
  twoFactor: TwoFactorStatus;
  sessions: SessionListItem[];
  connectedAccounts: ConnectedAccount[];
  google: { available: boolean; linked: boolean; canDisconnect: boolean };
  otp: { email: boolean; phone: boolean };
};

export async function getSecurityOverview(userId: string, currentSessionId: string): Promise<SecurityOverview | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const account = await getAccountOverview(userId);
  if (!row || !account) return null;
  const [twoFactor, sessionList, connectedAccounts, googleAvailable, emailOtp, phoneOtp, canDisconnect] = await Promise.all([
    getTwoFactorStatus(userId),
    listSessionsForAccount(userId, currentSessionId),
    listConnectedAccounts(userId),
    isGoogleSignInEnabled(),
    isFeatureEnabled("auth.email_otp"),
    isFeatureEnabled("auth.phone_otp"),
    canSignInWithoutGoogle(row),
  ]);
  const linked = connectedAccounts.some((account) => account.provider === "google");
  return {
    account,
    twoFactor,
    sessions: sessionList,
    connectedAccounts,
    google: { available: googleAvailable, linked, canDisconnect },
    otp: { email: emailOtp, phone: phoneOtp },
  };
}
