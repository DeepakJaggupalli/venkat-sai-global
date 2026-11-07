/**
 * Commercial constants shared by services, queries and UI (client-safe: no server imports).
 */
import type { EmployerPermission, InstitutionPermission, PartnerPermission } from "@/config/permissions";
import type { OrgType } from "@/db/schema/_constants";
import type {
  BillingInterval,
  CouponDiscountType,
  CouponDuration,
  DisputeStatus,
  InvoiceStatus,
  InvoiceTaxTreatment,
  PartnerSettlementLineKind,
  PartnerSettlementStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PlanFeaturePeriod,
  PlanFeatureResetPolicy,
  PlanKind,
  RefundStatus,
  SubscriptionStatus,
  TaxIdType,
  TaxRateKind,
} from "@/db/schema/commercial";

// Type-only import: entitlements.ts is server-only, but types are erased at compile time.
import type { EntitlementKey } from "./entitlements";

// ---------------------------------------------------------------------------
// Client-safe copies of the schema enumerations (forms and badges must not import the schema graph).
// The assertions below fail to compile if a copy drifts from src/db/schema/commercial.ts.
// ---------------------------------------------------------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <A, B>(value: Same<A, B>): Same<A, B> => value;

export const PLAN_AUDIENCE_OPTIONS = ["employer", "recruitment_partner", "institution"] as const satisfies readonly OrgType[];
export const PLAN_KIND_OPTIONS = ["base", "add_on"] as const;
export const BILLING_INTERVAL_OPTIONS = ["month", "quarter", "year", "one_time"] as const;
export const FEATURE_PERIOD_OPTIONS = ["none", "month", "year"] as const;
export const FEATURE_RESET_OPTIONS = ["none", "reset", "rollover"] as const;
export const COUPON_DISCOUNT_TYPE_OPTIONS = ["percent", "fixed"] as const;
export const COUPON_DURATION_OPTIONS = ["once", "repeating", "forever"] as const;
export const TAX_ID_TYPE_OPTIONS = ["gstin", "vat", "trn", "ein", "abn", "uen", "other"] as const;
export const TAX_RATE_KIND_OPTIONS = ["gst_cgst", "gst_sgst", "gst_igst", "vat", "sales_tax", "none"] as const;
export const INVOICE_STATUS_OPTIONS = ["draft", "issued", "paid", "partially_paid", "void", "overdue", "refunded"] as const;
export const INVOICE_TAX_TREATMENT_OPTIONS = ["standard", "export", "sez", "reverse_charge", "exempt", "out_of_scope"] as const;
export const PAYMENT_PROVIDER_OPTIONS = ["manual", "bank_transfer", "razorpay", "stripe", "upi_manual", "cheque"] as const;
export const PAYMENT_STATUS_OPTIONS = ["pending", "succeeded", "failed", "refunded", "partially_refunded"] as const;
export const PAYMENT_METHOD_OPTIONS = ["card", "upi", "netbanking", "wallet", "bank_transfer", "cheque", "cash", "other"] as const;
export const REFUND_STATUS_OPTIONS = ["requested", "approved", "processing", "completed", "rejected", "failed"] as const;
export const DISPUTE_STATUS_OPTIONS = ["open", "under_review", "resolved", "rejected"] as const;
export const SUBSCRIPTION_STATUS_OPTIONS = ["pending", "trialing", "active", "past_due", "cancelled", "expired", "paused"] as const;
export const SETTLEMENT_STATUS_OPTIONS = ["draft", "pending_approval", "approved", "paid", "disputed", "cancelled"] as const;
export const SETTLEMENT_LINE_KIND_OPTIONS = ["placement_fee", "bonus", "adjustment", "deduction"] as const;

export const ENUM_SYNC = [
  same<(typeof PLAN_KIND_OPTIONS)[number], PlanKind>(true),
  same<(typeof BILLING_INTERVAL_OPTIONS)[number], BillingInterval>(true),
  same<(typeof FEATURE_PERIOD_OPTIONS)[number], PlanFeaturePeriod>(true),
  same<(typeof FEATURE_RESET_OPTIONS)[number], PlanFeatureResetPolicy>(true),
  same<(typeof COUPON_DISCOUNT_TYPE_OPTIONS)[number], CouponDiscountType>(true),
  same<(typeof COUPON_DURATION_OPTIONS)[number], CouponDuration>(true),
  same<(typeof TAX_ID_TYPE_OPTIONS)[number], TaxIdType>(true),
  same<(typeof TAX_RATE_KIND_OPTIONS)[number], TaxRateKind>(true),
  same<(typeof INVOICE_STATUS_OPTIONS)[number], InvoiceStatus>(true),
  same<(typeof INVOICE_TAX_TREATMENT_OPTIONS)[number], InvoiceTaxTreatment>(true),
  same<(typeof PAYMENT_PROVIDER_OPTIONS)[number], PaymentProvider>(true),
  same<(typeof PAYMENT_STATUS_OPTIONS)[number], PaymentStatus>(true),
  same<(typeof PAYMENT_METHOD_OPTIONS)[number], PaymentMethod>(true),
  same<(typeof REFUND_STATUS_OPTIONS)[number], RefundStatus>(true),
  same<(typeof DISPUTE_STATUS_OPTIONS)[number], DisputeStatus>(true),
  same<(typeof SUBSCRIPTION_STATUS_OPTIONS)[number], SubscriptionStatus>(true),
  same<(typeof SETTLEMENT_STATUS_OPTIONS)[number], PartnerSettlementStatus>(true),
  same<(typeof SETTLEMENT_LINE_KIND_OPTIONS)[number], PartnerSettlementLineKind>(true),
] as const;

/**
 * How an entitlement is measured.
 *  - `counted`: usage is counted from real data (published jobs, members, requests…). The limit is the sum of
 *    the plan features of every live subscription (base + add-ons). Credit packs do not apply.
 *  - `credit`: usage is drawn from the credit ledger. Plan allowances are granted at the start of each feature
 *    window; purchased credit packs top the balance up; consumption is row-locked so a balance never goes
 *    below zero while limits are enforced.
 */
export type EntitlementMode = "counted" | "credit";

export type EntitlementMeta = {
  label: string;
  /** Singular noun for one unit ("job post"). */
  unit: string;
  unitPlural: string;
  mode: EntitlementMode;
  /**
   * Counted keys only: true = a standing cap (things that exist now: live job posts, members); false = things
   * created inside the current window (requests or submissions this month).
   */
  standing: boolean;
  /** Organisation types the key is relevant to (UI grouping; enforcement does not depend on it). */
  audiences: readonly OrgType[];
  description: string;
};

export const ENTITLEMENTS: Record<EntitlementKey, EntitlementMeta> = {
  job_posts: {
    label: "Job posts",
    unit: "job post",
    unitPlural: "job posts",
    mode: "counted",
    standing: true,
    audiences: ["employer"],
    description: "Published job postings at the same time (a monthly or yearly period limits jobs published in the period).",
  },
  featured_jobs: {
    label: "Featured jobs",
    unit: "featured job",
    unitPlural: "featured jobs",
    mode: "counted",
    standing: true,
    audiences: ["employer"],
    description: "Jobs featured at the same time (a monthly or yearly period limits promotions started in the period).",
  },
  candidate_unlocks: {
    label: "Candidate unlocks",
    unit: "candidate unlock",
    unitPlural: "candidate unlocks",
    mode: "credit",
    standing: false,
    audiences: ["employer"],
    description: "Reveal a candidate's contact details (credits).",
  },
  candidate_search: {
    label: "Candidate database search",
    unit: "candidate search",
    unitPlural: "candidate searches",
    mode: "credit",
    standing: false,
    audiences: ["employer"],
    description: "Access to the candidate database search.",
  },
  team_seats: {
    label: "Team seats",
    unit: "team seat",
    unitPlural: "team seats",
    mode: "counted",
    standing: true,
    audiences: ["employer", "recruitment_partner", "institution"],
    description: "Active members of the organisation.",
  },
  bulk_requirements: {
    label: "Bulk manpower requests",
    unit: "manpower request",
    unitPlural: "manpower requests",
    mode: "counted",
    standing: false,
    audiences: ["employer"],
    description: "Workforce / bulk requirement requests submitted in the period.",
  },
  partner_submissions: {
    label: "Candidate submissions",
    unit: "candidate submission",
    unitPlural: "candidate submissions",
    mode: "counted",
    standing: false,
    audiences: ["recruitment_partner"],
    description: "Candidates submitted to assigned requirements in the period.",
  },
  courses: {
    label: "Courses",
    unit: "course",
    unitPlural: "courses",
    mode: "counted",
    standing: true,
    audiences: ["institution"],
    description: "Courses listed (not archived) at the same time (a monthly or yearly period limits courses created in the period).",
  },
  analytics_reports: {
    label: "Advanced reports",
    unit: "report",
    unitPlural: "reports",
    mode: "credit",
    standing: false,
    audiences: ["employer", "recruitment_partner", "institution"],
    description: "Access to advanced reports.",
  },
};

/** Every entitlement key (client-safe copy of ENTITLEMENT_KEYS; the Record type above keeps them in sync). */
export const ENTITLEMENT_KEY_LIST = Object.keys(ENTITLEMENTS) as EntitlementKey[];

export function isEntitlementKey(value: unknown): value is EntitlementKey {
  return typeof value === "string" && Object.hasOwn(ENTITLEMENTS, value);
}

export function entitlementLabel(key: EntitlementKey): string {
  return ENTITLEMENTS[key].label;
}

/** Member permission that may SEE billing (invoices, plan, usage) per organisation type. */
export const BILLING_VIEW_PERMISSION = {
  employer: "employer.billing.view",
  recruitment_partner: "partner.billing.manage",
  institution: "institution.billing.manage",
} as const satisfies { employer: EmployerPermission; recruitment_partner: PartnerPermission; institution: InstitutionPermission };

/** Member permission that may BUY (subscribe, change plan, pay, edit billing details) per organisation type. */
export const BILLING_MANAGE_PERMISSION = {
  employer: "employer.billing.manage",
  recruitment_partner: "partner.billing.manage",
  institution: "institution.billing.manage",
} as const satisfies { employer: EmployerPermission; recruitment_partner: PartnerPermission; institution: InstitutionPermission };

/** Portal billing page per organisation type (notification links). */
export const PORTAL_BILLING_PATH: Record<OrgType, string> = {
  employer: "/employer/billing",
  recruitment_partner: "/recruiter/billing",
  institution: "/institution/billing",
};

export const PARTNER_SETTLEMENTS_PATH = "/recruiter/settlements";

/** Shared billing pages owned by the commercial module. */
export const BILLING_PATHS = {
  invoice: (invoiceId: string) => `/billing/invoices/${invoiceId}`,
  checkoutSuccess: "/billing/checkout/success",
  checkoutCancel: "/billing/checkout/cancel",
} as const;

/** Command Centre pages (built by the admin UI team) linked from approvals and notifications. */
export const ADMIN_COMMERCIAL_PATHS = {
  home: "/admin/commercial",
  invoice: (id: string) => `/admin/commercial/invoices/${id}`,
  refund: (id: string) => `/admin/commercial/refunds/${id}`,
  subscription: (id: string) => `/admin/commercial/subscriptions/${id}`,
  settlement: (id: string) => `/admin/commercial/settlements/${id}`,
  dispute: (id: string) => `/admin/commercial/disputes/${id}`,
} as const;

/**
 * Defaults for commercial configuration values that are not (yet) in the settings catalogue
 * (src/config/settings.ts). They are read from `platform_settings` by key when a row exists, so they become
 * editable as soon as the keys are added to the catalogue. See README → Configuration.
 */
export const COMMERCIAL_CONFIG_DEFAULTS = {
  /** Days a past-due subscription stays live before it expires. */
  "commercial.grace_period_days": 7,
  /** Days from issue until an invoice is due. */
  "commercial.invoice_due_days": 15,
  /** Export of services (buyer outside India) is zero-rated (LUT) instead of charged IGST. */
  "commercial.export_zero_rated": true,
  /** HSN / SAC code printed on invoice lines that have none (9985 = support services). */
  "commercial.default_tax_code": "9985",
} as const;

export type CommercialConfigKey = keyof typeof COMMERCIAL_CONFIG_DEFAULTS;

/** Renewal reminders are sent this many days before the period ends. */
export const RENEWAL_REMINDER_DAYS = [7, 1] as const;

/** Renewal invoices are issued this many days before the period ends (due on the period end). */
export const RENEWAL_INVOICE_LEAD_DAYS = 7;

/** Gateway checkouts not completed within this many hours are marked failed. */
export const PENDING_CHECKOUT_TTL_HOURS = 24;

/** Notify "credits running low" when the remaining balance falls to this share of the window allowance (min 1). */
export const CREDITS_LOW_RATIO = 0.1;

/** Upper bound for amounts typed by staff (minor units), to catch typos before they hit the database. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

/** GST state code used as place of supply for supplies to a foreign country (IGST charged). */
export const GST_FOREIGN_PLACE_OF_SUPPLY = "96";

/**
 * Indian GST state codes (first two digits of a GSTIN; place of supply on GST invoices). Public reference data
 * for selects and invoice display. 97 = other territory, 96 = foreign country (IGST charged to a foreign buyer).
 */
export const GST_STATE_CODES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other territory",
  "96": "Foreign country",
};

/** "37 – Andhra Pradesh" for a GST state code; other values (country codes) are returned as they are. */
export function placeOfSupplyLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const name = GST_STATE_CODES[value];
  return name ? `${value} – ${name}` : value;
}
