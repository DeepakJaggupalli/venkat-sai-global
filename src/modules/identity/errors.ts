import "server-only";

import { translate } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { ActionError } from "@/lib/actions";

/**
 * Expected, user-facing identity failures. Each code has a translated message under
 * "errors.<code>" in src/i18n/messages/<locale>/auth.json; the English text doubles as the
 * error's `message` (logs, tests). Server actions translate it into the visitor's language.
 */
export const AUTH_ERROR_CODES = [
  "generic",
  "invalid_credentials",
  "account_locked",
  "too_many_attempts",
  "account_unavailable",
  "email_otp_disabled",
  "phone_otp_disabled",
  "phone_signup_disabled",
  "otp_cooldown",
  "otp_rate_limited",
  "otp_delivery_failed",
  "otp_invalid",
  "otp_expired",
  "otp_too_many_attempts",
  "flow_expired",
  "weak_password_short",
  "weak_password_long",
  "weak_password_common",
  "weak_password_variety",
  "weak_password_email",
  "weak_password_name",
  "password_reused",
  "current_password_required",
  "current_password_invalid",
  "reset_link_invalid",
  "reset_link_expired",
  "sms_reset_disabled",
  "contact_in_use",
  "contact_unchanged",
  "contact_missing",
  "contact_already_verified",
  "two_factor_invalid",
  "two_factor_already_enabled",
  "two_factor_not_enabled",
  "two_factor_setup_missing",
  "two_factor_required_for_staff",
  "reauth_failed",
  "session_expired",
  "session_not_found",
  "cannot_revoke_current",
  "google_unavailable",
  "google_failed",
  "google_cancelled",
  "google_email_unverified",
  "google_email_conflict",
  "google_already_linked",
  "google_disconnect_blocked",
  "timezone_invalid",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthErrorVars = Record<string, string | number>;

export function authErrorMessage(code: AuthErrorCode, vars?: AuthErrorVars, locale: keyof typeof MESSAGES = "en"): string {
  return translate(MESSAGES[locale]?.auth ?? {}, MESSAGES.en.auth, `errors.${code}`, vars, locale);
}

export class AuthError extends ActionError {
  readonly authCode: AuthErrorCode;
  readonly vars: AuthErrorVars;
  /** Form field the error belongs to (rendered inline as well as in the form alert). */
  readonly field: string | null;

  constructor(code: AuthErrorCode, opts: { vars?: AuthErrorVars; field?: string } = {}) {
    super(authErrorMessage(code, opts.vars), { code });
    this.name = "AuthError";
    this.authCode = code;
    this.vars = opts.vars ?? {};
    this.field = opts.field ?? null;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
