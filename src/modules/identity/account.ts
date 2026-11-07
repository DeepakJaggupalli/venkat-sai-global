import "server-only";

import { and, eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { sessions, users } from "@/db/schema";
import { maskEmail, maskPhone } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { audit, logSecurityEvent } from "@/modules/audit";

import { publicSessionId } from "./device";
import { AuthError } from "./errors";
import {
  assertStrongPassword,
  findUserByContact,
  findUserById,
  otpFailureError,
  sendPasswordChangedNotice,
  sendSecurityAlert,
  setLocaleCookie,
  type UserRow,
} from "./login";
import { issueOtp, verifyOtp } from "./otp";
import { hashPassword, verifyPassword } from "./password";
import { invalidateCurrentSession, invalidateUserSessions, type SessionUser } from "./session";
import type { ContactKind } from "./types";

/**
 * Signed-in account management: profile basics, password, email / phone changes and
 * verification, and session revocation. Every function takes the authenticated actor
 * (from requireUser / getCurrentSession) and only ever touches that user's own data.
 */

export type AccountActor = { user: SessionUser; sessionId: string };

async function loadActor(user: SessionUser): Promise<UserRow> {
  const row = await findUserById(user.id);
  if (!row || row.status === "suspended" || row.status === "closed") throw new AuthError("session_expired");
  return row;
}

async function enforce(key: string, limit: number, windowSeconds: number): Promise<void> {
  const rl = await rateLimit(key, limit, windowSeconds);
  if (!rl.allowed) throw new AuthError("too_many_attempts");
}

/** Re-authentication for sensitive changes: the current password when the account has one. */
async function confirmCurrentPassword(row: UserRow, currentPassword: string | null | undefined): Promise<void> {
  if (!row.passwordHash) return;
  if (!currentPassword) throw new AuthError("current_password_required", { field: "currentPassword" });
  if (!(await verifyPassword(row.passwordHash, currentPassword))) {
    await logSecurityEvent({ userId: row.id, type: "reauth_failed", severity: "warning", metadata: { factor: "password" } });
    throw new AuthError("current_password_invalid", { field: "currentPassword" });
  }
}

// ---------------------------------------------------------------------------
// Profile basics
// ---------------------------------------------------------------------------

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function updateAccountBasics(user: SessionUser, input: { displayName: string; locale: string; timezone?: string | null }): Promise<void> {
  const timezone = input.timezone?.trim() || null;
  if (timezone && !isValidTimeZone(timezone)) throw new AuthError("timezone_invalid", { field: "timezone" });
  const row = await loadActor(user);
  const changed = [
    row.displayName !== input.displayName ? "displayName" : null,
    row.locale !== input.locale ? "locale" : null,
    (row.timezone ?? null) !== timezone ? "timezone" : null,
  ].filter((field): field is string => field !== null);
  if (changed.length === 0) return;
  await db.update(users).set({ displayName: input.displayName, locale: input.locale, timezone }).where(eq(users.id, row.id));
  await setLocaleCookie(input.locale);
  await audit({ action: "user.profile_updated", entityType: "user", entityId: row.id, actorUserId: row.id, metadata: { fields: changed } });
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/** Change (current password required) or set a first password. Signs out every other session. */
export async function changePassword(
  actor: AccountActor,
  input: { currentPassword?: string | null; newPassword: string },
): Promise<{ mode: "changed" | "set" }> {
  await enforce(`password-change:${actor.user.id}`, 10, 60 * 60);
  const row = await loadActor(actor.user);
  const mode = row.passwordHash ? "changed" : "set";
  if (row.passwordHash) {
    await confirmCurrentPassword(row, input.currentPassword);
    if (await verifyPassword(row.passwordHash, input.newPassword)) throw new AuthError("password_reused", { field: "newPassword" });
  }
  await assertStrongPassword(input.newPassword, { email: row.email, name: row.displayName });
  const passwordHash = await hashPassword(input.newPassword);
  await db.update(users).set({ passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, row.id));
  await invalidateUserSessions(row.id, { exceptSessionId: actor.sessionId });
  await audit({ action: mode === "set" ? "user.password_set" : "user.password_changed", entityType: "user", entityId: row.id, actorUserId: row.id });
  await logSecurityEvent({ userId: row.id, type: mode === "set" ? "password_set" : "password_changed", severity: "warning" });
  await sendPasswordChangedNotice(row, mode === "set" ? "set" : "change");
  return { mode };
}

// ---------------------------------------------------------------------------
// Email / phone
// ---------------------------------------------------------------------------

const CHANGE_PURPOSE = { email: "email_change", phone: "phone_change" } as const;
const VERIFY_PURPOSE = { email: "email_verification", phone: "phone_verification" } as const;

function channelFor(kind: ContactKind): "email" | "sms" {
  return kind === "email" ? "email" : "sms";
}

function contactOf(row: UserRow, kind: ContactKind): { value: string | null; verifiedAt: Date | null } {
  return kind === "email" ? { value: row.email, verifiedAt: row.emailVerifiedAt } : { value: row.phone, verifiedAt: row.phoneVerifiedAt };
}

function mask(kind: ContactKind, value: string | null): string | null {
  if (!value) return null;
  return kind === "email" ? maskEmail(value) : maskPhone(value);
}

/** Step 1: send a code to the new email / phone. */
export async function requestContactChange(
  user: SessionUser,
  input: { kind: ContactKind; value: string; currentPassword?: string | null },
): Promise<{ resendAvailableAt: number }> {
  await enforce(`contact-change:${user.id}`, 6, 60 * 60);
  const row = await loadActor(user);
  await confirmCurrentPassword(row, input.currentPassword);

  const current = contactOf(row, input.kind);
  if (current.value === input.value && current.verifiedAt) throw new AuthError("contact_unchanged", { field: "value" });
  const holder = await findUserByContact({ kind: input.kind, value: input.value });
  if (holder && holder.id !== row.id && holder.status !== "pending_verification") throw new AuthError("contact_in_use", { field: "value" });

  try {
    const issued = await issueOtp({ purpose: CHANGE_PURPOSE[input.kind], channel: channelFor(input.kind), target: input.value, userId: row.id, locale: row.locale });
    await logSecurityEvent({ userId: row.id, type: `${input.kind}_change_requested`, metadata: { to: mask(input.kind, input.value) } });
    return { resendAvailableAt: issued.resendAvailableAt.getTime() };
  } catch (error) {
    if (error instanceof AuthError && !error.field) throw new AuthError(error.authCode, { vars: error.vars, field: "value" });
    throw error;
  }
}

/**
 * A never-verified registration may hold an address; once the signed-in user proves ownership the
 * address is released from it (the pending row is removed when it has no address left).
 */
async function releaseFromPendingHolder(tx: DbOrTx, holder: UserRow, kind: ContactKind): Promise<void> {
  const remaining = kind === "email" ? holder.phone : holder.email;
  if (!remaining) {
    await tx.delete(users).where(and(eq(users.id, holder.id), eq(users.status, "pending_verification")));
  } else {
    await tx
      .update(users)
      .set(kind === "email" ? { email: null, emailVerifiedAt: null } : { phone: null, phoneVerifiedAt: null })
      .where(and(eq(users.id, holder.id), eq(users.status, "pending_verification")));
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/** Step 2: verify the code and switch the address. Alerts the previous (verified) address. */
export async function confirmContactChange(user: SessionUser, input: { kind: ContactKind; value: string; code: string }): Promise<void> {
  const result = await verifyOtp({ purpose: CHANGE_PURPOSE[input.kind], target: input.value, code: input.code, userId: user.id });
  if (!result.ok) throw otpFailureError(result.reason);

  let previous: { value: string | null; verifiedAt: Date | null } = { value: null, verifiedAt: null };
  let row: UserRow | null = null;
  try {
    row = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(users).where(eq(users.id, user.id)).limit(1).for("update");
      if (!locked || locked.status === "suspended" || locked.status === "closed") throw new AuthError("session_expired");
      previous = contactOf(locked, input.kind);
      const holder = await findUserByContact({ kind: input.kind, value: input.value }, tx);
      if (holder && holder.id !== locked.id) {
        if (holder.status !== "pending_verification") throw new AuthError("contact_in_use", { field: "value" });
        await releaseFromPendingHolder(tx, holder, input.kind);
      }
      const now = new Date();
      await tx
        .update(users)
        .set(input.kind === "email" ? { email: input.value, emailVerifiedAt: now } : { phone: input.value, phoneVerifiedAt: now })
        .where(eq(users.id, locked.id));
      await audit({
        action: input.kind === "email" ? "user.email_changed" : "user.phone_changed",
        entityType: "user",
        entityId: locked.id,
        actorUserId: locked.id,
        metadata: { from: mask(input.kind, previous.value), to: mask(input.kind, input.value) },
        tx,
      });
      return locked;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AuthError("contact_in_use", { field: "value" });
    throw error;
  }
  if (!row) return;

  const kindLabel = input.kind === "email" ? "email_changed" : "phone_changed";
  await logSecurityEvent({ userId: row.id, type: kindLabel, severity: "warning", metadata: { from: mask(input.kind, previous.value), to: mask(input.kind, input.value) } });
  await sendSecurityAlert([{ userId: row.id }], kindLabel);
  if (previous.value && previous.verifiedAt && previous.value !== input.value) {
    // Tell the old address directly: notify() resolves { userId } to the NEW address.
    const recipient = input.kind === "email" ? { email: previous.value, name: row.displayName, locale: row.locale } : { phone: previous.value, locale: row.locale };
    await sendSecurityAlert([recipient], kindLabel);
  }
}

/** Send a code to the current, not yet verified email / phone. */
export async function requestContactVerification(user: SessionUser, kind: ContactKind): Promise<{ resendAvailableAt: number }> {
  await enforce(`contact-verify:${user.id}`, 6, 60 * 60);
  const row = await loadActor(user);
  const current = contactOf(row, kind);
  if (!current.value) throw new AuthError("contact_missing");
  if (current.verifiedAt) throw new AuthError("contact_already_verified");
  const issued = await issueOtp({ purpose: VERIFY_PURPOSE[kind], channel: channelFor(kind), target: current.value, userId: row.id, locale: row.locale });
  return { resendAvailableAt: issued.resendAvailableAt.getTime() };
}

export async function confirmContactVerification(user: SessionUser, kind: ContactKind, code: string): Promise<void> {
  const row = await loadActor(user);
  const current = contactOf(row, kind);
  if (!current.value) throw new AuthError("contact_missing");
  if (current.verifiedAt) return;
  const result = await verifyOtp({ purpose: VERIFY_PURPOSE[kind], target: current.value, code, userId: row.id });
  if (!result.ok) throw otpFailureError(result.reason);
  const column = kind === "email" ? users.email : users.phone;
  await db
    .update(users)
    .set(kind === "email" ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() })
    .where(and(eq(users.id, row.id), eq(column, current.value)));
  await audit({ action: kind === "email" ? "user.email_verified" : "user.phone_verified", entityType: "user", entityId: row.id, actorUserId: row.id });
  await logSecurityEvent({ userId: row.id, type: kind === "email" ? "email_verified" : "phone_verified", metadata: { purpose: VERIFY_PURPOSE[kind] } });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** End one of the user's other sessions (identified by its public id from the sessions list). */
export async function revokeSession(actor: AccountActor, publicId: string): Promise<void> {
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, actor.user.id));
  const match = rows.find((row) => publicSessionId(row.id) === publicId);
  if (!match) throw new AuthError("session_not_found");
  if (match.id === actor.sessionId) throw new AuthError("cannot_revoke_current");
  await db.delete(sessions).where(and(eq(sessions.id, match.id), eq(sessions.userId, actor.user.id)));
  await audit({ action: "user.session_revoked", entityType: "user", entityId: actor.user.id, actorUserId: actor.user.id, metadata: { session: publicId } });
  await logSecurityEvent({ userId: actor.user.id, type: "session_revoked", metadata: { session: publicId } });
}

/** Sign out of every session (including this one when `includeCurrent`). */
export async function signOutEverywhere(actor: AccountActor, opts: { includeCurrent: boolean }): Promise<void> {
  await invalidateUserSessions(actor.user.id, opts.includeCurrent ? {} : { exceptSessionId: actor.sessionId });
  if (opts.includeCurrent) await invalidateCurrentSession();
  await audit({
    action: "user.sessions_revoked",
    entityType: "user",
    entityId: actor.user.id,
    actorUserId: actor.user.id,
    metadata: { includeCurrent: opts.includeCurrent },
  });
  await logSecurityEvent({ userId: actor.user.id, type: "sessions_revoked_all", severity: "warning", metadata: { includeCurrent: opts.includeCurrent } });
}
