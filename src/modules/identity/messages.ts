import "server-only";

import { BRAND } from "@/config/site";
import { DEFAULT_LOCALE, isLocale, translate, type Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import type { EmailMessage, SmsMessage } from "@/modules/messaging";

import type { OtpChannel, OtpPurpose } from "./types";

/**
 * Localised one-time-code and password-reset messages. These are sent directly through
 * the messaging transports (never through notify()): codes must arrive immediately and are
 * not subject to notification preferences. Codes are never logged.
 */

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Built-in English copy, so a missing catalogue entry can never produce a message without its code. */
const BUILT_IN_ENGLISH: Record<string, string> = {
  "otpMessage.subject": "Your {brand} verification code",
  "otpMessage.intro.signup_otp": "Use this code to finish creating your {brand} account:",
  "otpMessage.intro.login_otp": "Use this code to sign in to {brand}:",
  "otpMessage.intro.email_verification": "Use this code to verify your email address:",
  "otpMessage.intro.phone_verification": "Use this code to verify your mobile number:",
  "otpMessage.intro.password_reset": "Use this code to reset your {brand} password:",
  "otpMessage.intro.email_change": "Use this code to confirm your new email address:",
  "otpMessage.intro.phone_change": "Use this code to confirm your new mobile number:",
  "otpMessage.expiry": "The code expires in {minutes} minutes.",
  "otpMessage.warning": "Never share this code with anyone. {brand} staff will never ask for it.",
  "otpMessage.ignore": "If you didn't request this, you can ignore this message.",
  "otpMessage.sms": "{code} is your {brand} code. It expires in {minutes} minutes. Never share it with anyone.",
  "resetMessage.subject": "Reset your {brand} password",
  "resetMessage.greeting": "Hello {name},",
  "resetMessage.intro": "We received a request to reset your password. Use the button below to choose a new one.",
  "resetMessage.button": "Choose a new password",
  "resetMessage.expiry": "This link expires in {minutes} minutes and can be used once.",
  "resetMessage.linkHint": "If the button doesn't work, copy this link into your browser:",
  "resetMessage.ignore": "If you didn't ask to reset your password, ignore this email. Your password will not change.",
};

function tr(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  return translate(MESSAGES[locale]?.auth ?? {}, { ...BUILT_IN_ENGLISH, ...MESSAGES[DEFAULT_LOCALE].auth }, key, vars, locale);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function emailShell(locale: Locale, rows: string[]): string {
  return [
    "<!doctype html>",
    `<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`,
    '<body style="margin:0;padding:24px 12px;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#13203a">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ef;border-radius:12px">',
    `<tr><td style="padding:24px 24px 0;font-size:18px;font-weight:700;color:#101c35">${escapeHtml(BRAND.name)}</td></tr>`,
    ...rows,
    "</table></body></html>",
  ].join("");
}

export type OtpDelivery = { channel: "email"; message: EmailMessage } | { channel: "sms"; message: SmsMessage };

export function buildOtpDelivery(input: {
  purpose: OtpPurpose;
  channel: OtpChannel;
  to: string;
  code: string;
  minutes: number;
  locale: Locale;
}): OtpDelivery {
  const { purpose, code, minutes, locale } = input;
  const vars = { brand: BRAND.name, minutes, code };

  if (input.channel === "sms") {
    return {
      channel: "sms",
      message: {
        to: input.to,
        body: tr(locale, "otpMessage.sms", vars),
        // Template-based SMS providers (e.g. DLT-registered templates) use these instead of the body.
        variables: { otp: code, minutes: String(minutes), purpose },
      },
    };
  }

  const intro = tr(locale, `otpMessage.intro.${purpose}`, vars);
  const expiry = tr(locale, "otpMessage.expiry", vars);
  const warning = tr(locale, "otpMessage.warning", vars);
  const ignore = tr(locale, "otpMessage.ignore", vars);
  const html = emailShell(locale, [
    `<tr><td style="padding:16px 24px 0;font-size:15px;line-height:1.5">${escapeHtml(intro)}</td></tr>`,
    `<tr><td style="padding:16px 24px"><div style="font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#101c35">${escapeHtml(code)}</div></td></tr>`,
    `<tr><td style="padding:0 24px 16px;font-size:14px;line-height:1.5;color:#5b677d">${escapeHtml(expiry)}<br>${escapeHtml(warning)}</td></tr>`,
    `<tr><td style="padding:16px 24px 24px;border-top:1px solid #e3e8ef;font-size:12px;line-height:1.5;color:#5b677d">${escapeHtml(ignore)}</td></tr>`,
  ]);
  return {
    channel: "email",
    message: {
      to: input.to,
      subject: tr(locale, "otpMessage.subject", vars),
      text: [intro, "", code, "", expiry, warning, "", ignore].join("\n"),
      html,
      tags: ["auth", `otp:${purpose}`],
    },
  };
}

export function buildPasswordResetEmail(input: { to: string; name: string; link: string; minutes: number; locale: Locale }): EmailMessage {
  const { locale } = input;
  const vars = { brand: BRAND.name, minutes: input.minutes, name: input.name };
  const greeting = tr(locale, "resetMessage.greeting", vars);
  const intro = tr(locale, "resetMessage.intro", vars);
  const button = tr(locale, "resetMessage.button", vars);
  const expiry = tr(locale, "resetMessage.expiry", vars);
  const linkHint = tr(locale, "resetMessage.linkHint", vars);
  const ignore = tr(locale, "resetMessage.ignore", vars);
  const href = escapeHtml(input.link);
  const html = emailShell(locale, [
    `<tr><td style="padding:16px 24px 0;font-size:15px;line-height:1.5">${escapeHtml(greeting)}<br><br>${escapeHtml(intro)}</td></tr>`,
    `<tr><td style="padding:20px 24px"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#101c35;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(button)}</a></td></tr>`,
    `<tr><td style="padding:0 24px 16px;font-size:14px;line-height:1.5;color:#5b677d">${escapeHtml(expiry)}<br><br>${escapeHtml(linkHint)}<br><a href="${href}" style="color:#0b7c78;word-break:break-all">${href}</a></td></tr>`,
    `<tr><td style="padding:16px 24px 24px;border-top:1px solid #e3e8ef;font-size:12px;line-height:1.5;color:#5b677d">${escapeHtml(ignore)}</td></tr>`,
  ]);
  return {
    to: input.to,
    subject: tr(locale, "resetMessage.subject", vars),
    text: [greeting, "", intro, "", input.link, "", expiry, "", ignore].join("\n"),
    html,
    tags: ["auth", "password_reset"],
  };
}
