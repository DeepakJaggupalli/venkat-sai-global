/**
 * Domain schema: commercial — plans & entitlements, subscriptions, the credit ledger, coupons,
 * billing profiles, tax rates, invoices / credit notes, payments, refunds, disputes, payment
 * gateway webhooks and recruitment-partner settlements.
 *
 * Layer 13 — may import from: taxonomy, core, identity, organizations, system, employers, partners,
 * candidates, operations, jobs, training, recruitment.
 * Never import from a later layer (see docs/DATA_MODEL.md → Layering).
 *
 * Rules:
 *  - Multi-currency everywhere: every money row stores integer minor units next to an ISO-4217
 *    currency (FK currencies.code, which also gives the minor-unit exponent). Child money rows
 *    (invoice lines, payments and coupon redemptions on an invoice, refunds, settlement lines) are
 *    held to their parent's currency by composite foreign keys referencing (currency, id). There is no
 *    platform currency and no assumed INR. In those tables `currency` is declared before the id columns
 *    on purpose (composite-FK column order must equal column and alphabetical order — docs/SCHEMA_NOTES.md).
 *  - Prices, limits, taxes and coupons are data administered at /admin (commercial.plans).
 *  - Invoices freeze buyer and seller details at issue; issued invoices are never edited or
 *    deleted (void + credit note instead).
 *  - Candidates are never charged to discover or apply for jobs. Invoices to individuals exist only
 *    for services such as training or skill assessments, never for job access.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { EntitlementKey } from "@/modules/commercial/entitlements";

import { ORG_TYPES } from "./_constants";
import { countryCode, createdAtOnly, currencyCode, emptyJsonArray, emptyJsonObject, moneyMinor, pk, timestamps, tstz } from "./_shared";
import { files, organizations, users } from "./core";
import { placements } from "./recruitment";
import { approvalRequests } from "./system";
import { countries, currencies } from "./taxonomy";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

/** Renders a constant list of enum values as an SQL literal list for index predicates (DDL cannot take bound params). */
const sqlValueList = (values: readonly string[]): SQL => sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "));

// ---------------------------------------------------------------------------
// Plans, prices and plan features (entitlements)
// ---------------------------------------------------------------------------

/** Plans are sold to organisations; the audience is the organisation type. */
export const PLAN_AUDIENCES = ORG_TYPES;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

/** `base` plans are mutually exclusive per organisation; `add_on` plans (credit packs, boosts) stack. */
export const PLAN_KINDS = ["base", "add_on"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const BILLING_INTERVALS = ["month", "quarter", "year", "one_time"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Period over which a plan feature limit applies (`none` = standing cap, e.g. active job posts, seats). */
export const PLAN_FEATURE_PERIODS = ["none", "month", "year"] as const;
export type PlanFeaturePeriod = (typeof PLAN_FEATURE_PERIODS)[number];

/** What happens to unused allowance at period end: `reset` (lost) or `rollover` (carried); `none` for standing caps. */
export const PLAN_FEATURE_RESET_POLICIES = ["none", "reset", "rollover"] as const;
export type PlanFeatureResetPolicy = (typeof PLAN_FEATURE_RESET_POLICIES)[number];

export const PAYMENT_GATEWAYS = ["razorpay", "stripe"] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

/**
 * Commercial plans for employers, recruitment partners and institutions (administered by staff
 * with commercial.plans). Nothing is seeded: Venkat Sai defines every plan, price and limit.
 */
export const plans = pgTable(
  "plans",
  {
    id: pk(),
    /** Stable identifier used in code and URLs, e.g. "employer_standard". */
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    audience: text({ enum: PLAN_AUDIENCES }).notNull(),
    kind: text({ enum: PLAN_KINDS }).notNull().default("base"),
    /** Listed on the public pricing page. */
    isPublic: boolean().notNull().default(false),
    /** Can be newly subscribed to (existing subscriptions are unaffected). */
    isActive: boolean().notNull().default(true),
    /** Plan applied to organisations of this audience without a subscription (at most one per audience). */
    isDefault: boolean().notNull().default(false),
    /** Price on request: the pricing page shows "Contact us" instead of prices. */
    contactSalesOnly: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    trialDays: integer().notNull().default(0),
    /** Bullet points for the pricing page. */
    highlights: text().array().notNull().$defaultFn(() => []),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("plans_key_uq").on(t.key),
    index("plans_audience_idx").on(t.audience, t.isActive, t.sortOrder),
    uniqueIndex("plans_default_audience_uq").on(t.audience).where(sql`${t.isDefault}`),
    check("plans_key_format_chk", sql`${t.key} ~ '^[a-z0-9][a-z0-9_]{1,63}$'`),
    check("plans_trial_days_chk", sql`${t.trialDays} >= 0`),
    check("plans_default_kind_chk", sql`not ${t.isDefault} or ${t.kind} = 'base'`),
  ],
);

/**
 * Price points of a plan — one per currency and billing interval (no single platform currency).
 * Price rows are immutable once subscribed to: change a price by deactivating the row and adding a
 * new one (subscriptions also snapshot the amount).
 */
export const planPrices = pgTable(
  "plan_prices",
  {
    id: pk(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    currency: currencyCode()
      .notNull()
      .references(() => currencies.code),
    interval: text({ enum: BILLING_INTERVALS }).notNull(),
    amountMinor: moneyMinor().notNull(),
    /** The amount already includes applicable taxes (tax is backed out on the invoice). */
    taxInclusive: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    /** Gateway price / plan identifiers: { razorpay?: "plan_…", stripe?: "price_…" }. */
    providerPriceIds: jsonb().$type<Partial<Record<PaymentGateway, string>>>().notNull().default(emptyJsonObject),
    ...timestamps,
  },
  (t) => [
    index("plan_prices_plan_idx").on(t.planId),
    index("plan_prices_currency_idx").on(t.currency),
    uniqueIndex("plan_prices_active_uq").on(t.planId, t.currency, t.interval).where(sql`${t.isActive}`),
    check("plan_prices_amount_chk", sql`${t.amountMinor} >= 0`),
  ],
);

/**
 * Limits a plan grants, keyed by the entitlement keys in src/modules/commercial/entitlements.ts
 * (ENTITLEMENT_KEYS). No row = not included; `limitValue` null = unlimited.
 */
export const planFeatures = pgTable(
  "plan_features",
  {
    id: pk(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    entitlementKey: text().$type<EntitlementKey>().notNull(),
    /** null = unlimited. */
    limitValue: integer(),
    period: text({ enum: PLAN_FEATURE_PERIODS }).notNull().default("none"),
    resetPolicy: text({ enum: PLAN_FEATURE_RESET_POLICIES }).notNull().default("none"),
    ...timestamps,
  },
  (t) => [
    unique("plan_features_plan_key_uq").on(t.planId, t.entitlementKey),
    check("plan_features_limit_chk", sql`${t.limitValue} is null or ${t.limitValue} >= 0`),
    check("plan_features_reset_chk", sql`(${t.period} = 'none') = (${t.resetPolicy} = 'none')`),
  ],
);

// ---------------------------------------------------------------------------
// Subscriptions & credit ledger
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled", "expired", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses that count as the organisation's live plan (also drives subscriptions_live_base_uq). */
export const LIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "paused"] as const satisfies readonly SubscriptionStatus[];

export const SUBSCRIPTION_PROVIDERS = ["manual", "razorpay", "stripe"] as const;
export type SubscriptionProvider = (typeof SUBSCRIPTION_PROVIDERS)[number];

/**
 * An organisation's plan. At most one live `base` subscription per organisation (enforced);
 * `add_on` subscriptions stack. The price is snapshotted (`currency`, `amountMinor`, `interval`)
 * so later price changes never alter an agreed subscription. Manual subscriptions (offline
 * contracts) have provider "manual" and may have no price.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    planPriceId: uuid().references(() => planPrices.id),
    /** Copied from plans.kind at creation (drives the one-live-base-plan rule). */
    kind: text({ enum: PLAN_KINDS }).notNull().default("base"),
    status: text({ enum: SUBSCRIPTION_STATUSES }).notNull().default("active"),
    currency: currencyCode().references(() => currencies.code),
    amountMinor: moneyMinor(),
    interval: text({ enum: BILLING_INTERVALS }),
    currentPeriodStart: tstz().notNull(),
    /** Null for open-ended (e.g. manual) subscriptions. */
    currentPeriodEnd: tstz(),
    trialEndsAt: tstz(),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    cancelledAt: tstz(),
    cancellationReason: text(),
    pausedAt: tstz(),
    /** When the subscription stopped being live (expired / cancelled took effect). */
    endedAt: tstz(),
    autoRenew: boolean().notNull().default(false),
    /** Last renewal reminder sent (keeps commercial.renewals idempotent per period). */
    renewalReminderSentAt: tstz(),
    provider: text({ enum: SUBSCRIPTION_PROVIDERS }).notNull().default("manual"),
    providerSubscriptionId: text(),
    providerCustomerId: text(),
    /** Staff only. */
    notes: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("subscriptions_org_idx").on(t.organizationId, t.status),
    index("subscriptions_plan_idx").on(t.planId),
    index("subscriptions_price_idx").on(t.planPriceId),
    index("subscriptions_currency_idx").on(t.currency),
    index("subscriptions_created_by_idx").on(t.createdByUserId),
    index("subscriptions_period_end_idx").on(t.status, t.currentPeriodEnd),
    uniqueIndex("subscriptions_live_base_uq")
      .on(t.organizationId)
      .where(sql`${t.kind} = 'base' and ${t.status} in (${sqlValueList(LIVE_SUBSCRIPTION_STATUSES)})`),
    uniqueIndex("subscriptions_provider_ref_uq").on(t.provider, t.providerSubscriptionId).where(sql`${t.providerSubscriptionId} is not null`),
    check(
      "subscriptions_price_snapshot_chk",
      sql`(${t.currency} is null) = (${t.amountMinor} is null) and (${t.amountMinor} is null) = (${t.interval} is null) and coalesce(${t.amountMinor}, 0) >= 0`,
    ),
    check("subscriptions_period_chk", sql`${t.currentPeriodEnd} is null or ${t.currentPeriodEnd} > ${t.currentPeriodStart}`),
    check("subscriptions_trial_chk", sql`${t.status} <> 'trialing' or ${t.trialEndsAt} is not null`),
  ],
);

/** + plan_grant / purchase, − consumption / expiry, ± adjustment / refund (reversal or claw-back). */
export const CREDIT_LEDGER_REASONS = ["plan_grant", "purchase", "consumption", "expiry", "adjustment", "refund"] as const;
export type CreditLedgerReason = (typeof CREDIT_LEDGER_REASONS)[number];

/**
 * Append-only entitlement / credit ledger per organisation and entitlement key. Never UPDATE or
 * DELETE rows; corrections are new `adjustment` rows.
 *  - `seq` increments per (organizationId, entitlementKey); the unique constraint makes concurrent
 *    writers that read the same previous balance collide, so one retries — `balanceAfter` stays exact.
 *  - `idempotencyKey` (e.g. "consume:candidate_unlocks:<candidateId>", "grant:<subscriptionId>:<periodStart>")
 *    stops double grants / consumption on retries.
 *  - Balances may go below zero only while commercial.enforce_limits is off (usage recorded for reporting).
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    entitlementKey: text().$type<EntitlementKey>().notNull(),
    seq: integer().notNull(),
    delta: integer().notNull(),
    balanceAfter: integer().notNull(),
    reason: text({ enum: CREDIT_LEDGER_REASONS }).notNull(),
    /** What the entry is for: subscription, invoice, candidate, job, partner_submission... */
    referenceType: text(),
    /** Id of the referenced entity (text: matches the entitlements contract `reference.id: string`). */
    referenceId: text(),
    idempotencyKey: text(),
    /** Granted credits expire at this time (commercial.renewals writes the matching expiry entry). */
    expiresAt: tstz(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Reason for adjustments (staff). */
    note: text(),
    ...createdAtOnly,
  },
  (t) => [
    unique("credit_ledger_org_key_seq_uq").on(t.organizationId, t.entitlementKey, t.seq),
    uniqueIndex("credit_ledger_idempotency_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index("credit_ledger_org_key_created_idx").on(t.organizationId, t.entitlementKey, t.createdAt),
    index("credit_ledger_reference_idx").on(t.referenceType, t.referenceId),
    index("credit_ledger_actor_idx").on(t.actorUserId),
    index("credit_ledger_expiry_idx").on(t.expiresAt).where(sql`${t.expiresAt} is not null and ${t.delta} > 0`),
    check(
      "credit_ledger_delta_chk",
      sql`${t.delta} <> 0 and (${t.reason} not in ('plan_grant', 'purchase') or ${t.delta} > 0) and (${t.reason} not in ('consumption', 'expiry') or ${t.delta} < 0)`,
    ),
    check("credit_ledger_seq_chk", sql`${t.seq} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Billing profiles & tax rates
// ---------------------------------------------------------------------------

export const TAX_ID_TYPES = ["gstin", "vat", "trn", "ein", "abn", "uen", "other"] as const;
export type TaxIdType = (typeof TAX_ID_TYPES)[number];

/**
 * Billing details of an organisation (1:1). Copied into invoices.buyerSnapshot at issue, so edits
 * never change issued invoices. `stateCode` is the Indian GST state code used for place of supply.
 */
export const billingProfiles = pgTable(
  "billing_profiles",
  {
    organizationId: uuid()
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    legalName: text().notNull(),
    contactName: text(),
    /** Lower-cased, trimmed. Invoices and receipts are sent here. */
    billingEmail: text().notNull(),
    /** E.164. */
    billingPhone: text(),
    addressLine1: text().notNull(),
    addressLine2: text(),
    city: text().notNull(),
    stateRegion: text(),
    /** India: two-digit GST state code (e.g. "37" Andhra Pradesh). */
    stateCode: text(),
    postalCode: text(),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    taxIdType: text({ enum: TAX_ID_TYPES }),
    /** GSTIN / VAT / TRN... */
    taxId: text(),
    taxExempt: boolean().notNull().default(false),
    /** e.g. SEZ unit supplying under LUT. */
    taxExemptReason: text(),
    /** Preferred billing currency. */
    currency: currencyCode()
      .notNull()
      .references(() => currencies.code),
    ...timestamps,
  },
  (t) => [
    index("billing_profiles_country_idx").on(t.countryCode),
    index("billing_profiles_currency_idx").on(t.currency),
    check("billing_profiles_state_code_chk", sql`${t.countryCode} <> 'IN' or ${t.stateCode} is null or ${t.stateCode} ~ '^[0-9]{2}$'`),
    check("billing_profiles_tax_id_chk", sql`${t.taxId} is null or ${t.taxIdType} is not null`),
    check("billing_profiles_gstin_chk", sql`${t.taxIdType} is distinct from 'gstin' or ${t.taxId} ~ '^[0-9]{2}[A-Z0-9]{13}$'`),
  ],
);

export const TAX_RATE_KINDS = ["gst_cgst", "gst_sgst", "gst_igst", "vat", "sales_tax", "none"] as const;
export type TaxRateKind = (typeof TAX_RATE_KINDS)[number];

/**
 * Tax rate definitions (e.g. India GST CGST 9% + SGST 9% intra-state, IGST 18% inter-state).
 * Seeded as definitions only; rates are data and versioned by effective dates.
 */
export const taxRates = pgTable(
  "tax_rates",
  {
    id: pk(),
    /** Label printed on invoices, e.g. "CGST 9%". */
    name: text().notNull(),
    countryCode: countryCode()
      .notNull()
      .references(() => countries.code),
    /** State / region code the rate is limited to; null = whole country. */
    region: text(),
    kind: text({ enum: TAX_RATE_KINDS }).notNull(),
    /** 900 = 9.00 %. */
    rateBasisPoints: integer().notNull(),
    isActive: boolean().notNull().default(true),
    effectiveFrom: tstz().notNull(),
    effectiveUntil: tstz(),
    ...timestamps,
  },
  (t) => [
    // One definition per (country, region, kind, effective date); a null region (whole country) counts as one
    // value. Expression index instead of `unique().nullsNotDistinct()`, which drizzle-kit 0.31 re-creates on
    // every push; plain columns are written as SQL as well (docs/SCHEMA_NOTES.md).
    uniqueIndex("tax_rates_definition_uq").on(sql`${t.countryCode}`, sql`coalesce(${t.region}, '')`, sql`${t.kind}`, sql`${t.effectiveFrom}`),
    index("tax_rates_country_idx").on(t.countryCode, t.isActive),
    check("tax_rates_rate_chk", sql`${t.rateBasisPoints} between 0 and 10000`),
    check("tax_rates_effective_chk", sql`${t.effectiveUntil} is null or ${t.effectiveUntil} > ${t.effectiveFrom}`),
  ],
);

// ---------------------------------------------------------------------------
// Invoices & credit notes
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = ["draft", "issued", "paid", "partially_paid", "void", "overdue", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** A credit note reverses (part of) an issued invoice — required for refunds after a GST invoice. */
export const INVOICE_DOCUMENT_TYPES = ["invoice", "credit_note"] as const;
export type InvoiceDocumentType = (typeof INVOICE_DOCUMENT_TYPES)[number];

/**
 * How tax was determined: `standard` (rates applied), `export` (export of services, zero-rated e.g.
 * under LUT), `sez` (supply to an SEZ unit), `reverse_charge` (buyer accounts for tax), `exempt`,
 * `out_of_scope` (no tax applies).
 */
export const INVOICE_TAX_TREATMENTS = ["standard", "export", "sez", "reverse_charge", "exempt", "out_of_scope"] as const;
export type InvoiceTaxTreatment = (typeof INVOICE_TAX_TREATMENTS)[number];

/** Party details frozen on an invoice at issue (buyer from billing_profiles, seller from settings). */
export type InvoicePartySnapshot = {
  legalName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  /** India: GST state code (place of supply). */
  stateCode?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  taxIdType?: TaxIdType | null;
  taxId?: string | null;
};

/** One tax component on an invoice line (e.g. CGST 9 % and SGST 9 % for an intra-state supply). */
export type InvoiceLineTax = {
  kind: TaxRateKind;
  name: string;
  rateBasisPoints: number;
  amountMinor: number;
  taxRateId?: string | null;
};

/**
 * Invoices and credit notes, in the invoice's own currency.
 *  - `code` (VSG-INV-YYYY-000123, nextCode("INV", { yearly: true }); credit notes use their own
 *    prefix) is assigned when the document is issued, so deleted drafts never leave gaps in the
 *    legal numbering series. Drafts may be deleted; issued documents are voided instead.
 *  - `buyerSnapshot` / `sellerSnapshot` are frozen at issue and never updated.
 *  - totals: totalMinor = subtotalMinor − discountMinor + taxMinor (enforced).
 * Buyer is an organisation, or an individual (`buyerUserId`) for services such as training fees.
 * Invoices are financial records retained for the statutory period (privacy retention exception).
 */
export const invoices = pgTable(
  "invoices",
  {
    /**
     * Declared before `id` on purpose: composite FKs reference (currency, id), and drizzle-kit reads
     * composite-FK columns back in column order or in alphabetical order depending on the query plan, so
     * the two orders must agree or `drizzle-kit push` re-creates the FKs (docs/SCHEMA_NOTES.md §2, rule 5).
     */
    currency: currencyCode()
      .notNull()
      .references(() => currencies.code),
    id: pk(),
    /** Null while draft; assigned at issue. */
    code: text(),
    documentType: text({ enum: INVOICE_DOCUMENT_TYPES }).notNull().default("invoice"),
    /** Credit notes: the invoice being credited. */
    originalInvoiceId: uuid(),
    organizationId: uuid().references(() => organizations.id),
    /** Individual buyer (training / assessment fees). */
    buyerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    subscriptionId: uuid().references(() => subscriptions.id, { onDelete: "set null" }),
    status: text({ enum: INVOICE_STATUSES }).notNull().default("draft"),
    taxTreatment: text({ enum: INVOICE_TAX_TREATMENTS }).notNull().default("standard"),
    subtotalMinor: moneyMinor().notNull().default(0),
    discountMinor: moneyMinor().notNull().default(0),
    taxMinor: moneyMinor().notNull().default(0),
    totalMinor: moneyMinor().notNull().default(0),
    amountPaidMinor: moneyMinor().notNull().default(0),
    amountRefundedMinor: moneyMinor().notNull().default(0),
    /** GST place of supply (state code) or the buyer's country code. */
    placeOfSupply: text(),
    /** Buyer's purchase order reference, printed on the invoice. */
    purchaseOrderReference: text(),
    servicePeriodStart: tstz(),
    servicePeriodEnd: tstz(),
    issuedAt: tstz(),
    dueAt: tstz(),
    paidAt: tstz(),
    voidedAt: tstz(),
    voidReason: text(),
    issuedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    voidedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    buyerSnapshot: jsonb().$type<InvoicePartySnapshot>(),
    sellerSnapshot: jsonb().$type<InvoicePartySnapshot>(),
    /** Printed on the invoice. */
    notes: text(),
    /** Staff only. */
    internalNotes: text(),
    pdfFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_code_uq").on(t.code),
    // Target for composite FKs that force lines, payments and redemptions into the invoice's currency.
    // Columns in table column order (drizzle-kit reads unique-constraint columns back in that order).
    unique("invoices_currency_id_uq").on(t.currency, t.id),
    foreignKey({ name: "invoices_original_invoice_fk", columns: [t.originalInvoiceId], foreignColumns: [t.id] }),
    index("invoices_original_invoice_idx").on(t.originalInvoiceId),
    index("invoices_org_idx").on(t.organizationId, t.issuedAt),
    index("invoices_buyer_user_idx").on(t.buyerUserId),
    index("invoices_subscription_idx").on(t.subscriptionId),
    index("invoices_status_due_idx").on(t.status, t.dueAt),
    index("invoices_currency_issued_idx").on(t.currency, t.issuedAt),
    index("invoices_issued_by_idx").on(t.issuedByUserId),
    index("invoices_voided_by_idx").on(t.voidedByUserId),
    index("invoices_pdf_file_idx").on(t.pdfFileId),
    check(
      "invoices_totals_chk",
      sql`${t.subtotalMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.discountMinor} <= ${t.subtotalMinor} and ${t.totalMinor} = ${t.subtotalMinor} - ${t.discountMinor} + ${t.taxMinor}`,
    ),
    check("invoices_paid_chk", sql`${t.amountPaidMinor} >= 0 and ${t.amountRefundedMinor} >= 0 and ${t.amountRefundedMinor} <= ${t.amountPaidMinor}`),
    check(
      "invoices_issued_chk",
      sql`${t.status} = 'draft' or (${t.code} is not null and ${t.issuedAt} is not null and ${t.buyerSnapshot} is not null and ${t.sellerSnapshot} is not null)`,
    ),
    check("invoices_credit_note_chk", sql`(${t.documentType} = 'credit_note') = (${t.originalInvoiceId} is not null)`),
    check("invoices_void_chk", sql`${t.status} <> 'void' or ${t.voidedAt} is not null`),
    check(
      "invoices_service_period_chk",
      sql`${t.servicePeriodStart} is null or ${t.servicePeriodEnd} is null or ${t.servicePeriodEnd} >= ${t.servicePeriodStart}`,
    ),
  ],
);

/**
 * Invoice lines (pre-tax amounts). `currency` always equals the invoice currency (composite FK;
 * changing a draft's currency cascades to its lines). amountMinor = quantity × unitAmountMinor
 * − discountMinor (enforced); `taxes` holds the frozen tax components.
 */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: pk(),
    /** Declared before invoiceId: composite-FK column order must equal column and alphabetical order (rule 5). */
    currency: currencyCode().notNull(),
    invoiceId: uuid().notNull(),
    sortOrder: integer().notNull().default(0),
    description: text().notNull(),
    /** HSN / SAC code printed on GST invoices. */
    taxCode: text(),
    quantity: integer().notNull().default(1),
    unitAmountMinor: moneyMinor().notNull(),
    discountMinor: moneyMinor().notNull().default(0),
    amountMinor: moneyMinor().notNull(),
    /** Sum of the component rates (1800 = 18 %). */
    taxRateBasisPoints: integer().notNull().default(0),
    taxMinor: moneyMinor().notNull().default(0),
    taxes: jsonb().$type<InvoiceLineTax[]>().notNull().default(emptyJsonArray),
    /** What is billed: plan_price, subscription, credit_pack, placement, enrolment, skill_assessment... */
    referenceType: text(),
    referenceId: text(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: "invoice_lines_invoice_currency_fk", columns: [t.currency, t.invoiceId], foreignColumns: [invoices.currency, invoices.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("invoice_lines_invoice_idx").on(t.invoiceId, t.sortOrder),
    index("invoice_lines_reference_idx").on(t.referenceType, t.referenceId),
    check(
      "invoice_lines_amount_chk",
      sql`${t.quantity} > 0 and ${t.unitAmountMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.discountMinor} <= ${t.quantity} * ${t.unitAmountMinor} and ${t.amountMinor} = ${t.quantity} * ${t.unitAmountMinor} - ${t.discountMinor}`,
    ),
    check("invoice_lines_tax_chk", sql`${t.taxMinor} >= 0 and ${t.taxRateBasisPoints} between 0 and 10000`),
  ],
);

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const COUPON_DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

/** How long a coupon keeps applying to a subscription: first invoice, N billing cycles, or always. */
export const COUPON_DURATIONS = ["once", "repeating", "forever"] as const;
export type CouponDuration = (typeof COUPON_DURATIONS)[number];

/**
 * Discount codes (commercial.plans). Codes are stored upper-case. Fixed discounts are
 * currency-specific. `redeemedCount ≤ maxRedemptions` is enforced, so concurrent redemptions can
 * never exceed the cap.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: pk(),
    code: text().notNull(),
    description: text(),
    discountType: text({ enum: COUPON_DISCOUNT_TYPES }).notNull(),
    /** Whole percent 1–100 (percent coupons). */
    percentOff: integer(),
    /** Fixed coupons: amount + currency. */
    amountOffMinor: moneyMinor(),
    currency: currencyCode().references(() => currencies.code),
    duration: text({ enum: COUPON_DURATIONS }).notNull().default("once"),
    /** Billing cycles for `repeating` coupons. */
    durationCycles: integer(),
    /** null = unlimited. */
    maxRedemptions: integer(),
    maxRedemptionsPerOrganization: integer(),
    redeemedCount: integer().notNull().default(0),
    validFrom: tstz(),
    validUntil: tstz(),
    /** Plans the coupon applies to (soft references to plans.id); empty = every plan. */
    planIds: uuid().array().notNull().$defaultFn(() => []),
    isActive: boolean().notNull().default(true),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("coupons_code_uq").on(t.code),
    index("coupons_currency_idx").on(t.currency),
    index("coupons_created_by_idx").on(t.createdByUserId),
    check("coupons_code_format_chk", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'`),
    check(
      "coupons_discount_chk",
      sql`(${t.discountType} = 'percent' and ${t.percentOff} between 1 and 100 and ${t.amountOffMinor} is null and ${t.currency} is null) or (${t.discountType} = 'fixed' and ${t.amountOffMinor} > 0 and ${t.currency} is not null and ${t.percentOff} is null)`,
    ),
    check("coupons_duration_chk", sql`(${t.duration} = 'repeating') = (${t.durationCycles} is not null) and coalesce(${t.durationCycles}, 1) > 0`),
    check(
      "coupons_redemptions_chk",
      sql`${t.redeemedCount} >= 0 and (${t.maxRedemptions} is null or (${t.maxRedemptions} > 0 and ${t.redeemedCount} <= ${t.maxRedemptions})) and (${t.maxRedemptionsPerOrganization} is null or ${t.maxRedemptionsPerOrganization} > 0)`,
    ),
    check("coupons_validity_chk", sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validUntil} > ${t.validFrom}`),
  ],
);

/**
 * Each use of a coupon (by an organisation, or an individual for training fees). A voided invoice
 * reverses its redemption (`reversedAt`) and decrements coupons.redeemedCount. A redemption on an
 * invoice records the discount in the invoice's currency (composite FK).
 */
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: pk(),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id),
    organizationId: uuid().references(() => organizations.id),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    /**
     * Currency of discountMinor (required when tied to an invoice). Declared before invoiceId: composite-FK
     * column order must equal column and alphabetical order (rule 5).
     */
    currency: currencyCode().references(() => currencies.code),
    invoiceId: uuid(),
    subscriptionId: uuid().references(() => subscriptions.id, { onDelete: "set null" }),
    /** Discount actually applied, in `currency`. */
    discountMinor: moneyMinor(),
    redeemedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    redeemedAt: tstz().notNull().defaultNow(),
    reversedAt: tstz(),
  },
  (t) => [
    unique("coupon_redemptions_coupon_invoice_uq").on(t.couponId, t.invoiceId),
    foreignKey({
      name: "coupon_redemptions_invoice_currency_fk",
      columns: [t.currency, t.invoiceId],
      foreignColumns: [invoices.currency, invoices.id],
    }),
    index("coupon_redemptions_org_idx").on(t.organizationId),
    index("coupon_redemptions_user_idx").on(t.userId),
    index("coupon_redemptions_invoice_idx").on(t.invoiceId),
    index("coupon_redemptions_subscription_idx").on(t.subscriptionId),
    index("coupon_redemptions_currency_idx").on(t.currency),
    index("coupon_redemptions_redeemed_by_idx").on(t.redeemedByUserId),
    check(
      "coupon_redemptions_discount_chk",
      sql`(${t.discountMinor} is null) = (${t.currency} is null) and coalesce(${t.discountMinor}, 0) >= 0 and (${t.invoiceId} is null or ${t.currency} is not null)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Payments, refunds, disputes, gateway webhooks
// ---------------------------------------------------------------------------

export const PAYMENT_PROVIDERS = ["manual", "bank_transfer", "razorpay", "stripe", "upi_manual", "cheque"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "refunded", "partially_refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet", "bank_transfer", "cheque", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Money received — gateway payments (Razorpay / Stripe) and offline payments recorded by staff
 * (commercial.payments) with proof. Gateway payments are unique per (provider, providerPaymentId),
 * so a replayed callback can never record a payment twice. A payment allocated to an invoice is in
 * the invoice's currency (composite FK). Never store card numbers or bank credentials; `metadata`
 * holds non-sensitive gateway fields only.
 */
export const payments = pgTable(
  "payments",
  {
    /**
     * Declared first on purpose: payments reference invoices by (currency, invoice_id) and refunds reference
     * payments by (currency, id); composite-FK column order must equal column and alphabetical order (rule 5).
     */
    currency: currencyCode()
      .notNull()
      .references(() => currencies.code),
    id: pk(),
    /** VSG-PAY-000123 — nextCode("PAY"). */
    code: text().notNull(),
    organizationId: uuid().references(() => organizations.id),
    /** Individual payer (training / assessment fees). */
    payerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Null for advance payments not yet allocated to an invoice. */
    invoiceId: uuid(),
    provider: text({ enum: PAYMENT_PROVIDERS }).notNull(),
    method: text({ enum: PAYMENT_METHODS }),
    status: text({ enum: PAYMENT_STATUSES }).notNull().default("pending"),
    amountMinor: moneyMinor().notNull(),
    amountRefundedMinor: moneyMinor().notNull().default(0),
    /** Gateway fee, for reconciliation. */
    providerFeeMinor: moneyMinor(),
    providerPaymentId: text(),
    providerOrderId: text(),
    /** Offline reference: bank UTR, cheque number, UPI transaction reference. */
    externalReference: text(),
    receivedAt: tstz(),
    failureReason: text(),
    /** Offline payment proof (bank receipt...). */
    proofFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    recordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_code_uq").on(t.code),
    // Target for the refunds composite FK (refund currency = payment currency); columns in table column order.
    unique("payments_currency_id_uq").on(t.currency, t.id),
    foreignKey({ name: "payments_invoice_currency_fk", columns: [t.currency, t.invoiceId], foreignColumns: [invoices.currency, invoices.id] }),
    uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerPaymentId).where(sql`${t.providerPaymentId} is not null`),
    index("payments_provider_order_idx").on(t.provider, t.providerOrderId),
    index("payments_org_idx").on(t.organizationId, t.createdAt),
    index("payments_payer_idx").on(t.payerUserId),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_status_idx").on(t.status, t.createdAt),
    index("payments_currency_received_idx").on(t.currency, t.receivedAt),
    index("payments_proof_file_idx").on(t.proofFileId),
    index("payments_recorded_by_idx").on(t.recordedByUserId),
    check(
      "payments_amounts_chk",
      sql`${t.amountMinor} > 0 and ${t.amountRefundedMinor} >= 0 and ${t.amountRefundedMinor} <= ${t.amountMinor} and coalesce(${t.providerFeeMinor}, 0) >= 0`,
    ),
    check(
      "payments_refund_status_chk",
      sql`(${t.status} <> 'refunded' or ${t.amountRefundedMinor} = ${t.amountMinor}) and (${t.status} <> 'partially_refunded' or (${t.amountRefundedMinor} > 0 and ${t.amountRefundedMinor} < ${t.amountMinor}))`,
    ),
    check("payments_received_chk", sql`${t.status} not in ('succeeded', 'refunded', 'partially_refunded') or ${t.receivedAt} is not null`),
  ],
);

export const REFUND_STATUSES = ["requested", "approved", "processing", "completed", "rejected", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/**
 * Refunds against a payment, decided through the approval inbox (approval type "refund",
 * commercial.refunds). Amount + currency equal to the payment's currency. A refund after a GST
 * invoice is accompanied by a credit note (`creditNoteInvoiceId`).
 */
export const refunds = pgTable(
  "refunds",
  {
    id: pk(),
    /** VSG-RFD-000123 — nextCode("RFD"). */
    code: text().notNull(),
    /**
     * Always the payment's currency (composite FK). Declared before paymentId: composite-FK column order must
     * equal column and alphabetical order (rule 5).
     */
    currency: currencyCode().notNull(),
    paymentId: uuid().notNull(),
    organizationId: uuid().references(() => organizations.id),
    amountMinor: moneyMinor().notNull(),
    reason: text().notNull(),
    status: text({ enum: REFUND_STATUSES }).notNull().default("requested"),
    requestedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: tstz(),
    /** Approver's note (shown to the requester on rejection). */
    decisionNote: text(),
    approvalRequestId: uuid().references(() => approvalRequests.id, { onDelete: "set null" }),
    creditNoteInvoiceId: uuid().references(() => invoices.id, { onDelete: "set null" }),
    providerRefundId: text(),
    processedAt: tstz(),
    failureReason: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("refunds_code_uq").on(t.code),
    uniqueIndex("refunds_provider_ref_uq").on(t.providerRefundId),
    foreignKey({ name: "refunds_payment_currency_fk", columns: [t.currency, t.paymentId], foreignColumns: [payments.currency, payments.id] }),
    index("refunds_payment_idx").on(t.paymentId),
    index("refunds_org_idx").on(t.organizationId),
    index("refunds_status_idx").on(t.status, t.createdAt),
    index("refunds_requested_by_idx").on(t.requestedByUserId),
    index("refunds_approved_by_idx").on(t.approvedByUserId),
    index("refunds_approval_idx").on(t.approvalRequestId),
    index("refunds_credit_note_idx").on(t.creditNoteInvoiceId),
    check("refunds_amount_chk", sql`${t.amountMinor} > 0`),
    check("refunds_completed_chk", sql`${t.status} <> 'completed' or ${t.processedAt} is not null`),
  ],
);

export const DISPUTE_STATUSES = ["open", "under_review", "resolved", "rejected"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** `customer` = raised by the buyer; `chargeback` = opened by the card network / gateway. */
export const DISPUTE_SOURCES = ["customer", "chargeback"] as const;
export type DisputeSource = (typeof DISPUTE_SOURCES)[number];

/** Billing disputes and gateway chargebacks about a payment and/or invoice. */
export const disputes = pgTable(
  "disputes",
  {
    id: pk(),
    source: text({ enum: DISPUTE_SOURCES }).notNull().default("customer"),
    paymentId: uuid().references(() => payments.id),
    invoiceId: uuid().references(() => invoices.id),
    organizationId: uuid().references(() => organizations.id),
    /** Disputed amount + currency (null = whole document). */
    amountMinor: moneyMinor(),
    currency: currencyCode().references(() => currencies.code),
    reason: text().notNull(),
    status: text({ enum: DISPUTE_STATUSES }).notNull().default("open"),
    providerDisputeId: text(),
    /** Evidence deadline for chargebacks. */
    respondBy: tstz(),
    resolution: text(),
    openedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("disputes_provider_ref_uq").on(t.providerDisputeId),
    index("disputes_payment_idx").on(t.paymentId),
    index("disputes_invoice_idx").on(t.invoiceId),
    index("disputes_org_idx").on(t.organizationId),
    index("disputes_status_idx").on(t.status, t.createdAt),
    index("disputes_currency_idx").on(t.currency),
    index("disputes_opened_by_idx").on(t.openedByUserId),
    index("disputes_resolved_by_idx").on(t.resolvedByUserId),
    check("disputes_subject_chk", sql`${t.paymentId} is not null or ${t.invoiceId} is not null`),
    check("disputes_amount_chk", sql`(${t.amountMinor} is null) = (${t.currency} is null) and coalesce(${t.amountMinor}, 1) > 0`),
  ],
);

export const PAYMENT_WEBHOOK_EVENT_STATUSES = ["received", "processed", "failed", "ignored"] as const;
export type PaymentWebhookEventStatus = (typeof PAYMENT_WEBHOOK_EVENT_STATUSES)[number];

/**
 * Inbox of payment gateway webhooks. Idempotent: unique per (provider, eventId), so redelivered
 * events are recognised and processed once. Store ONLY signature-verified events (otherwise a
 * forged event could pre-claim a real event id). Payloads may contain payer contact details: purge
 * them after the retention period; gateways never send full card numbers.
 */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: pk(),
    provider: text({ enum: PAYMENT_GATEWAYS }).notNull(),
    eventId: text().notNull(),
    /** Gateway event type, e.g. "payment.captured". */
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: text({ enum: PAYMENT_WEBHOOK_EVENT_STATUSES }).notNull().default("received"),
    attempts: integer().notNull().default(0),
    error: text(),
    paymentId: uuid().references(() => payments.id, { onDelete: "set null" }),
    receivedAt: tstz().notNull().defaultNow(),
    processedAt: tstz(),
  },
  (t) => [
    unique("payment_webhook_events_provider_event_uq").on(t.provider, t.eventId),
    index("payment_webhook_events_status_idx").on(t.status, t.receivedAt),
    index("payment_webhook_events_payment_idx").on(t.paymentId),
    check("payment_webhook_events_attempts_chk", sql`${t.attempts} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Recruitment-partner settlements
// ---------------------------------------------------------------------------

export const PARTNER_SETTLEMENT_STATUSES = ["draft", "pending_approval", "approved", "paid", "disputed", "cancelled"] as const;
export type PartnerSettlementStatus = (typeof PARTNER_SETTLEMENT_STATUSES)[number];

export const PARTNER_SETTLEMENT_LINE_KINDS = ["placement_fee", "bonus", "adjustment", "deduction"] as const;
export type PartnerSettlementLineKind = (typeof PARTNER_SETTLEMENT_LINE_KINDS)[number];

/**
 * Periodic statement of what Venkat Sai owes a recruitment partner (referral / placement fees),
 * approved through the approval inbox (approval type "partner_settlement", partners.settlements).
 * Partners see only their own settlements and never Venkat Sai's other finances.
 *  - `code`: VSG-STL-000123 (nextCode("STL")).
 *  - amountMinor = Σ lines (deductions subtracted); withholdingTaxMinor = tax deducted at source;
 *    net payable = amountMinor − withholdingTaxMinor.
 *  - One non-cancelled settlement per partner, period and currency.
 */
export const partnerSettlements = pgTable(
  "partner_settlements",
  {
    /**
     * Declared before `id` on purpose: settlement lines reference (currency, id); composite-FK column order
     * must equal column and alphabetical order (rule 5).
     */
    currency: currencyCode()
      .notNull()
      .references(() => currencies.code),
    id: pk(),
    code: text().notNull(),
    partnerOrganizationId: uuid().notNull(),
    /** Inclusive calendar dates ('YYYY-MM-DD'). */
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    amountMinor: moneyMinor().notNull().default(0),
    withholdingTaxMinor: moneyMinor().notNull().default(0),
    status: text({ enum: PARTNER_SETTLEMENT_STATUSES }).notNull().default("draft"),
    approvalRequestId: uuid(),
    approvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: tstz(),
    paidAt: tstz(),
    /** Bank transfer reference (UTR) of the payout. */
    paymentReference: text(),
    /** The partner's own invoice for the fees, when they issue one. */
    partnerInvoiceNumber: text(),
    partnerInvoiceFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** Partner's reason when status = disputed. */
    disputeReason: text(),
    /** Visible to the partner. */
    notes: text(),
    /** Staff only. */
    internalNotes: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("partner_settlements_code_uq").on(t.code),
    // Target for the settlement-lines composite FK (line currency = settlement currency); columns in table column order.
    unique("partner_settlements_currency_id_uq").on(t.currency, t.id),
    // Explicit names: the generated ones reach PostgreSQL's 63-character identifier limit.
    foreignKey({ name: "partner_settlements_partner_org_fk", columns: [t.partnerOrganizationId], foreignColumns: [organizations.id] }),
    foreignKey({ name: "partner_settlements_approval_request_fk", columns: [t.approvalRequestId], foreignColumns: [approvalRequests.id] }).onDelete(
      "set null",
    ),
    index("partner_settlements_partner_idx").on(t.partnerOrganizationId, t.periodStart),
    uniqueIndex("partner_settlements_period_uq")
      .on(t.partnerOrganizationId, t.periodStart, t.periodEnd, t.currency)
      .where(sql`${t.status} <> 'cancelled'`),
    index("partner_settlements_status_idx").on(t.status, t.createdAt),
    // The currency FK is indexed by partner_settlements_currency_id_uq (leading column).
    index("partner_settlements_approval_idx").on(t.approvalRequestId),
    index("partner_settlements_approved_by_idx").on(t.approvedByUserId),
    index("partner_settlements_invoice_file_idx").on(t.partnerInvoiceFileId),
    index("partner_settlements_created_by_idx").on(t.createdByUserId),
    check("partner_settlements_period_chk", sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      "partner_settlements_amounts_chk",
      sql`${t.amountMinor} >= 0 and ${t.withholdingTaxMinor} >= 0 and ${t.withholdingTaxMinor} <= ${t.amountMinor}`,
    ),
    check("partner_settlements_paid_chk", sql`${t.status} <> 'paid' or ${t.paidAt} is not null`),
  ],
);

/**
 * Lines of a settlement. `currency` always equals the settlement currency (composite FK; a
 * currency change on a draft settlement cascades). A placement fee can be settled only once:
 * lines of cancelled settlements are voided (`voidedAt`), which frees the placement again.
 */
export const partnerSettlementLines = pgTable(
  "partner_settlement_lines",
  {
    id: pk(),
    /** Declared before settlementId: composite-FK column order must equal column and alphabetical order (rule 5). */
    currency: currencyCode().notNull(),
    settlementId: uuid().notNull(),
    kind: text({ enum: PARTNER_SETTLEMENT_LINE_KINDS }).notNull(),
    placementId: uuid().references(() => placements.id),
    description: text().notNull(),
    /** Positive; `deduction` lines are subtracted from the settlement total. */
    amountMinor: moneyMinor().notNull(),
    voidedAt: tstz(),
    ...createdAtOnly,
  },
  (t) => [
    foreignKey({
      name: "partner_settlement_lines_settlement_currency_fk",
      columns: [t.currency, t.settlementId],
      foreignColumns: [partnerSettlements.currency, partnerSettlements.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("partner_settlement_lines_settlement_idx").on(t.settlementId),
    index("partner_settlement_lines_placement_idx").on(t.placementId),
    uniqueIndex("partner_settlement_lines_placement_fee_uq")
      .on(t.placementId)
      .where(sql`${t.kind} = 'placement_fee' and ${t.voidedAt} is null`),
    check("partner_settlement_lines_amount_chk", sql`${t.amountMinor} > 0`),
    check("partner_settlement_lines_placement_chk", sql`${t.kind} <> 'placement_fee' or ${t.placementId} is not null`),
  ],
);
