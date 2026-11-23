import { z } from "zod";

import { f, normalizePhone, parseIdentifier } from "@/lib/validation";

import { COMPANY_SIZE_BANDS, INSTITUTION_KINDS, PARTNER_BUSINESS_TYPES } from "@/modules/organizations/constants";
import { signupOrganizationSchema, type SignupOrganizationInput } from "@/modules/organizations/schemas";

import {
  employerKindForIntent,
  isSignupIntent,
  ORGANIZATION_SIGNUP_INTENTS,
  orgTypeForIntent,
  OTP_LENGTH,
  PASSWORD_MAX_LENGTH,
  SIGNUP_INTENTS,
  type Contact,
  type SignupIntent,
} from "./types";

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
export type SignUpInput = z.output<typeof signUpSchema> & { organization?: SignupOrganizationInput | null };

const optionalTextField = (max: number) => z.string().trim().max(max, "validation.too_long").optional();

/** "example.com" → "https://example.com" (the canonical organisation schema wants a full link). */
const websiteField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() && !/^[a-z][a-z0-9+.-]*:/i.test(v.trim()) ? `https://${v.trim()}` : v),
  z.string().trim().max(500, "validation.too_long").optional(),
);

/** Fields of step 1 ("Organisation details"); the form returns to that step when one of them is invalid. */
export const ORGANIZATION_SIGNUP_STEP1_FIELDS = [
  "orgName",
  "businessType",
  "countryCode",
  "stateRegion",
  "city",
  "addressLine1",
  "websiteUrl",
  "registrationNumber",
  "licenceNumber",
  "companySize",
  "displayName",
  "designation",
] as const;

/** Canonical organisation fields (organizations/schemas) → sign-up form field names. */
const ORGANIZATION_FIELD_FOR: Record<string, string> = { name: "orgName", representativeTitle: "designation", partnerBusinessType: "businessType", institutionKind: "businessType" };

/**
 * Sign-up of a company / HR team, travel agency, recruitment partner or training institute: the organisation
 * details (step 1), then the contact person's login — email, mobile number and password (step 2). The email is
 * verified with a code like any sign-up; the organisation is validated with the organisations module's own schema.
 */
export const organizationSignUpSchema = z
  .object({
    intent: z.enum(ORGANIZATION_SIGNUP_INTENTS, { error: "validation.account_type_required" }),
    orgName: z.string({ error: "validation.org_name_required" }).trim().min(2, "validation.org_name_required").max(200, "validation.too_long"),
    businessType: z.string().trim().optional(),
    countryCode: z.string({ error: "validation.country_required" }).trim().length(2, "validation.country_required").toUpperCase(),
    stateRegion: optionalTextField(120),
    city: z.string({ error: "validation.city_required" }).trim().min(1, "validation.city_required").max(120, "validation.too_long"),
    addressLine1: optionalTextField(200),
    websiteUrl: websiteField,
    registrationNumber: optionalTextField(100),
    licenceNumber: optionalTextField(100),
    companySize: z.string().trim().optional(),
    displayName: displayNameField,
    designation: z.string({ error: "validation.designation_required" }).trim().min(2, "validation.designation_required").max(120, "validation.too_long"),
    email: z.string({ error: "validation.email_required" }).trim().min(1, "validation.email_required").max(254, "validation.email_invalid"),
    phone: z.string({ error: "validation.phone_required" }).trim().min(1, "validation.phone_required").max(32, "validation.phone_invalid"),
    password: passwordField,
    acceptTerms: f.bool().refine((v) => v === true, "validation.terms_required"),
    acceptPrivacy: f.bool().refine((v) => v === true, "validation.privacy_required"),
    marketingEmail: f.bool(),
    marketingSms: f.bool(),
    whatsappUpdates: f.bool(),
    returnTo: returnToField,
  })
  .superRefine(
    (v, ctx) => {
      if (v.email && !z.email().safeParse(v.email.toLowerCase()).success) ctx.addIssue({ code: "custom", path: ["email"], message: "validation.email_invalid" });
      if (v.phone && !normalizePhone(v.phone)) ctx.addIssue({ code: "custom", path: ["phone"], message: "validation.phone_invalid" });
      if (v.websiteUrl && !z.url({ protocol: /^https?$/ }).safeParse(v.websiteUrl).success) {
        ctx.addIssue({ code: "custom", path: ["websiteUrl"], message: "validation.website_invalid" });
      }
      const kinds: readonly string[] | null = v.intent === "partner" ? PARTNER_BUSINESS_TYPES : v.intent === "institution" ? INSTITUTION_KINDS : null;
      if (kinds && !(v.businessType && kinds.includes(v.businessType))) ctx.addIssue({ code: "custom", path: ["businessType"], message: "validation.business_type_required" });
      if (v.companySize && !(COMPANY_SIZE_BANDS as readonly string[]).includes(v.companySize)) {
        ctx.addIssue({ code: "custom", path: ["companySize"], message: "validation.option_invalid" });
      }
    },
    { when: () => true },
  )
  .transform((v, ctx) => {
    const isEmployer = v.intent === "employer" || v.intent === "travel_agency";
    const organization = signupOrganizationSchema.safeParse({
      type: orgTypeForIntent(v.intent),
      employerKind: employerKindForIntent(v.intent),
      details: {
        name: v.orgName,
        countryCode: v.countryCode,
        stateRegion: v.stateRegion,
        city: v.city,
        addressLine1: v.addressLine1,
        websiteUrl: v.websiteUrl,
        registrationNumber: v.registrationNumber,
        email: v.email.toLowerCase(),
        phone: v.phone,
      },
      representativeTitle: v.designation,
      partnerBusinessType: v.intent === "partner" ? (v.businessType ?? null) : null,
      institutionKind: v.intent === "institution" ? (v.businessType ?? null) : null,
      companySize: isEmployer && v.companySize ? v.companySize : null,
      licenceNumber: v.intent === "partner" && v.licenceNumber ? v.licenceNumber : null,
    });
    if (!organization.success) {
      for (const issue of organization.error.issues) {
        const key = String(issue.path[0] === "details" ? (issue.path[1] ?? "orgName") : (issue.path[0] ?? "orgName"));
        ctx.addIssue({ code: "custom", path: [ORGANIZATION_FIELD_FOR[key] ?? key], message: issue.message });
      }
      return z.NEVER;
    }
    return {
      intent: v.intent as SignupIntent,
      displayName: v.displayName,
      contact: { kind: "email" as const, value: v.email.toLowerCase() },
      password: v.password,
      marketing: { email: v.marketingEmail, sms: v.marketingSms, whatsapp: v.whatsappUpdates },
      returnTo: v.returnTo ?? null,
      organization: organization.data,
    };
  });
export type OrganizationSignUpInput = z.output<typeof organizationSignUpSchema>;

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
