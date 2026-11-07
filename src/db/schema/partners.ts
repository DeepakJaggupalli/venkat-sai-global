/**
 * Recruitment partner domain: agency profile (1:1 with organizations where type = "recruitment_partner"),
 * licences (e.g. an India Recruiting Agent registration under the Emigration Act 1983 / eMigrate, or a
 * foreign recruitment licence), versioned agreement acceptance and sourcing / placement territories.
 * Layer 7 — may import: taxonomy, core, identity, organizations, system, employers.
 *
 * Partners never see Venkat Sai finances or other partners' data. Quality scores, claimed placements
 * and staff notes below are internal to Venkat Sai. Partners must never charge candidates through the
 * platform: referral fees in partner agreements are paid by Venkat Sai.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { countryCode, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { files, organizations, users } from "./core";
import { countries } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

// ---------------------------------------------------------------------------
// Partner profile
// ---------------------------------------------------------------------------

export const PARTNER_BUSINESS_TYPES = ["agency", "staffing", "sourcing_partner", "travel_partner", "other"] as const;
export type PartnerBusinessType = (typeof PARTNER_BUSINESS_TYPES)[number];

/** Services a partner declares it provides (self-declared; selectable in the agency profile form). */
export const PARTNER_SERVICES = [
  "candidate_sourcing",
  "screening",
  "trade_test_coordination",
  "documentation_support",
  "visa_processing",
  "emigration_clearance",
  "medical_coordination",
  "travel_booking",
  "pre_departure_orientation",
  "local_mobilisation",
  "other",
] as const;
export type PartnerService = (typeof PARTNER_SERVICES)[number];

/**
 * Partner-specific profile, 1:1 with an organization of type "recruitment_partner".
 * Self-declared fields (businessType, services, years, specialisations, placementsClaimed) are never
 * shown publicly as facts. placementsClaimed is internal only and is never used as a platform statistic.
 * qualityScore is computed from the partner's real submission / placement outcomes, never entered by hand.
 */
export const partnerProfiles = pgTable(
  "partner_profiles",
  {
    organizationId: uuid()
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    businessType: text({ enum: PARTNER_BUSINESS_TYPES }),
    servicesProvided: text({ enum: PARTNER_SERVICES }).array().notNull().$defaultFn(() => []),
    yearsInOperation: integer(),
    /** Industries / trades the partner specialises in, free text (e.g. "Welding", "Oil and gas"). */
    specialisations: text().array().notNull().$defaultFn(() => []),
    /** Soft references to industries.id for structured matching. */
    industryIds: uuid().array().notNull().$defaultFn(() => []),
    /** Self-declared historical placements. Internal only. */
    placementsClaimed: integer(),
    /** 0–100, computed from outcomes. Internal only (never shown to the partner or publicly). */
    qualityScore: numeric({ precision: 5, scale: 2, mode: "number" }),
    qualityScoreUpdatedAt: tstz(),
    /** Staff-only notes on the partner's standing (never shown to the partner). */
    statusNotes: text(),
    ...timestamps,
  },
  (t) => [
    check("partner_profiles_years_chk", sql`${t.yearsInOperation} between 0 and 200`),
    check("partner_profiles_placements_claimed_chk", sql`${t.placementsClaimed} >= 0`),
    check("partner_profiles_quality_score_chk", sql`${t.qualityScore} between 0 and 100`),
  ],
);

// ---------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------

export const PARTNER_LICENCE_TYPES = [
  /** India: Recruiting Agent registration certificate under the Emigration Act 1983 (managed through eMigrate). */
  "india_recruiting_agent",
  /** Recruitment / employment-agency licence issued by an authority outside India. */
  "foreign_recruitment_licence",
  "staffing_licence",
  "travel_agency_licence",
  "trade_licence",
  "other",
] as const;
export type PartnerLicenceType = (typeof PARTNER_LICENCE_TYPES)[number];

/** `expired` is set by the licence-expiry task once validUntil has passed. */
export const PARTNER_LICENCE_VERIFICATION_STATUSES = ["pending", "verified", "rejected", "expired"] as const;
export type PartnerLicenceVerificationStatus = (typeof PARTNER_LICENCE_VERIFICATION_STATUSES)[number];

/** How staff verified a licence: document review only, lookup in the issuer's public registry (e.g. eMigrate), or direct confirmation from the issuer. */
export const PARTNER_LICENCE_VERIFICATION_METHODS = ["document_review", "registry_lookup", "issuer_confirmation", "other"] as const;
export type PartnerLicenceVerificationMethod = (typeof PARTNER_LICENCE_VERIFICATION_METHODS)[number];

/** Extra attributes read from the licence (all optional; validated per licenceType with zod). */
export type PartnerLicenceDetails = {
  /** Holder name exactly as printed (compared with the organisation's legal name during review). */
  holderName?: string;
  /** Registered office address as printed. */
  registeredAddress?: string;
  /** Activities / categories the licence authorises, as printed. */
  authorisedActivities?: string[];
  /** Branch offices listed on the licence. */
  branchOffices?: string[];
};

/**
 * Licences / registrations held by a recruitment partner, with validity and Venkat Sai verification
 * state. A licence is shown as verified only after staff verified it against the uploaded scan
 * (and, where available, the issuer's registry); only verified, unexpired licences satisfy assignment
 * rules that require one. licenceNumber is stored normalised (trimmed, upper-case) by the service.
 * Renewals update validity on the same row and send it back to review (history is in audit_logs).
 */
export const partnerLicences = pgTable(
  "partner_licences",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    licenceType: text({ enum: PARTNER_LICENCE_TYPES }).notNull(),
    licenceNumber: text().notNull(),
    /** Authority as printed (e.g. the Protector General of Emigrants for Indian Recruiting Agent registrations). */
    issuingAuthority: text(),
    issuingCountryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    /** State / emirate / province for sub-national licences. */
    issuingRegion: text(),
    validFrom: date(),
    /** Null = no expiry printed on the licence. */
    validUntil: date(),
    /** Scan of the licence (purpose partner_licence). Required before verification; kept while referenced. */
    fileId: uuid().references(() => files.id),
    details: jsonb().$type<PartnerLicenceDetails>().notNull().default(emptyJsonObject),
    verificationStatus: text({ enum: PARTNER_LICENCE_VERIFICATION_STATUSES }).notNull().default("pending"),
    verificationMethod: text({ enum: PARTNER_LICENCE_VERIFICATION_METHODS }),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    /** Shown to the partner when verification is rejected. */
    rejectionReason: text(),
    /** Staff-only review notes (e.g. where the registry lookup was performed). */
    notes: text(),
    submittedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Idempotency marker for the "licence expiring soon" reminder task. */
    expiryReminderSentAt: tstz(),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("partner_licences_org_idx").on(t.organizationId, t.verificationStatus),
    // One live record per licence per partner.
    uniqueIndex("partner_licences_org_number_uq")
      .on(t.organizationId, t.licenceType, t.issuingCountryCode, t.licenceNumber)
      .where(sql`deleted_at is null`),
    // Cross-partner lookup: the same licence number claimed by two agencies is a fraud signal for reviewers.
    index("partner_licences_number_idx").on(t.licenceNumber, t.issuingCountryCode),
    index("partner_licences_country_idx").on(t.issuingCountryCode),
    index("partner_licences_file_idx").on(t.fileId),
    index("partner_licences_verified_by_idx").on(t.verifiedByUserId),
    index("partner_licences_submitted_by_idx").on(t.submittedByUserId),
    index("partner_licences_review_idx").on(t.verificationStatus, t.createdAt),
    index("partner_licences_expiry_idx").on(t.validUntil).where(sql`verification_status = 'verified' and deleted_at is null`),
    check("partner_licences_validity_chk", sql`${t.validUntil} >= ${t.validFrom}`),
    check(
      "partner_licences_verified_chk",
      sql`${t.verificationStatus} <> 'verified' or (${t.fileId} is not null and ${t.verifiedAt} is not null)`,
    ),
    // Emigration Act registrations are Indian; "foreign" licences are issued outside India.
    check("partner_licences_india_ra_country_chk", sql`${t.licenceType} <> 'india_recruiting_agent' or ${t.issuingCountryCode} = 'IN'`),
    check("partner_licences_foreign_country_chk", sql`${t.licenceType} <> 'foreign_recruitment_licence' or ${t.issuingCountryCode} <> 'IN'`),
  ],
);

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export const PARTNER_AGREEMENT_STATUSES = ["pending", "active", "superseded", "expired", "terminated"] as const;
export type PartnerAgreementStatus = (typeof PARTNER_AGREEMENT_STATUSES)[number];

/** How Venkat Sai pays a partner for successful outcomes. */
export const PARTNER_FEE_MODELS = ["flat_per_placement", "salary_percentage", "flat_per_selection", "none", "custom"] as const;
export type PartnerFeeModel = (typeof PARTNER_FEE_MODELS)[number];

/**
 * Commercial terms offered to a partner (validated with zod on write). Amounts are integer minor units
 * of `currency` (ISO-4217); never assume a currency. Fees are paid by Venkat Sai to the partner.
 */
export type PartnerAgreementCommercialTerms = {
  feeModel?: PartnerFeeModel;
  currency?: string;
  amountMinor?: number;
  /** Percentage in basis points for percentage models (800 = 8%). */
  rateBasisPoints?: number;
  /** The fee becomes payable this many days after the candidate joins. */
  payableAfterJoiningDays?: number;
  /** Replacement / clawback window in days after joining. */
  replacementWindowDays?: number;
  paymentTermsDays?: number;
  notes?: string;
};

/**
 * Versioned partner agreements. Each row is what one partner was offered and accepted: an immutable
 * snapshot of the terms (with its SHA-256 for tamper evidence) plus acceptance evidence (who, typed
 * name, when, hashed IP, user agent). Never edit termsSnapshot after issue — issue a new version and
 * mark the previous one superseded. Visible to the partner's members and to staff with partner
 * permissions only. Legal record: deleting the organisation is blocked while agreements exist.
 */
export const partnerAgreements = pgTable(
  "partner_agreements",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    /** Agreement version label, e.g. "2026.1" (unique per partner). */
    version: text().notNull(),
    title: text().notNull(),
    /** Sanitised HTML of the exact terms offered (immutable after issue). */
    termsSnapshot: text().notNull(),
    /** Hex SHA-256 of termsSnapshot. */
    termsSha256: char({ length: 64 }).notNull(),
    commercialTerms: jsonb().$type<PartnerAgreementCommercialTerms>().notNull().default(emptyJsonObject),
    /** Optional countersigned copy (purpose org_document); kept while referenced. */
    documentFileId: uuid().references(() => files.id),
    status: text({ enum: PARTNER_AGREEMENT_STATUSES }).notNull().default("pending"),
    issuedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    issuedAt: tstz().notNull().defaultNow(),
    acceptedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Full name typed by the person accepting (electronic acceptance). */
    acceptedByName: text(),
    acceptedAt: tstz(),
    /** HMAC of the accepting IP address — never the raw IP. */
    ipHash: text(),
    userAgent: text(),
    effectiveFrom: date(),
    effectiveUntil: date(),
    /** The newer agreement that replaced this one. */
    supersededByAgreementId: uuid(),
    terminatedAt: tstz(),
    terminationReason: text(),
    ...timestamps,
  },
  (t) => [
    unique("partner_agreements_org_version_uq").on(t.organizationId, t.version),
    // At most one agreement in force per partner.
    uniqueIndex("partner_agreements_one_active_uq").on(t.organizationId).where(sql`status = 'active'`),
    foreignKey({ columns: [t.supersededByAgreementId], foreignColumns: [t.id], name: "partner_agreements_superseded_by_fk" }).onDelete("set null"),
    index("partner_agreements_superseded_by_idx").on(t.supersededByAgreementId),
    index("partner_agreements_document_file_idx").on(t.documentFileId),
    index("partner_agreements_issued_by_idx").on(t.issuedByUserId),
    index("partner_agreements_accepted_by_idx").on(t.acceptedByUserId),
    index("partner_agreements_active_until_idx").on(t.effectiveUntil).where(sql`status = 'active'`),
    check("partner_agreements_effective_chk", sql`${t.effectiveUntil} >= ${t.effectiveFrom}`),
    check("partner_agreements_active_accepted_chk", sql`${t.status} <> 'active' or ${t.acceptedAt} is not null`),
    check("partner_agreements_terminated_chk", sql`${t.status} <> 'terminated' or ${t.terminatedAt} is not null`),
    check("partner_agreements_superseded_by_chk", sql`${t.supersededByAgreementId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------------------
// Territories
// ---------------------------------------------------------------------------

export const PARTNER_TERRITORY_SCOPES = ["sourcing", "placement", "both"] as const;
export type PartnerTerritoryScope = (typeof PARTNER_TERRITORY_SCOPES)[number];

/**
 * Where a partner sources candidates and / or supports placements. Declared by the partner;
 * isAuthorised is set by Venkat Sai staff after checking the partner's licences cover the territory,
 * and assignment rules may require an authorised territory. stateRegion null = the whole country.
 */
export const partnerTerritories = pgTable(
  "partner_territories",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    stateRegion: text(),
    scope: text({ enum: PARTNER_TERRITORY_SCOPES }).notNull().default("sourcing"),
    isAuthorised: boolean().notNull().default(false),
    authorisedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    authorisedAt: tstz(),
    /** Staff-only notes (e.g. which licence covers this territory). */
    notes: text(),
    ...timestamps,
  },
  (t) => [
    // One whole-country row (stateRegion null) per partner and country: NULLS NOT DISTINCT semantics through
    // coalesce, as an expression index because drizzle-kit 0.31 re-creates `unique().nullsNotDistinct()` on
    // every push; plain columns are written as SQL as well (docs/SCHEMA_NOTES.md). The leading organization_id
    // is a plain key column, so this index also serves the FK.
    uniqueIndex("partner_territories_org_area_uq").on(sql`${t.organizationId}`, sql`${t.countryCode}`, sql`coalesce(${t.stateRegion}, '')`),
    index("partner_territories_country_idx").on(t.countryCode, t.scope),
    index("partner_territories_authorised_by_idx").on(t.authorisedByUserId),
    check("partner_territories_authorised_chk", sql`not ${t.isAuthorised} or ${t.authorisedAt} is not null`),
  ],
);
