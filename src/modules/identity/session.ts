import "server-only";

import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { sessions, users, userTwoFactor } from "@/db/schema";
import type { OrgType, UserStatus } from "@/db/schema/_constants";
import { hmacToken, randomToken } from "@/lib/crypto";
import { safeReturnTo } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request";

/**
 * Session management (database sessions, httpOnly cookie).
 *
 * The cookie carries a 256-bit random token; the database stores only
 * HMAC(token) as the session id. Sessions slide for regular users and are
 * short-lived for staff. Users with TOTP enabled must complete the second
 * factor before the session is considered authenticated.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vsg_session" : "vsg_session";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const SESSION_TTL_MS = 30 * DAY;
export const STAFF_SESSION_TTL_MS = 12 * 60 * MINUTE;
const SLIDE_WHEN_REMAINING_MS = 15 * DAY;
const TOUCH_INTERVAL_MS = 5 * MINUTE;

export type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  displayName: string;
  avatarFileId: string | null;
  status: UserStatus;
  isStaff: boolean;
  locale: string;
  timezone: string | null;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
};

export type CurrentSession = {
  session: {
    id: string;
    expiresAt: Date;
    twoFactorVerifiedAt: Date | null;
    activeOrgs: Partial<Record<OrgType, string>>;
    createdAt: Date;
  };
  user: SessionUser;
  /** True when the user has TOTP enabled and has not completed it for this session. */
  needsTwoFactor: boolean;
};

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/**
 * Create a session for a user and set the cookie. Call from Server Actions or Route Handlers only.
 * Also stamps lastLoginAt and clears failed-login counters.
 */
export async function createSession(userId: string, opts: { isStaff: boolean; twoFactorVerified?: boolean }) {
  const token = randomToken(32);
  const id = hmacToken(token, "session");
  const meta = await getRequestMeta().catch(() => null);
  const expiresAt = new Date(Date.now() + (opts.isStaff ? STAFF_SESSION_TTL_MS : SESSION_TTL_MS));
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    ipHash: meta?.ipHash ?? null,
    userAgent: meta?.userAgent ?? null,
    twoFactorVerifiedAt: opts.twoFactorVerified ? new Date() : null,
  });
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, userId));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return { id, expiresAt };
}

async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** The current session (memoised per request). Returns null when signed out or invalid. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const token = await readSessionToken();
  if (!token || token.length > 200) return null;
  const id = hmacToken(token, "session");

  const rows = await db
    .select({
      session: sessions,
      user: users,
      twoFactorEnabledAt: userTwoFactor.enabledAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userTwoFactor, eq(userTwoFactor.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now || row.user.status === "suspended" || row.user.status === "closed") {
    await db.delete(sessions).where(eq(sessions.id, id)).catch(() => undefined);
    return null;
  }

  // Sliding expiry for non-staff sessions + periodic lastSeenAt touch (best effort, no cookie write here).
  const updates: Partial<typeof sessions.$inferInsert> = {};
  if (!row.user.isStaff && row.session.expiresAt.getTime() - now < SLIDE_WHEN_REMAINING_MS) {
    updates.expiresAt = new Date(now + SESSION_TTL_MS);
  }
  if (now - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    updates.lastSeenAt = new Date(now);
  }
  if (Object.keys(updates).length) {
    db.update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .catch((error) => logger.warn("Failed to touch session", { error }));
  }

  const twoFactorEnabled = Boolean(row.twoFactorEnabledAt);
  return {
    session: {
      id: row.session.id,
      expiresAt: updates.expiresAt ?? row.session.expiresAt,
      twoFactorVerifiedAt: row.session.twoFactorVerifiedAt,
      activeOrgs: row.session.activeOrgs ?? {},
      createdAt: row.session.createdAt,
    },
    user: {
      id: row.user.id,
      email: row.user.email,
      phone: row.user.phone,
      emailVerifiedAt: row.user.emailVerifiedAt,
      phoneVerifiedAt: row.user.phoneVerifiedAt,
      displayName: row.user.displayName,
      avatarFileId: row.user.avatarFileId,
      status: row.user.status,
      isStaff: row.user.isStaff,
      locale: row.user.locale,
      timezone: row.user.timezone,
      hasPassword: Boolean(row.user.passwordHash),
      twoFactorEnabled,
    },
    needsTwoFactor: twoFactorEnabled && !row.session.twoFactorVerifiedAt,
  };
});

/** Fully authenticated user (second factor completed when enabled), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const current = await getCurrentSession();
  return current && !current.needsTwoFactor ? current.user : null;
});

/** Path + query of the current request (forwarded by src/proxy.ts as x-vsg-pathname). */
export async function currentPathForReturn(): Promise<string> {
  const h = await headers();
  return safeReturnTo(h.get("x-vsg-pathname"), "/");
}

/**
 * Require an authenticated user. Redirects to sign-in (or the 2FA challenge) with returnTo.
 * Use at the top of every protected page/layout and inside protected Server Actions.
 */
export async function requireUser(opts: { returnTo?: string } = {}): Promise<SessionUser> {
  const current = await getCurrentSession();
  const returnTo = opts.returnTo ?? (await currentPathForReturn());
  if (!current) redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  if (current.needsTwoFactor) redirect(`/sign-in/two-factor?returnTo=${encodeURIComponent(returnTo)}`);
  return current.user;
}

export async function markSessionTwoFactorVerified(sessionId: string): Promise<void> {
  await db.update(sessions).set({ twoFactorVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Remember which organisation the user is working in for a portal. */
export async function setActiveOrganization(sessionId: string, orgType: OrgType, organizationId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ activeOrgs: sql`${sessions.activeOrgs} || ${JSON.stringify({ [orgType]: organizationId })}::jsonb` })
    .where(eq(sessions.id, sessionId));
}

/** Sign out the current device. */
export async function invalidateCurrentSession(): Promise<void> {
  const token = await readSessionToken();
  const jar = await cookies();
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hmacToken(token, "session")));
  }
  jar.delete(SESSION_COOKIE);
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Sign out everywhere (optionally keeping the current session), e.g. after a password change. */
export async function invalidateUserSessions(userId: string, opts: { exceptSessionId?: string } = {}): Promise<void> {
  await db
    .delete(sessions)
    .where(opts.exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, opts.exceptSessionId)) : eq(sessions.userId, userId));
}

export async function listUserSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      twoFactorVerifiedAt: sessions.twoFactorVerifiedAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(sql`${sessions.lastSeenAt} desc`);
}

/** Housekeeping (scheduled task): remove expired sessions. */
export async function deleteExpiredSessions(): Promise<number> {
  const res = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return res.length;
}

/** True when the user has an enabled TOTP factor. */
export async function hasTwoFactor(userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: userTwoFactor.userId })
    .from(userTwoFactor)
    .where(and(eq(userTwoFactor.userId, userId), isNotNull(userTwoFactor.enabledAt)))
    .limit(1);
  return rows.length > 0;
}
