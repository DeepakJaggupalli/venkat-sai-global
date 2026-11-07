"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createFormAction, ok } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";
import { requestPasswordReset } from "@/modules/identity/service";

import { createStaffUser, resetUserTwoFactor, revokeAllUserSessions, revokeUserSession, setStaffRoles, setUserStatus } from "./_lib/user-admin";

/** Command Centre user administration actions. Each re-authorises; the service re-checks and audits. */

function refresh(userId?: string) {
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

export const setUserStatusAction = createFormAction(
  z.object({ userId: f.uuid(), status: z.enum(["active", "suspended"]), reason: f.text({ label: "Reason", max: 1000 }) }),
  async ({ userId, status, reason }) => {
    const ctx = await requireStaff("users.manage");
    await setUserStatus(ctx, userId, status, reason);
    refresh(userId);
    return ok(undefined, status === "suspended" ? "Account suspended and signed out everywhere" : "Account reactivated");
  },
);

export const revokeAllSessionsAction = createFormAction(z.object({ userId: f.uuid() }), async ({ userId }) => {
  const ctx = await requireStaff("users.security");
  await revokeAllUserSessions(ctx, userId);
  refresh(userId);
  return ok(undefined, "Signed out of every device");
});

export const revokeSessionAction = createFormAction(z.object({ userId: f.uuid(), sessionKey: z.string().max(16) }), async ({ userId, sessionKey }) => {
  const ctx = await requireStaff("users.security");
  await revokeUserSession(ctx, userId, sessionKey);
  refresh(userId);
  return ok(undefined, "Session ended");
});

export const resetTwoFactorAction = createFormAction(z.object({ userId: f.uuid(), reason: f.text({ label: "Reason", max: 1000 }) }), async ({ userId, reason }) => {
  const ctx = await requireStaff("users.security");
  await resetUserTwoFactor(ctx, userId, reason);
  refresh(userId);
  return ok(undefined, "Two-factor authentication reset. The person sets it up again at next sign-in.");
});

export const setStaffRolesAction = createFormAction(z.object({ userId: f.uuid(), roleIds: f.stringArray().pipe(z.array(z.uuid()).max(20)) }), async ({ userId, roleIds }) => {
  const ctx = await requireStaff("users.roles");
  await setStaffRoles(ctx, userId, roleIds);
  refresh(userId);
  return ok(undefined, roleIds.length ? "Roles saved" : "Staff access removed");
});

export const createStaffUserAction = createFormAction(
  z.object({ displayName: f.text({ label: "Name", max: 120 }), email: f.email(), roleIds: f.stringArray().pipe(z.array(z.uuid()).max(20)) }),
  async (input) => {
    const ctx = await requireStaff("users.roles");
    const result = await createStaffUser(ctx, input);
    let sent = true;
    try {
      // The identity module's reset flow e-mails a single-use link to set a password (rate limited).
      await requestPasswordReset({ kind: "email", value: input.email.trim().toLowerCase() });
    } catch (error) {
      sent = false;
      logger.warn("Staff onboarding link not sent", { error: error instanceof ActionError ? error.message : "unknown" });
    }
    refresh(result.id);
    const tail = sent ? "A link to set their password has been e-mailed." : "The set-password e-mail could not be sent; ask them to use “Forgot password”.";
    return ok({ id: result.id }, `${result.created ? "Staff account created" : "Existing account added to the team"}. ${tail}`);
  },
);
