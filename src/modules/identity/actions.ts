"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getT } from "@/i18n/server";
import { ok } from "@/lib/actions";

import { authAction, authFormAction } from "./action-utils";
import { AuthError } from "./errors";
import { readAuthFlow } from "./flow";
import {
  accountBasicsSchema,
  changePasswordSchema,
  confirmContactChangeSchema,
  confirmContactVerificationSchema,
  confirmTwoFactorSetupSchema,
  forgotPasswordSchema,
  requestContactChangeSchema,
  requestContactVerificationSchema,
  requestLoginOtpSchema,
  resetPasswordWithCodeSchema,
  resetPasswordWithTokenSchema,
  revokeSessionSchema,
  signInPasswordSchema,
  signOutEverywhereSchema,
  signUpSchema,
  twoFactorChallengeSchema,
  twoFactorReauthSchema,
  verifyCodeSchema,
} from "./schemas";
import {
  beginTwoFactorSetup,
  changePassword,
  completeLoginOtp,
  completeSignupVerification,
  completeTwoFactorChallenge,
  confirmContactChange,
  confirmContactVerification,
  confirmTwoFactorSetup,
  disableTwoFactor,
  disconnectGoogle,
  regenerateRecoveryCodes,
  registerAccount,
  requestContactChange,
  requestContactVerification,
  requestLoginOtp,
  requestPasswordReset,
  resendFlowCode,
  resetPasswordWithCode,
  resetPasswordWithToken,
  revokeSession,
  signInWithPassword,
  signOutEverywhere,
  updateAccountBasics,
  type AccountActor,
} from "./service";
import { getCurrentSession, requireUser } from "./session";

/**
 * Server Actions for the auth screens (/sign-in, /sign-up, /verify, /forgot-password,
 * /reset-password, /sign-in/two-factor) and the account pages (/account, /account/security).
 * Thin: validate → authorise → call the service → revalidate / redirect.
 */

async function requireActor(returnTo: string): Promise<AccountActor> {
  const user = await requireUser({ returnTo });
  const current = await getCurrentSession();
  if (!current) redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  return { user, sessionId: current.session.id };
}

// ---------------------------------------------------------------------------
// Sign-in / sign-up
// ---------------------------------------------------------------------------

export const signInWithPasswordAction = authFormAction(signInPasswordSchema, async (input) => {
  const { redirectTo } = await signInWithPassword(input);
  redirect(redirectTo);
});

export const requestLoginOtpAction = authFormAction(requestLoginOtpSchema, async (input) => {
  await requestLoginOtp(input);
  redirect("/verify");
});

export const signUpAction = authFormAction(signUpSchema, async (input) => {
  await registerAccount(input);
  redirect("/verify");
});

export const verifyCodeAction = authFormAction(verifyCodeSchema, async ({ code }) => {
  const flow = await readAuthFlow();
  if (!flow || flow.kind === "reset") throw new AuthError("flow_expired");
  const next = flow.kind === "signup" ? await completeSignupVerification(code) : await completeLoginOtp(code);
  redirect(next);
});

export const resendCodeAction = authAction(z.object({ flow: z.enum(["verify", "reset"]) }), async ({ flow }) => {
  const result = await resendFlowCode(flow === "verify" ? ["signup", "login"] : ["reset"]);
  const t = await getT("auth");
  return ok(result, t("verify.resent"));
});

export const twoFactorChallengeAction = authFormAction(twoFactorChallengeSchema, async (input) => {
  let next: string;
  try {
    next = await completeTwoFactorChallenge(input);
  } catch (error) {
    if (error instanceof AuthError && error.authCode === "session_expired") redirect("/sign-in");
    throw error;
  }
  redirect(next);
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export const forgotPasswordAction = authFormAction(forgotPasswordSchema, async ({ identifier }) => {
  const { channel } = await requestPasswordReset(identifier);
  if (channel === "sms") redirect("/reset-password");
  const t = await getT("auth");
  return ok({ channel }, t("forgot.emailSent"));
});

export const resetPasswordWithTokenAction = authFormAction(resetPasswordWithTokenSchema, async (input) => {
  await resetPasswordWithToken(input.token, input.newPassword);
  redirect("/sign-in?reset=1");
});

export const resetPasswordWithCodeAction = authFormAction(resetPasswordWithCodeSchema, async (input) => {
  await resetPasswordWithCode(input.code, input.newPassword);
  redirect("/sign-in?reset=1");
});

// ---------------------------------------------------------------------------
// Account basics, email / phone
// ---------------------------------------------------------------------------

export const updateAccountBasicsAction = authFormAction(accountBasicsSchema, async (input) => {
  const user = await requireUser({ returnTo: "/account" });
  await updateAccountBasics(user, input);
  revalidatePath("/account");
  const t = await getT("auth");
  return ok(undefined, t("account.profile.saved"));
});

export const requestContactChangeAction = authFormAction(requestContactChangeSchema, async (input) => {
  const user = await requireUser({ returnTo: "/account" });
  const result = await requestContactChange(user, input);
  const t = await getT("auth");
  return ok({ ...result, kind: input.kind, value: input.value }, t("account.contact.codeSent"));
});

export const confirmContactChangeAction = authFormAction(confirmContactChangeSchema, async (input) => {
  const user = await requireUser({ returnTo: "/account" });
  await confirmContactChange(user, input);
  revalidatePath("/account");
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(undefined, t(input.kind === "email" ? "account.contact.emailChanged" : "account.contact.phoneChanged"));
});

export const requestContactVerificationAction = authAction(requestContactVerificationSchema, async ({ kind }) => {
  const user = await requireUser({ returnTo: "/account" });
  const result = await requestContactVerification(user, kind);
  const t = await getT("auth");
  return ok(result, t("account.contact.codeSent"));
});

export const confirmContactVerificationAction = authFormAction(confirmContactVerificationSchema, async ({ kind, code }) => {
  const user = await requireUser({ returnTo: "/account" });
  await confirmContactVerification(user, kind, code);
  revalidatePath("/account");
  const t = await getT("auth");
  return ok(undefined, t(kind === "email" ? "account.contact.emailVerified" : "account.contact.phoneVerified"));
});

// ---------------------------------------------------------------------------
// Password, two-factor, sessions, connected accounts
// ---------------------------------------------------------------------------

export const changePasswordAction = authFormAction(changePasswordSchema, async (input) => {
  const actor = await requireActor("/account/security");
  const { mode } = await changePassword(actor, input);
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok({ mode }, t(mode === "set" ? "security.password.setDone" : "security.password.changedDone"));
});

export const beginTwoFactorSetupAction = authAction(z.object({}), async () => {
  const user = await requireUser({ returnTo: "/account/security" });
  return ok(await beginTwoFactorSetup(user));
});

export const confirmTwoFactorSetupAction = authFormAction(confirmTwoFactorSetupSchema, async ({ code }) => {
  const actor = await requireActor("/account/security");
  const result = await confirmTwoFactorSetup(actor, code);
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(result, t("security.twoFactor.enabledDone"));
});

export const disableTwoFactorAction = authFormAction(twoFactorReauthSchema, async (input) => {
  const user = await requireUser({ returnTo: "/account/security" });
  await disableTwoFactor(user, input);
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(undefined, t("security.twoFactor.disabledDone"));
});

export const regenerateRecoveryCodesAction = authFormAction(twoFactorReauthSchema, async (input) => {
  const user = await requireUser({ returnTo: "/account/security" });
  const result = await regenerateRecoveryCodes(user, input);
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(result, t("security.twoFactor.regeneratedDone"));
});

export const revokeSessionAction = authAction(revokeSessionSchema, async ({ sessionId }) => {
  const actor = await requireActor("/account/security");
  await revokeSession(actor, sessionId);
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(undefined, t("security.sessions.revokedDone"));
});

export const signOutEverywhereAction = authAction(signOutEverywhereSchema, async ({ includeCurrent }) => {
  const actor = await requireActor("/account/security");
  await signOutEverywhere(actor, { includeCurrent });
  if (includeCurrent) redirect("/sign-in?signedOut=1");
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(undefined, t("security.sessions.othersSignedOut"));
});

export const disconnectGoogleAction = authAction(z.object({}), async () => {
  const user = await requireUser({ returnTo: "/account/security" });
  await disconnectGoogle(user);
  revalidatePath("/account/security");
  const t = await getT("auth");
  return ok(undefined, t("security.connected.disconnectedDone"));
});
