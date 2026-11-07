/**
 * Employer domain: the employer company profile (1:1 with organizations where type = "employer"),
 * branches / work sites, and commercial contracts between an employer and Venkat Sai.
 * Layer 6 — may import: taxonomy, core, identity, organizations, system.
 *
 * Verification state, legal name, registration / tax ids, logo, website and the registered address
 * live on `organizations`; this file only holds employer-specific data.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { countryCode, currencyCode, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { files, organizations, users } from "./core";
import { countries, currencies } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

/** Self-declared headcount bands (shown on the public employer page). */
export const COMPANY_SIZE_BANDS = ["1_10", "11_50", "51_200", "201_500", "501_1000", "1001_5000", "5001_10000", "10001_plus"] as const;
export type CompanySizeBand = (typeof COMPANY_SIZE_BANDS)[number];

/** Social profiles an organisation may link from its public page (the website is organizations.websiteUrl). */
export const ORG_SOCIAL_LINK_KEYS = ["linkedin", "facebook", "instagram", "x", "youtube", "whatsapp"] as const;
export type OrgSocialLinkKey = (typeof ORG_SOCIAL_LINK_KEYS)[number];
/** Absolute https URLs keyed by network (validated with zod on write). */
export type OrgSocialLinks = Partial<Record<OrgSocialLinkKey, string>>;

/**
 * Employer-specific profile, 1:1 with an organization of type "employer" (created during onboarding).
 * Shown on the public employer page only while organizations.isPublic is true and the organisation
 * is verified. Everything here is self-declared by the employer; it is never presented as verified
 * by Venkat Sai unless the organisation verification covered it. aboutHtml is sanitised on write.
 */
export const companyProfiles = pgTable(
  "company_profiles",
  {
    organizationId: uuid()
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companySize: text({ enum: COMPANY_SIZE_BANDS }),
    foundedYear: integer(),
    headquartersCountryCode: countryCode().references(() => countries.code),
    /** ISO-3166-1 alpha-2 codes of the countries the employer hires for (validated against `countries` in code). */
    hiringRegions: text().array().notNull().$defaultFn(() => []),
    /** Typical roles / trades hired, free text (e.g. "Pipe welder", "Rigger"). */
    typicalRoles: text().array().notNull().$defaultFn(() => []),
    /** Soft references to job_categories.id. */
    typicalJobCategoryIds: uuid().array().notNull().$defaultFn(() => []),
    employerBrandingTagline: text(),
    /** Sanitised rich text (sanitizeRichText on write, <SafeHtml> to render). */
    aboutHtml: text(),
    /** Public cover image (visibility public). */
    coverFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    socialLinks: jsonb().$type<OrgSocialLinks>().notNull().default(emptyJsonObject),
    benefitsOffered: text().array().notNull().$defaultFn(() => []),
    /** Soft references to public files.id (culture photos / videos the employer confirmed it may publish). */
    cultureMediaFileIds: uuid().array().notNull().$defaultFn(() => []),
    /** Public recruitment contact. Never default it to a member's personal email or phone. */
    publicContactEmail: text(),
    publicContactPhone: text(),
    /** Hires for overseas employment (positions outside the worker's home country, e.g. GCC projects). */
    isHiringOverseas: boolean().notNull().default(false),
    /** Default currency for this employer's salaries, requirements and quotations. */
    defaultCurrency: currencyCode().references(() => currencies.code),
    ...timestamps,
  },
  (t) => [
    index("company_profiles_hq_country_idx").on(t.headquartersCountryCode),
    index("company_profiles_cover_file_idx").on(t.coverFileId),
    index("company_profiles_default_currency_idx").on(t.defaultCurrency),
    // "Employers hiring for <country>" filters on the public directory.
    index("company_profiles_hiring_regions_idx").using("gin", t.hiringRegions),
    check("company_profiles_founded_year_chk", sql`${t.foundedYear} between 1800 and 2100`),
  ],
);

// ---------------------------------------------------------------------------
// Branches / work sites
// ---------------------------------------------------------------------------

/**
 * Offices, plants, project sites and camps of an employer. Used for job locations, interview venues
 * and member assignment (organization_members.branchId is a soft reference to this table, so branches
 * are deactivated with isActive instead of being deleted). Contact fields are business contacts for
 * Venkat Sai staff and invited candidates; they are never published on the public site.
 */
export const companyBranches = pgTable(
  "company_branches",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    stateRegion: text(),
    city: text(),
    addressLine1: text(),
    addressLine2: text(),
    postalCode: text(),
    /** IANA timezone (e.g. "Asia/Dubai") used when scheduling interviews at this site. */
    timezone: text(),
    isHeadquarters: boolean().notNull().default(false),
    contactName: text(),
    contactEmail: text(),
    contactPhone: text(),
    /** Closed sites stay for history (jobs, members) but are hidden from selectors. */
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("company_branches_org_name_uq").on(t.organizationId, t.name),
    // At most one headquarters per employer.
    uniqueIndex("company_branches_org_hq_uq").on(t.organizationId).where(sql`is_headquarters`),
    index("company_branches_country_idx").on(t.countryCode),
  ],
);

// ---------------------------------------------------------------------------
// Contracts with Venkat Sai
// ---------------------------------------------------------------------------

export const EMPLOYER_CONTRACT_TYPES = [
  "subscription",
  "managed_recruitment",
  "rpo",
  "bulk_supply",
  "enterprise",
  "testing_services",
  "training_services",
] as const;
export type EmployerContractType = (typeof EMPLOYER_CONTRACT_TYPES)[number];

export const EMPLOYER_CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"] as const;
export type EmployerContractStatus = (typeof EMPLOYER_CONTRACT_STATUSES)[number];

/** How a fee line in a contract is charged. */
export const EMPLOYER_CONTRACT_FEE_MODELS = [
  "flat_fee",
  "per_hire",
  "salary_percentage",
  "monthly_retainer",
  "per_worker_month",
  "per_assessment",
  "per_trainee",
  "custom",
] as const;
export type EmployerContractFeeModel = (typeof EMPLOYER_CONTRACT_FEE_MODELS)[number];

/**
 * Commercial terms of an employer contract (validated with zod on write). Amounts are integer minor
 * units of `currency` (ISO-4217, validated against `currencies`); never assume a currency.
 */
export type EmployerContractTerms = {
  currency?: string;
  fees?: {
    label: string;
    model: EmployerContractFeeModel;
    amountMinor?: number;
    /** Percentage in basis points for percentage models (1250 = 12.5%). */
    rateBasisPoints?: number;
    notes?: string;
  }[];
  /** Days from invoice date to due date. */
  paymentTermsDays?: number;
  sla?: {
    /** Days from requirement approval to the first shortlist. */
    firstShortlistDays?: number;
    /** Free replacement window after joining, in days. */
    replacementGuaranteeDays?: number;
    notes?: string;
  };
  notes?: string;
};

/**
 * Commercial agreements between an employer and Venkat Sai: offline subscriptions, managed
 * recruitment, RPO, bulk manpower supply, enterprise, testing and training services.
 * Confidential business data: visible to Venkat Sai staff with commercial / organisation permissions
 * and to employer members with billing permissions — never to partners or candidates.
 * Business record: deleting the organisation is blocked while contracts exist (use status instead).
 */
export const employerContracts = pgTable(
  "employer_contracts",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    contractType: text({ enum: EMPLOYER_CONTRACT_TYPES }).notNull(),
    title: text().notNull(),
    /** Contract / purchase-order reference agreed with the client (free text). */
    reference: text(),
    startsOn: date(),
    endsOn: date(),
    status: text({ enum: EMPLOYER_CONTRACT_STATUSES }).notNull().default("draft"),
    terms: jsonb().$type<EmployerContractTerms>().notNull().default(emptyJsonObject),
    autoRenew: boolean().notNull().default(false),
    /** Signed copy (purpose org_document). Evidence: the file cannot be deleted while referenced. */
    documentFileId: uuid().references(() => files.id),
    signedAt: tstz(),
    /** Client-side signatory as printed on the contract. */
    signedByName: text(),
    /** Venkat Sai relationship owner for this contract (may differ from organizations.accountManagerUserId). */
    accountManagerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    terminatedAt: tstz(),
    terminationReason: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("employer_contracts_org_idx").on(t.organizationId, t.status),
    index("employer_contracts_document_file_idx").on(t.documentFileId),
    index("employer_contracts_account_manager_idx").on(t.accountManagerUserId),
    index("employer_contracts_created_by_idx").on(t.createdByUserId),
    // Daily expiry / renewal-reminder sweep.
    index("employer_contracts_active_ends_on_idx").on(t.endsOn).where(sql`status = 'active'`),
    check("employer_contracts_dates_chk", sql`${t.endsOn} >= ${t.startsOn}`),
    check("employer_contracts_start_required_chk", sql`${t.status} = 'draft' or ${t.startsOn} is not null`),
    check("employer_contracts_terminated_chk", sql`${t.status} <> 'terminated' or ${t.terminatedAt} is not null`),
  ],
);
