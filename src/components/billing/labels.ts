/**
 * Labels, tones and option lists for billing UI (client-safe). Enumerations come from
 * src/modules/commercial/constants.ts so they never drift from the schema.
 */
import type { SelectOption } from "@/components/shared/types";
import type { Tone } from "@/components/shared/tones";
import {
  BILLING_INTERVAL_OPTIONS,
  COUPON_DISCOUNT_TYPE_OPTIONS,
  COUPON_DURATION_OPTIONS,
  DISPUTE_STATUS_OPTIONS,
  FEATURE_PERIOD_OPTIONS,
  FEATURE_RESET_OPTIONS,
  GST_STATE_CODES,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TAX_TREATMENT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_PROVIDER_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PLAN_AUDIENCE_OPTIONS,
  REFUND_STATUS_OPTIONS,
  SETTLEMENT_LINE_KIND_OPTIONS,
  SETTLEMENT_STATUS_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS,
  TAX_ID_TYPE_OPTIONS,
  TAX_RATE_KIND_OPTIONS,
} from "@/modules/commercial/constants";

export const INTERVAL_LABELS: Record<(typeof BILLING_INTERVAL_OPTIONS)[number], string> = {
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
  one_time: "One-time",
};

/** "per month" style suffix shown after a price. */
export const INTERVAL_SUFFIX: Record<(typeof BILLING_INTERVAL_OPTIONS)[number], string> = {
  month: "per month",
  quarter: "per quarter",
  year: "per year",
  one_time: "one-time",
};

export const AUDIENCE_LABELS: Record<(typeof PLAN_AUDIENCE_OPTIONS)[number], string> = {
  employer: "Employers",
  recruitment_partner: "Recruitment partners",
  institution: "Institutions",
};

export const PROVIDER_LABELS: Record<(typeof PAYMENT_PROVIDER_OPTIONS)[number], string> = {
  manual: "Manual entry",
  bank_transfer: "Bank transfer",
  razorpay: "Razorpay",
  stripe: "Stripe",
  upi_manual: "UPI (manual)",
  cheque: "Cheque",
};

export const METHOD_LABELS: Record<(typeof PAYMENT_METHOD_OPTIONS)[number], string> = {
  card: "Card",
  upi: "UPI",
  netbanking: "Net banking",
  wallet: "Wallet",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

export const PERIOD_LABELS: Record<(typeof FEATURE_PERIOD_OPTIONS)[number], string> = {
  none: "Standing limit",
  month: "Per month",
  year: "Per year",
};

export const RESET_LABELS: Record<(typeof FEATURE_RESET_OPTIONS)[number], string> = {
  none: "Not applicable",
  reset: "Unused allowance expires",
  rollover: "Unused allowance rolls over",
};

export const TAX_TREATMENT_LABELS: Record<(typeof INVOICE_TAX_TREATMENT_OPTIONS)[number] | "auto", string> = {
  auto: "Automatic (from seller and buyer details)",
  standard: "Standard",
  export: "Export of services (zero-rated)",
  sez: "Supply to SEZ (zero-rated)",
  reverse_charge: "Reverse charge",
  exempt: "Exempt",
  out_of_scope: "Out of scope",
};

export const TAX_ID_TYPE_LABELS: Record<(typeof TAX_ID_TYPE_OPTIONS)[number], string> = {
  gstin: "GSTIN (India)",
  vat: "VAT number",
  trn: "TRN (Gulf VAT)",
  ein: "EIN (United States)",
  abn: "ABN (Australia)",
  uen: "UEN (Singapore)",
  other: "Other tax number",
};

export const TAX_KIND_OPTION_LABELS: Record<(typeof TAX_RATE_KIND_OPTIONS)[number], string> = {
  gst_cgst: "CGST (India, same state)",
  gst_sgst: "SGST (India, same state)",
  gst_igst: "IGST (India, inter-state)",
  vat: "VAT",
  sales_tax: "Sales tax",
  none: "No tax",
};

export const SETTLEMENT_LINE_KIND_LABELS: Record<(typeof SETTLEMENT_LINE_KIND_OPTIONS)[number], string> = {
  placement_fee: "Placement fee",
  bonus: "Bonus",
  adjustment: "Adjustment",
  deduction: "Deduction",
};

export const COUPON_DURATION_LABELS: Record<(typeof COUPON_DURATION_OPTIONS)[number], string> = {
  once: "First invoice only",
  repeating: "A number of billing cycles",
  forever: "Every invoice",
};

export const COUPON_TYPE_LABELS: Record<(typeof COUPON_DISCOUNT_TYPE_OPTIONS)[number], string> = {
  percent: "Percentage off",
  fixed: "Fixed amount off",
};

const SUBSCRIPTION_TONES: Record<(typeof SUBSCRIPTION_STATUS_OPTIONS)[number], { tone: Tone; label: string }> = {
  pending: { tone: "warning", label: "Awaiting payment" },
  trialing: { tone: "info", label: "Trial" },
  active: { tone: "success", label: "Active" },
  past_due: { tone: "danger", label: "Past due" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  expired: { tone: "neutral", label: "Expired" },
  paused: { tone: "neutral", label: "Paused" },
};

const REFUND_TONES: Record<(typeof REFUND_STATUS_OPTIONS)[number], { tone: Tone; label: string }> = {
  requested: { tone: "warning", label: "Awaiting approval" },
  approved: { tone: "info", label: "Approved" },
  processing: { tone: "info", label: "Processing" },
  completed: { tone: "success", label: "Completed" },
  rejected: { tone: "neutral", label: "Rejected" },
  failed: { tone: "danger", label: "Failed" },
};

const DISPUTE_TONES: Record<(typeof DISPUTE_STATUS_OPTIONS)[number], { tone: Tone; label: string }> = {
  open: { tone: "warning", label: "Open" },
  under_review: { tone: "info", label: "Under review" },
  resolved: { tone: "success", label: "Resolved" },
  rejected: { tone: "neutral", label: "Rejected" },
};

const SETTLEMENT_TONES: Record<(typeof SETTLEMENT_STATUS_OPTIONS)[number], { tone: Tone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  pending_approval: { tone: "warning", label: "Awaiting approval" },
  approved: { tone: "info", label: "Approved" },
  paid: { tone: "success", label: "Paid" },
  disputed: { tone: "danger", label: "Queried by partner" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export type BillingStatusKind = "subscription" | "refund" | "dispute" | "settlement";

const TONE_TABLES: Record<BillingStatusKind, Record<string, { tone: Tone; label: string }>> = {
  subscription: SUBSCRIPTION_TONES,
  refund: REFUND_TONES,
  dispute: DISPUTE_TONES,
  settlement: SETTLEMENT_TONES,
};

/** Tone + label for statuses StatusBadge has no preset for. */
export function billingStatus(kind: BillingStatusKind, status: string): { tone: Tone; label: string } {
  return TONE_TABLES[kind][status] ?? { tone: "neutral", label: status.replace(/_/g, " ") };
}

function options<T extends string>(values: readonly T[], labels: Record<T, string>): SelectOption[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

function statusOptions(kind: BillingStatusKind, values: readonly string[]): SelectOption[] {
  return values.map((value) => ({ value, label: billingStatus(kind, value).label }));
}

export const OPTIONS = {
  interval: options(BILLING_INTERVAL_OPTIONS, INTERVAL_LABELS),
  audience: options(PLAN_AUDIENCE_OPTIONS, AUDIENCE_LABELS),
  provider: options(PAYMENT_PROVIDER_OPTIONS, PROVIDER_LABELS),
  method: options(PAYMENT_METHOD_OPTIONS, METHOD_LABELS),
  period: options(FEATURE_PERIOD_OPTIONS, PERIOD_LABELS),
  reset: options(FEATURE_RESET_OPTIONS, RESET_LABELS),
  taxTreatment: options(["auto", ...INVOICE_TAX_TREATMENT_OPTIONS] as const, TAX_TREATMENT_LABELS),
  taxIdType: options(TAX_ID_TYPE_OPTIONS, TAX_ID_TYPE_LABELS),
  taxKind: options(TAX_RATE_KIND_OPTIONS, TAX_KIND_OPTION_LABELS),
  settlementLineKind: options(
    SETTLEMENT_LINE_KIND_OPTIONS.filter((k) => k !== "placement_fee"),
    SETTLEMENT_LINE_KIND_LABELS,
  ),
  couponDuration: options(COUPON_DURATION_OPTIONS, COUPON_DURATION_LABELS),
  couponType: options(COUPON_DISCOUNT_TYPE_OPTIONS, COUPON_TYPE_LABELS),
  invoiceStatus: [
    { value: "open", label: "Open (unpaid)" },
    ...INVOICE_STATUS_OPTIONS.map((s) => ({ value: s, label: s === "partially_paid" ? "Partially paid" : s.charAt(0).toUpperCase() + s.slice(1) })),
  ] as SelectOption[],
  paymentStatus: PAYMENT_STATUS_OPTIONS.map((s) => ({ value: s, label: s === "partially_refunded" ? "Partially refunded" : s.charAt(0).toUpperCase() + s.slice(1) })) as SelectOption[],
  subscriptionStatus: statusOptions("subscription", SUBSCRIPTION_STATUS_OPTIONS),
  refundStatus: statusOptions("refund", REFUND_STATUS_OPTIONS),
  disputeStatus: statusOptions("dispute", DISPUTE_STATUS_OPTIONS),
  settlementStatus: statusOptions("settlement", SETTLEMENT_STATUS_OPTIONS),
  gstState: Object.entries(GST_STATE_CODES)
    .filter(([code]) => code !== "96" && code !== "97")
    .map(([value, name]) => ({ value, label: `${value} – ${name}` })) as SelectOption[],
} as const;
