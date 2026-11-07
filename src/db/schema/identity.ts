/**
 * Authentication, authorization and consent.
 * Layer 3 — may import: taxonomy, core.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { CONSENT_PURPOSES, ROLE_SCOPES } from "./_constants";
import { createdAtOnly, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { organizations, users } from "./core";

/**
 * Server-side sessions. The cookie holds a random token; `id` is
 * HMAC-SHA256(token, SESSION_SECRET) so a database leak cannot be replayed.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tstz().notNull(),
    lastSeenAt: tstz().notNull().defaultNow(),
    /** Set once the user completed TOTP for this session (required for staff when 2FA is enabled). */
    twoFactorVerifiedAt: tstz(),
    ipHash: text(),
    userAgent: text(),
    /** Active organization per portal: { employer?: uuid, recruitment_partner?: uuid, institution?: uuid } */
    activeOrgs: jsonb().$type<Partial<Record<"employer" | "recruitment_partner" | "institution", string>>>().notNull().default(emptyJsonObject),
    ...createdAtOnly,
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text({ enum: ["google"] }).notNull(),
    providerAccountId: text().notNull(),
    email: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("oauth_accounts_provider_account_uq").on(t.provider, t.providerAccountId),
    index("oauth_accounts_user_idx").on(t.userId),
  ],
);

export const VERIFICATION_PURPOSES = [
  "email_verification",
  "phone_verification",
  "login_otp",
  "signup_otp",
  "password_reset",
  "email_change",
  "phone_change",
] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

/** One-time codes (OTP) and link tokens. Only an HMAC of the secret is stored. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: pk(),
    purpose: text({ enum: VERIFICATION_PURPOSES }).notNull(),
    channel: text({ enum: ["email", "sms", "whatsapp"] }).notNull(),
    /** Normalised email or E.164 phone the code was sent to. */
    target: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    secretHash: text().notNull(),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(5),
    expiresAt: tstz().notNull(),
    consumedAt: tstz(),
    ipHash: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    ...createdAtOnly,
  },
  (t) => [
    index("verification_tokens_target_idx").on(t.target, t.purpose, t.createdAt),
    index("verification_tokens_user_idx").on(t.userId),
  ],
);

/** TOTP two-factor authentication. Secret is AES-256-GCM encrypted (src/lib/crypto.ts). */
export const userTwoFactor = pgTable("user_two_factor", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  totpSecretEncrypted: text().notNull(),
  enabledAt: tstz(),
  /** Last accepted TOTP time-step, to prevent code replay. */
  lastUsedStep: bigint({ mode: "number" }),
  /** HMAC-hashed recovery codes: [{ hash, usedAt }] */
  recoveryCodes: jsonb().$type<{ hash: string; usedAt: string | null }[]>().notNull().default(sql`'[]'::jsonb`),
  ...timestamps,
});

/**
 * Configurable roles.
 *  - scope "platform": Venkat Sai staff roles (Super Admin, Operations, Content Manager...).
 *  - scope "employer" | "recruitment_partner" | "institution": organisation member roles.
 *    organizationId NULL = default template available to every org of that type;
 *    organizationId set = custom role defined by that organisation.
 * `permissions` holds keys from src/config/permissions.ts.
 */
export const roles = pgTable(
  "roles",
  {
    id: pk(),
    scope: text({ enum: ROLE_SCOPES }).notNull(),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    /** Insert-time default: drizzle-kit cannot round-trip an empty-array DB default (docs/SCHEMA_NOTES.md). */
    permissions: text().array().notNull().$defaultFn(() => []),
    organizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    /** System roles cannot be deleted (their permissions can still be edited, except super_admin). */
    isSystem: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("roles_scope_key_org_uq").on(t.scope, t.key, t.organizationId).nullsNotDistinct(),
    index("roles_org_idx").on(t.organizationId),
  ],
);

/** Platform (staff) role assignments. Organisation roles live on organization_members. */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...createdAtOnly,
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

/**
 * Append-only consent ledger. Never update rows: withdrawal = new row with granted=false.
 * Subject is a user, or an anonymous visitor id (cookie consent before sign-in).
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: pk(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    anonymousId: text(),
    purpose: text({ enum: CONSENT_PURPOSES }).notNull(),
    granted: boolean().notNull(),
    /** Version of the notice/policy text the subject saw (CMS legal page version). */
    policyVersion: text(),
    /** Where it was captured: signup, settings, cookie_banner, application, partner_submission, admin... */
    source: text().notNull(),
    /** Optional context, e.g. the application or partner submission the consent relates to. */
    contextType: text(),
    contextId: uuid(),
    /** For delegated capture (e.g. partner recorded consent on behalf of a candidate). */
    capturedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    evidence: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    ipHash: text(),
    ...createdAtOnly,
  },
  (t) => [
    index("consent_records_user_purpose_idx").on(t.userId, t.purpose, t.createdAt),
    index("consent_records_anon_idx").on(t.anonymousId, t.purpose, t.createdAt),
    index("consent_records_context_idx").on(t.contextType, t.contextId),
  ],
);
