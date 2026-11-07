"use server";

import { redirect } from "next/navigation";

import { logSecurityEvent } from "@/modules/audit";
import { getCurrentSession, invalidateCurrentSession } from "@/modules/identity/session";
import { invitationPath } from "@/modules/organizations/paths";

/**
 * "Use a different account" on the invitation page: signs out this device and opens sign-in with the
 * invitation as the return address, so the invited person can sign in (or sign up) with the invited
 * email. Server Actions are CSRF-protected by Next.js.
 */
export async function switchAccountForInvitationAction(formData: FormData): Promise<void> {
  const raw = formData.get("token");
  const token = typeof raw === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(raw) ? raw : null;
  const current = await getCurrentSession();
  await invalidateCurrentSession();
  if (current) await logSecurityEvent({ userId: current.user.id, type: "signed_out", metadata: { reason: "invitation_switch_account" } });
  redirect(token ? `/sign-in?returnTo=${encodeURIComponent(invitationPath(token))}` : "/sign-in");
}
