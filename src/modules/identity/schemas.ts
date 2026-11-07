import { z } from "zod";

import { f, normalizePhone, parseIdentifier } from "@/lib/validation";

import { isSignupIntent, OTP_LENGTH, PASSWORD_MAX_LENGTH, SIGNUP_INTENTS, type Contact } from "./types";

/**
 * Zod schemas for every identity form (client-safe).
 *
 * Error messages are translation keys in the "auth" namespace (e.g. "validation.code_invalid").
 * Server actions translate them before returning, so the client always receives readable text.
 */

const returnToField = z.string().trim().max(2000).optional();

/** Unknown or tampered intents silently become "no intent". */
const intentField = z.preprocess((v) => (isSignupIntent(v) ? v : undefined), z.enum(SIGNUP_INTENTS).optional());

/** "Email or phone (with country code)" → normalised contact. */
export const identifierField = z
  .string({ error: "validation.identifier_required" })
  .trim()
  .min(1, "validation.identifier_required")
  .max(254, "validation.identifier_invalid")
  .transform((value, ctx): Contact => {
    const parsed = parseIdentifier(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "validation.identifier_invalid" });
      return z.NEVER;
    }
    return parsed;
  });

/** 6-digit one-time code; spaces and hyphens typed by the user are ignored. */
export const otpCodeField = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z
    .string({ error: "validation.code_required" })
    .min(1, "validation.code_required")
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), "validation.code_invalid"),
);

const passwordField = z
  .string({ error: "validation.password_required" })
  .min(1, "validation.password_required")
  .max(PASSWORD_MAX_LENGTH, "validation.password_too_long");

const optionalPasswordField = z.string().max(PASSWORD_MAX_LENGTH, "validation.password_too_long").optional();

export const displayNameField = z
  .string({ error: "validation.name_required" })
  .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, "validation.name_too_short").max(100, "validation.name_too_long"));

function newPasswordShape() {
  return {
    newPassword: passwordField,
    confirmPassword: z.string({ error: "validation.confirm_required" }).min(1, "validation.confirm_required"),
  };
}

function passwordsMatch<T extends { newPassword: string; confirmPassword: string }>(value: T, ctx: z.RefinementCtx): void {
  if (value.newPassword !== value.confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "validation.passwords_mismatch" });
  }
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export const signInPasswordSchema = z.object({
  identifier: identifierField,
  password: passwordField,
  returnTo: returnToField,
  intent: intentField,
});

export const requestLoginOtpSchema = z.object({
  identifier: identifierField,
  returnTo: returnToField,
  intent: intentField,
});

/** /verify (sign-up and one-time-code sign-in). */
export const verifyCodeSchema = z.object({ code: otpCodeField });

/** /sign-in/two-factor: authenticator code or a recovery code. */
export const twoFactorChallengeSchema = z
  .object({
    method: z.enum(["totp", "recovery"]).default("totp"),
    code: z.string().trim().max(64).optional(),
    recoveryCode: z.string().trim().max(64).optional(),
    returnTo: returnToField,
  })
  .superRefine((v, ctx) => {
    if (v.method === "totp") {
      const code = (v.code ?? "").replace(/[\s-]/g, "");
      if (!code) ctx.addIssue({ code: "custom", path: ["code"], message: "validation.code_required" });
      else if (!/^\d{6}$/.test(code)) ctx.addIssue({ code: "custom", path: ["code"], message: "validation.code_invalid" });
    } else if (!v.recoveryCode || v.recoveryCode.replace(/[\s-]/g, "").length < 8) {
      ctx.addIssue({ code: "custom", path: ["recoveryCode"], message: "validation.recovery_code_invalid" });
    }
  })
  .transform((v) => ({
    method: v.method,
    code: v.method === "totp" ? (v.code ?? "").replace(/[\s-]/g, "") : (v.recoveryCode ?? ""),
    returnTo: v.returnTo ?? null,
  }));

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

export const signUpSchema = z
  .object({
    intent: intentField,
    displayName: displayNameField,
    contactMethod: z.enum(["email", "phone"], { error: "validation.contact_method_required" }),
    email: z.string().trim().max(254, "validation.email_invalid").optional(),
    phone: z.string().trim().max(32, "validation.phone_invalid").optional(),
    password: optionalPasswordField,
    acceptTerms: f.bool().refine((v) => v === true, "validation.terms_required"),
    acceptPrivacy: f.bool().refine((v) => v === true, "validation.privacy_required"),
    marketingEmail: f.bool(),
    marketingSms: f.bool(),
    whatsappUpdates: f.bool(),
    returnTo: returnToField,
  })
  .superRefine(
    (v, ctx) => {
      // Runs even when other fields failed, so every problem is reported at once.
      if (v.contactMethod === "phone") {
        if (!v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "validation.phone_required" });
        else if (!normalizePhone(v.phone)) ctx.addIssue({ code: "custom", path: ["phone"], message: "validation.phone_invalid" });
      } else if (v.contactMethod === "email") {
        if (!v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "validation.email_required" });
        else if (!z.email().safeParse(v.email.toLowerCase()).success) {
          ctx.addIssue({ code: "custom", path: ["email"], message: "validation.email_invalid" });
        }
      }
    },
    { when: () => true },
  )
  .transform((v) => {
    const contact: Contact =
      v.contactMethod === "email"
        ? { kind: "email", value: (v.email ?? "").toLowerCase() }
        : { kind: "phone", value: normalizePhone(v.phone ?? "") ?? "" };
    return {
      intent: v.intent ?? null,
      displayName: v.displayName,
      contact,
      password: v.password && v.password.length > 0 ? v.password : null,
      marketing: { email: v.marketingEmail, sms: v.marketingSms, whatsapp: v.whatsappUpdates },
      returnTo: v.returnTo ?? null,
    };
  });
export type SignUpInput = z.output<typeof signUpSchema>;

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({ identifier: identifierField });

export const resetPasswordWithTokenSchema = z
  .object({ token: z.string().trim().min(10).max(200), ...newPasswordShape() })
  .superRefine(passwordsMatch);

export const resetPasswordWithCodeSchema = z.object({ code: otpCodeField, ...newPasswordShape() }).superRefine(passwordsMatch);

// ---------------------------------------------------------------------------
// Account (signed in)
// ---------------------------------------------------------------------------

export const changePasswordSchema = z
  .object({ currentPassword: optionalPasswordField, ...newPasswordShape() })
  .superRefine(passwordsMatch);

export const accountBasicsSchema = z.object({
  displayName: displayNameField,
  locale: z.enum(["en", "hi", "te"], { error: "validation.locale_invalid" }),
  timezone: z.string().trim().max(64).optional(),
});

const contactKindField = z.enum(["email", "phone"]);

/** Step 1 of "change email / phone": the new address (+ current password when the account has one). */
export const requestContactChangeSchema = z
  .object({ kind: contactKindField, value: z.string().trim().min(1, "validation.contact_required").max(254), currentPassword: optionalPasswordField })
  .superRefine((v, ctx) => {
    if (v.kind === "email" && !z.email().safeParse(v.value.toLowerCase()).success) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "validation.email_invalid" });
    }
    if (v.kind === "phone" && !normalizePhone(v.value)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "validation.phone_invalid" });
    }
  })
  .transform((v) => ({
    kind: v.kind,
    value: v.kind === "email" ? v.value.toLowerCase() : (normalizePhone(v.value) ?? ""),
    currentPassword: v.currentPassword ?? null,
  }));

/** Step 2 of "change email / phone": the code sent to the new address. */
export const confirmContactChangeSchema = z
  .object({ kind: contactKindField, value: z.string().trim().min(1).max(254), code: otpCodeField })
  .transform((v, ctx) => {
    const value = v.kind === "email" ? v.value.toLowerCase() : normalizePhone(v.value);
    if (!value) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "validation.contact_required" });
      return z.NEVER;
    }
    return { kind: v.kind, value, code: v.code };
  });

export const requestContactVerificationSchema = z.object({ kind: contactKindField });
export const confirmContactVerificationSchema = z.object({ kind: contactKindField, code: otpCodeField });

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

export const confirmTwoFactorSetupSchema = z.object({ code: otpCodeField });

/** Turning 2FA off / regenerating recovery codes: current password OR an authenticator/recovery code. */
export const twoFactorReauthSchema = z
  .object({
    password: optionalPasswordField,
    code: z.string().trim().max(64).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.password && !v.code) ctx.addIssue({ code: "custom", path: ["code"], message: "validation.reauth_required" });
  });

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const revokeSessionSchema = z.object({ sessionId: z.string().regex(/^[a-f0-9]{24}$/, "validation.session_invalid") });

export const signOutEverywhereSchema = z.object({ includeCurrent: z.boolean().default(true) });
