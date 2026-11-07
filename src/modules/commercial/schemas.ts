/**
 * Zod schemas for commercial forms and actions (client-safe: no server imports).
 *
 * Money typed by people is a decimal STRING ("1250.50"); services convert it to minor units with the currency's
 * decimals (money.ts → parseDecimalToMinor), rejecting extra decimals instead of rounding.
 */
import { z } from "zod";

import { f } from "@/lib/validation";

import {
  BILLING_INTERVAL_OPTIONS as BILLING_INTERVALS,
  COUPON_DISCOUNT_TYPE_OPTIONS as COUPON_DISCOUNT_TYPES,
  COUPON_DURATION_OPTIONS as COUPON_DURATIONS,
  DISPUTE_STATUS_OPTIONS as DISPUTE_STATUSES,
  ENTITLEMENT_KEY_LIST,
  FEATURE_PERIOD_OPTIONS as PLAN_FEATURE_PERIODS,
  FEATURE_RESET_OPTIONS as PLAN_FEATURE_RESET_POLICIES,
  INVOICE_TAX_TREATMENT_OPTIONS as INVOICE_TAX_TREATMENTS,
  PAYMENT_METHOD_OPTIONS as PAYMENT_METHODS,
  PLAN_AUDIENCE_OPTIONS as PLAN_AUDIENCES,
  PLAN_KIND_OPTIONS as PLAN_KINDS,
  SETTLEMENT_LINE_KIND_OPTIONS as PARTNER_SETTLEMENT_LINE_KINDS,
  TAX_ID_TYPE_OPTIONS as TAX_ID_TYPES,
  TAX_RATE_KIND_OPTIONS as TAX_RATE_KINDS,
} from "./constants";

const ENTITLEMENT_ENUM = ENTITLEMENT_KEY_LIST as unknown as readonly [string, ...string[]];

/** Decimal amount as typed ("1,250.50"); converted to minor units by the service. */
export const decimalAmount = (label = "Amount") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .regex(/^\d[\d,_ ]*(\.\d+)?$/, `Enter ${label.toLowerCase()} such as 1250.50`);

export const optionalDecimalAmount = (label = "Amount") => decimalAmount(label).optional();

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

// ---------------------------------------------------------------------------
// Plans, prices, features
// ---------------------------------------------------------------------------

export const planFormSchema = z.object({
  key: z
    .string({ error: "Key is required" })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_]{1,63}$/, "Use 2–64 lowercase letters, digits or underscores"),
  name: f.text({ label: "Name", max: 120 }),
  description: f.longText(2000),
  audience: f.enumOf(PLAN_AUDIENCES),
  kind: f.enumOf(PLAN_KINDS).default("base"),
  isPublic: f.bool(),
  isActive: f.bool(),
  contactSalesOnly: f.bool(),
  sortOrder: f.optionalInt({ min: 0, max: 10_000 }),
  trialDays: f.optionalInt({ min: 0, max: 365 }),
  highlights: f.stringArray().pipe(z.array(z.string().max(160, "Keep each highlight under 160 characters")).max(12, "Use at most 12 highlights")),
});
export type PlanFormInput = z.output<typeof planFormSchema>;

export const planUpdateSchema = planFormSchema.omit({ key: true, audience: true, kind: true }).extend({ id: f.uuid() });
export type PlanUpdateInput = z.output<typeof planUpdateSchema>;

export const planPriceFormSchema = z.object({
  planId: f.uuid(),
  currency: f.currencyCode(),
  interval: f.enumOf(BILLING_INTERVALS),
  amount: decimalAmount("Price"),
  taxInclusive: f.bool(),
});
export type PlanPriceFormInput = z.output<typeof planPriceFormSchema>;

export const planFeatureFormSchema = z
  .object({
    planId: f.uuid(),
    entitlementKey: z.enum(ENTITLEMENT_ENUM, { error: "Choose a feature" }),
    unlimited: f.bool(),
    limitValue: f.optionalInt({ min: 0, max: 10_000_000 }),
    period: f.enumOf(PLAN_FEATURE_PERIODS).default("none"),
    resetPolicy: f.enumOf(PLAN_FEATURE_RESET_POLICIES).default("none"),
  })
  .superRefine((v, ctx) => {
    if (!v.unlimited && v.limitValue === undefined) ctx.addIssue({ code: "custom", path: ["limitValue"], message: "Enter a limit or choose unlimited" });
    if ((v.period === "none") !== (v.resetPolicy === "none")) {
      ctx.addIssue({ code: "custom", path: ["resetPolicy"], message: v.period === "none" ? "A standing limit has no reset policy" : "Choose whether unused allowance resets or rolls over" });
    }
  });
export type PlanFeatureFormInput = z.output<typeof planFeatureFormSchema>;

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const couponFormSchema = z
  .object({
    id: f.optionalUuid(),
    code: z
      .string({ error: "Code is required" })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, "Use 3–40 letters, digits, - or _"),
    description: f.optionalText(500),
    discountType: f.enumOf(COUPON_DISCOUNT_TYPES),
    percentOff: f.optionalInt({ min: 1, max: 100 }),
    amountOff: optionalDecimalAmount("Discount"),
    currency: f.currencyCode().optional(),
    duration: f.enumOf(COUPON_DURATIONS).default("once"),
    durationCycles: f.optionalInt({ min: 1, max: 120 }),
    maxRedemptions: f.optionalInt({ min: 1, max: 1_000_000 }),
    maxRedemptionsPerOrganization: f.optionalInt({ min: 1, max: 1_000 }),
    validFrom: f.optionalDate(),
    validUntil: f.optionalDate(),
    planIds: f.uuidArray(),
    isActive: f.bool(),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "percent" && v.percentOff === undefined) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "Enter the percentage" });
    if (v.discountType === "fixed") {
      if (!v.amountOff) ctx.addIssue({ code: "custom", path: ["amountOff"], message: "Enter the discount amount" });
      if (!v.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Fixed discounts need a currency" });
    }
    if (v.duration === "repeating" && v.durationCycles === undefined) ctx.addIssue({ code: "custom", path: ["durationCycles"], message: "Enter the number of billing cycles" });
    if (v.validFrom && v.validUntil && v.validUntil <= v.validFrom) ctx.addIssue({ code: "custom", path: ["validUntil"], message: "Must be after the start date" });
  });
export type CouponFormInput = z.output<typeof couponFormSchema>;

export const couponCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(3, "Enter a coupon code").max(40),
});

// ---------------------------------------------------------------------------
// Billing profiles
// ---------------------------------------------------------------------------

export const billingProfileFormSchema = z
  .object({
    /** Staff only: which organisation (members always edit their own). */
    organizationId: f.optionalUuid(),
    legalName: f.text({ label: "Legal name", max: 200 }),
    contactName: f.optionalText(120),
    billingEmail: f.email(),
    billingPhone: f.optionalPhone(),
    addressLine1: f.text({ label: "Address", max: 200 }),
    addressLine2: f.optionalText(200),
    city: f.text({ label: "City", max: 100 }),
    stateRegion: f.optionalText(100),
    stateCode: z.string().trim().max(10).optional(),
    postalCode: f.optionalText(20),
    countryCode: f.countryCode(),
    taxIdType: f.enumOf(TAX_ID_TYPES).optional(),
    taxId: z.string().trim().toUpperCase().max(30).optional(),
    taxExempt: f.bool(),
    taxExemptReason: f.optionalText(300),
    currency: f.currencyCode(),
  })
  .superRefine((v, ctx) => {
    if (v.countryCode === "IN") {
      if (!v.stateCode || !/^[0-9]{2}$/.test(v.stateCode)) {
        ctx.addIssue({ code: "custom", path: ["stateCode"], message: "Enter the two-digit GST state code (for example 37 for Andhra Pradesh)" });
      }
      if (v.taxId) {
        if (!GSTIN_RE.test(v.taxId)) ctx.addIssue({ code: "custom", path: ["taxId"], message: "Enter a valid 15-character GSTIN" });
        else if (v.stateCode && v.taxId.slice(0, 2) !== v.stateCode) ctx.addIssue({ code: "custom", path: ["taxId"], message: "The GSTIN does not match the state code" });
      }
    }
    if (v.taxId && !v.taxIdType && v.countryCode !== "IN") ctx.addIssue({ code: "custom", path: ["taxIdType"], message: "Choose the type of tax number" });
    if (v.taxExempt && !v.taxExemptReason) ctx.addIssue({ code: "custom", path: ["taxExemptReason"], message: "Explain why the organisation is tax exempt (for example SEZ unit under LUT)" });
  });
export type BillingProfileFormInput = z.output<typeof billingProfileFormSchema>;

// ---------------------------------------------------------------------------
// Tax rates
// ---------------------------------------------------------------------------

export const taxRateFormSchema = z
  .object({
    id: f.optionalUuid(),
    name: f.text({ label: "Name", max: 80 }),
    countryCode: f.countryCode(),
    region: z.string().trim().max(10).optional(),
    kind: f.enumOf(TAX_RATE_KINDS),
    ratePercent: z
      .string({ error: "Rate is required" })
      .trim()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage such as 18 or 2.5"),
    taxCode: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z]{2,10}$/, "Enter an HSN / SAC code such as 9985")
      .optional(),
    isActive: f.bool(),
    effectiveFrom: f.date(),
    effectiveUntil: f.optionalDate(),
    notes: f.optionalText(1000),
  })
  .superRefine((v, ctx) => {
    const bp = Math.round(Number(v.ratePercent) * 100);
    if (bp > 10_000) ctx.addIssue({ code: "custom", path: ["ratePercent"], message: "The rate cannot exceed 100%" });
    if (v.effectiveUntil && v.effectiveUntil <= v.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "Must be after the start date" });
  });
export type TaxRateFormInput = z.output<typeof taxRateFormSchema>;

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const invoiceLineInputSchema = z.object({
  description: f.text({ label: "Description", max: 300 }),
  quantity: f.int({ min: 1, max: 100_000 }),
  unitAmount: decimalAmount("Unit price"),
  discount: optionalDecimalAmount("Discount"),
  taxCode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{2,10}$/, "Enter an HSN / SAC code")
    .optional(),
});
export type InvoiceLineInput = z.output<typeof invoiceLineInputSchema>;

export const manualInvoiceSchema = z
  .object({
    id: f.optionalUuid(),
    organizationId: f.optionalUuid(),
    buyerUserId: f.optionalUuid(),
    currency: f.currencyCode(),
    lines: z.array(invoiceLineInputSchema).min(1, "Add at least one line").max(100, "Use at most 100 lines"),
    notes: f.longText(2000),
    internalNotes: f.longText(2000),
    purchaseOrderReference: f.optionalText(100),
    dueDays: f.optionalInt({ min: 0, max: 120 }),
    taxTreatment: z.enum(["auto", ...INVOICE_TAX_TREATMENTS]).default("auto"),
    servicePeriodStart: f.optionalDate(),
    servicePeriodEnd: f.optionalDate(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.organizationId) === Boolean(v.buyerUserId)) ctx.addIssue({ code: "custom", path: ["organizationId"], message: "Choose an organisation or an individual buyer" });
    if (v.servicePeriodStart && v.servicePeriodEnd && v.servicePeriodEnd < v.servicePeriodStart) {
      ctx.addIssue({ code: "custom", path: ["servicePeriodEnd"], message: "Must be on or after the start date" });
    }
  });
export type ManualInvoiceInput = z.output<typeof manualInvoiceSchema>;

export const invoiceIdSchema = z.object({ invoiceId: f.uuid() });

export const voidInvoiceSchema = z.object({
  invoiceId: f.uuid(),
  reason: f.text({ label: "Reason", min: 5, max: 500 }),
});

export const applyCouponSchema = z.object({ invoiceId: f.uuid(), code: couponCodeSchema.shape.code });

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const OFFLINE_PAYMENT_PROVIDERS = ["bank_transfer", "upi_manual", "cheque", "manual"] as const;
export type OfflinePaymentProvider = (typeof OFFLINE_PAYMENT_PROVIDERS)[number];

export const offlinePaymentSchema = z
  .object({
    invoiceId: f.optionalUuid(),
    organizationId: f.optionalUuid(),
    provider: f.enumOf(OFFLINE_PAYMENT_PROVIDERS),
    method: f.enumOf(PAYMENT_METHODS).optional(),
    amount: decimalAmount("Amount"),
    currency: f.currencyCode(),
    /** Bank UTR, UPI transaction reference or cheque number. */
    externalReference: f.optionalText(100),
    receivedAt: f.date(),
    proofFileId: f.optionalUuid(),
    notes: f.optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (!v.invoiceId && !v.organizationId) ctx.addIssue({ code: "custom", path: ["invoiceId"], message: "Choose the invoice (or the organisation for an advance payment)" });
    if (v.provider !== "manual" && !v.externalReference) {
      ctx.addIssue({ code: "custom", path: ["externalReference"], message: v.provider === "cheque" ? "Enter the cheque number" : "Enter the UTR / UPI transaction reference" });
    }
  });
export type OfflinePaymentInput = z.output<typeof offlinePaymentSchema>;

export const allocatePaymentSchema = z.object({ paymentId: f.uuid(), invoiceId: f.uuid() });

export const razorpayVerifySchema = z.object({
  orderId: z.string().trim().min(5).max(64),
  paymentId: z.string().trim().min(5).max(64),
  signature: z.string().trim().regex(/^[0-9a-f]{64}$/i, "Invalid signature"),
});

export const checkoutSchema = z.object({ invoiceId: f.uuid(), provider: z.enum(["razorpay", "stripe"]) });

// ---------------------------------------------------------------------------
// Refunds & disputes
// ---------------------------------------------------------------------------

export const refundRequestSchema = z.object({
  paymentId: f.uuid(),
  /** Blank = the full refundable amount. */
  amount: optionalDecimalAmount("Refund amount"),
  reason: f.text({ label: "Reason", min: 10, max: 1000 }),
});
export type RefundRequestInput = z.output<typeof refundRequestSchema>;

export const completeManualRefundSchema = z.object({
  refundId: f.uuid(),
  reference: f.text({ label: "Payout reference", max: 100 }),
  processedAt: f.date(),
});

export const disputeOpenSchema = z
  .object({
    paymentId: f.optionalUuid(),
    invoiceId: f.optionalUuid(),
    amount: optionalDecimalAmount("Disputed amount"),
    reason: f.text({ label: "Reason", min: 10, max: 2000 }),
  })
  .superRefine((v, ctx) => {
    if (!v.paymentId && !v.invoiceId) ctx.addIssue({ code: "custom", path: ["invoiceId"], message: "Choose the invoice or payment in dispute" });
  });
export type DisputeOpenInput = z.output<typeof disputeOpenSchema>;

export const disputeDecisionSchema = z.object({
  disputeId: f.uuid(),
  status: f.enumOf(DISPUTE_STATUSES),
  resolution: f.optionalText(2000),
});

// ---------------------------------------------------------------------------
// Subscriptions & credits
// ---------------------------------------------------------------------------

export const startSubscriptionSchema = z.object({
  /** Staff only: the organisation (members always subscribe their own). */
  organizationId: f.optionalUuid(),
  planId: f.uuid(),
  /** Required unless the plan is offered on contract (staff, manual). */
  planPriceId: f.optionalUuid(),
  couponCode: z.string().trim().toUpperCase().max(40).optional(),
  autoRenew: f.bool(),
  /** Staff only. */
  notes: f.optionalText(1000),
});
export type StartSubscriptionInput = z.output<typeof startSubscriptionSchema>;

export const changePlanSchema = z.object({
  subscriptionId: f.uuid(),
  planId: f.uuid(),
  planPriceId: f.optionalUuid(),
  couponCode: z.string().trim().toUpperCase().max(40).optional(),
});
export type ChangePlanInput = z.output<typeof changePlanSchema>;

export const cancelSubscriptionSchema = z.object({
  subscriptionId: f.uuid(),
  reason: f.optionalText(500),
  /** Staff only: end now instead of at the period end. */
  immediately: f.bool(),
});

export const subscriptionIdSchema = z.object({ subscriptionId: f.uuid() });

export const SUBSCRIPTION_EXCEPTION_KINDS = ["extend_trial", "extend_period", "reactivate"] as const;
export type SubscriptionExceptionKind = (typeof SUBSCRIPTION_EXCEPTION_KINDS)[number];

export const subscriptionExceptionSchema = z.object({
  subscriptionId: f.uuid(),
  kind: f.enumOf(SUBSCRIPTION_EXCEPTION_KINDS),
  days: f.int({ min: 1, max: 365 }),
  reason: f.text({ label: "Reason", min: 10, max: 1000 }),
});
export type SubscriptionExceptionInput = z.output<typeof subscriptionExceptionSchema>;

export const purchaseCreditPackSchema = z.object({
  planPriceId: f.uuid(),
  couponCode: z.string().trim().toUpperCase().max(40).optional(),
});

export const creditAdjustmentSchema = z.object({
  organizationId: f.uuid(),
  entitlementKey: z.enum(ENTITLEMENT_ENUM, { error: "Choose a feature" }),
  delta: f.int({ min: -1_000_000, max: 1_000_000 }),
  note: f.text({ label: "Reason", min: 5, max: 500 }),
  expiresAt: f.optionalDate(),
});

// ---------------------------------------------------------------------------
// Partner settlements
// ---------------------------------------------------------------------------

export const settlementComputeSchema = z
  .object({
    partnerOrganizationId: f.uuid(),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "Must be on or after the start date" });
export type SettlementComputeInput = z.output<typeof settlementComputeSchema>;

export const settlementLineSchema = z.object({
  settlementId: f.uuid(),
  kind: f.enumOf(PARTNER_SETTLEMENT_LINE_KINDS),
  description: f.text({ label: "Description", max: 300 }),
  amount: decimalAmount("Amount"),
});

export const settlementUpdateSchema = z.object({
  settlementId: f.uuid(),
  withholdingTax: optionalDecimalAmount("Tax deducted at source"),
  notes: f.optionalText(2000),
  internalNotes: f.optionalText(2000),
});

export const settlementPaidSchema = z.object({
  settlementId: f.uuid(),
  paymentReference: f.text({ label: "Payment reference", max: 100 }),
  paidAt: f.date(),
});

export const settlementDisputeSchema = z.object({
  settlementId: f.uuid(),
  reason: f.text({ label: "Reason", min: 10, max: 2000 }),
});

export const partnerInvoiceSchema = z.object({
  settlementId: f.uuid(),
  partnerInvoiceNumber: f.text({ label: "Invoice number", max: 60 }),
  partnerInvoiceFileId: f.optionalUuid(),
});
