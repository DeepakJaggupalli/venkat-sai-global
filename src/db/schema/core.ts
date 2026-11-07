/**
 * Core spine tables referenced by every domain: users, organizations, files.
 * Layer 2 — may import only: taxonomy.
 *
 * They live in one file because they reference each other (avatar/logo → files,
 * files → owner user / organization) and cross-file cycles are not allowed.
 */
import { bigint, boolean, char, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { FILE_PURPOSES, FILE_SCAN_STATUSES, FILE_VISIBILITIES, ORG_STATUSES, ORG_TYPES, USER_STATUSES } from "./_constants";
import { countryCode, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { countries, industries } from "./taxonomy";

/**
 * Every person who can sign in: candidates, employer users, partner users,
 * institution users and Venkat Sai staff. A person can hold several of these
 * capacities at once (portal access is derived, see src/modules/identity).
 */
export const users = pgTable(
  "users",
  {
    id: pk(),
    /** Lower-cased, trimmed. Nullable: phone-only accounts are allowed. */
    email: text(),
    emailVerifiedAt: tstz(),
    /** E.164 format (+919876543210). Nullable: email-only accounts are allowed. */
    phone: text(),
    phoneVerifiedAt: tstz(),
    /** argon2id hash. Null for OTP-only or Google-only accounts. */
    passwordHash: text(),
    passwordChangedAt: tstz(),
    displayName: text().notNull(),
    /** Soft reference to files.id (purpose = avatar). */
    avatarFileId: uuid(),
    status: text({ enum: USER_STATUSES }).notNull().default("active"),
    statusReason: text(),
    /** Venkat Sai team member (platform roles are in user_roles). */
    isStaff: boolean().notNull().default(false),
    locale: text().notNull().default("en"),
    timezone: text(),
    /** UI / notification preferences (theme, digest frequency, etc.). */
    preferences: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    signupSource: text(),
    lastLoginAt: tstz(),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: tstz(),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_phone_uq").on(t.phone),
    index("users_status_idx").on(t.status),
    index("users_staff_idx").on(t.isStaff),
    // Operator class via .op(): an SQL expression here makes drizzle-kit push re-create the index every run.
    index("users_display_name_trgm_idx").using("gin", t.displayName.op("gin_trgm_ops")),
  ],
);

/**
 * Employers, recruitment partners and institutions/training providers.
 * Venkat Sai itself is the platform operator and is NOT an organization row.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: pk(),
    type: text({ enum: ORG_TYPES }).notNull(),
    name: text().notNull(),
    legalName: text(),
    slug: text().notNull(),
    description: text(),
    websiteUrl: text(),
    email: text(),
    phone: text(),
    /** Soft reference to files.id (purpose = org_logo). */
    logoFileId: uuid(),
    industryId: uuid().references(() => industries.id, { onDelete: "set null" }),
    countryCode: countryCode().references(() => countries.code),
    stateRegion: text(),
    city: text(),
    addressLine1: text(),
    addressLine2: text(),
    postalCode: text(),
    /** Company / society / trust registration number (CIN, etc.). */
    registrationNumber: text(),
    /** Tax identifier (GSTIN, VAT, TRN...). */
    taxId: text(),
    status: text({ enum: ORG_STATUSES }).notNull().default("draft"),
    statusReason: text(),
    verifiedAt: tstz(),
    verificationExpiresAt: tstz(),
    suspendedAt: tstz(),
    /** Public profile page enabled (employer pages, institution pages). */
    isPublic: boolean().notNull().default(false),
    /** Venkat Sai account manager / relationship owner (staff user). */
    accountManagerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("organizations_slug_uq").on(t.slug),
    index("organizations_type_status_idx").on(t.type, t.status),
    index("organizations_country_idx").on(t.countryCode),
    index("organizations_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

/**
 * Every uploaded or generated binary. Bytes live in the storage driver
 * (local disk / S3-compatible); this row is the metadata + access anchor.
 * Private files are only served through /api/v1/files/[id] after an access check.
 */
export const files = pgTable(
  "files",
  {
    id: pk(),
    storageDriver: text({ enum: ["local", "s3", "blob"] }).notNull(),
    storageKey: text().notNull(),
    originalName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    sha256: char({ length: 64 }).notNull(),
    visibility: text({ enum: FILE_VISIBILITIES }).notNull().default("private"),
    purpose: text({ enum: FILE_PURPOSES }).notNull(),
    ownerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    scanStatus: text({ enum: FILE_SCAN_STATUSES }).notNull().default("pending"),
    scannedAt: tstz(),
    scanDetail: text(),
    width: integer(),
    height: integer(),
    /** Image variants: { thumb: { key, width, height, mimeType }, md: {...}, lg: {...} } */
    variants: jsonb().$type<Record<string, { key: string; width: number; height: number; mimeType: string }>>().notNull().default(emptyJsonObject),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("files_storage_key_uq").on(t.storageKey),
    index("files_owner_idx").on(t.ownerUserId),
    index("files_org_idx").on(t.organizationId),
    index("files_purpose_idx").on(t.purpose),
    index("files_sha256_idx").on(t.sha256),
  ],
);
