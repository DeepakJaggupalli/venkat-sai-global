import "server-only";

/**
 * Public write API of the identity module (business rules live in the files re-exported here).
 * Pages and actions import from "@/modules/identity/service"; see README.md for each function.
 */
export { registerAccount, completeSignupVerification, recordSignupConsents, currentPolicyVersions } from "./registration";
export { signInWithPassword, requestLoginOtp, completeLoginOtp, resendFlowCode, completeTwoFactorChallenge } from "./sign-in";
export { requestPasswordReset, inspectPasswordResetToken, resetPasswordWithToken, resetPasswordWithCode, type ResetTokenStatus } from "./password-reset";
export {
  updateAccountBasics,
  changePassword,
  requestContactChange,
  confirmContactChange,
  requestContactVerification,
  confirmContactVerification,
  revokeSession,
  signOutEverywhere,
  isValidTimeZone,
  type AccountActor,
} from "./account";
export { beginTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor, regenerateRecoveryCodes, getTwoFactorStatus } from "./two-factor";
export { startGoogleSignIn, completeGoogleSignIn, disconnectGoogle, listConnectedAccounts, canSignInWithoutGoogle, type GoogleStartParams } from "./google-sign-in";
export { establishSession, recordSuccessfulLogin, postAuthDestination, sendSecurityAlert, type SecurityAlertKind } from "./login";
