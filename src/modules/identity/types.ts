/**
 * Identity constants and types shared by server code, forms and client components.
 * Client-safe: this file must never import server-only code.
 */

/** Why someone is creating an account; drives the post-sign-up destination. */
export const SIGNUP_INTENTS = ["candidate", "employer", "partner", "institution"] as const;
export type SignupIntent = (typeof SIGNUP_INTENTS)[number];

export function isSignupIntent(value: unknown): value is SignupIntent {
  return typeof value === "string" && (SIGNUP_INTENTS as readonly string[]).includes(value);
}

/** Mirrors VERIFICATION_PURPOSES in src/db/schema/identity.ts (checked at compile time in otp.ts). */
export const OTP_PURPOSES = [
  "email_verification",
  "phone_verification",
  "login_otp",
  "signup_otp",
  "password_reset",
  "email_change",
  "phone_change",
] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/** Delivery channel for one-time codes (WhatsApp is not used for codes). */
export type OtpChannel = "email" | "sms";

/** An email address or an E.164 phone number. */
export type ContactKind = "email" | "phone";
export type Contact = { kind: ContactKind; value: string };

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_LINK_TTL_MINUTES = 30;
export const RECOVERY_CODE_COUNT = 10;
/** Hard upper bound for any password we hash (argon2 cost protection). */
export const PASSWORD_MAX_LENGTH = 128;

/** Multi-step sign-up / sign-in / reset flows that continue on /verify or /reset-password. */
export type AuthFlowKind = "signup" | "login" | "reset";

/** How a session was established (security log + new-device alerts). */
export type AuthMethod = "password" | "otp" | "signup_otp" | "google" | "two_factor";

/** Data for the 2FA setup wizard (secret is shown once for manual entry). */
export type TwoFactorSetupData = {
  otpauthUri: string;
  qrCodeDataUrl: string;
  /** Base32 secret grouped in blocks of four for manual entry. */
  manualKey: string;
};

/** One row of the "Active sessions" list. `id` is a public id derived from the session id. */
export type SessionListItem = {
  id: string;
  current: boolean;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  browser: string;
  os: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  twoFactorVerified: boolean;
};

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: Date | null;
  recoveryCodesRemaining: number;
  /** A setup was started but not confirmed yet. */
  pendingSetup: boolean;
};

export type AccountOverview = {
  id: string;
  displayName: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  locale: string;
  timezone: string | null;
  hasPassword: boolean;
  passwordChangedAt: Date | null;
  isStaff: boolean;
  createdAt: Date;
};

export type ConnectedAccount = {
  provider: "google";
  email: string | null;
  linkedAt: Date;
};
