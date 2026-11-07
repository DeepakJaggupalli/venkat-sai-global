/**
 * Commercial read-model types shared by queries and UI (client-safe: type-only imports).
 */
import type {
  BillingInterval,
  CreditLedgerReason,
  DisputeStatus,
  InvoiceDocumentType,
  InvoiceLineTax,
  InvoicePartySnapshot,
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
  TaxRateKind,
} from "@/db/schema/commercial";
import type { OrgType } from "@/db/schema/_constants";

import type { EntitlementKey } from "./entitlements";

export type MoneyByCurrency = { currency: string; amountMinor: number };

export type PlanPriceView = { id: string; currency: string; interval: BillingInterval; amountMinor: number; taxInclusive: boolean; isActive: boolean };
export type PlanFeatureView = { entitlementKey: EntitlementKey; label: string; limitValue: number | null; period: PlanFeaturePeriod; resetPolicy: PlanFeatureResetPolicy };
export type PlanView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  audience: OrgType;
  kind: PlanKind;
  isPublic: boolean;
  isActive: boolean;
  isDefault: boolean;
  contactSalesOnly: boolean;
  trialDays: number;
  sortOrder: number;
  highlights: string[];
  prices: PlanPriceView[];
  features: PlanFeatureView[];
};

export type SubscriptionView = {
  id: string;
  organizationId: string;
  organizationName: string;
  planId: string;
  planName: string;
  kind: PlanKind;
  status: SubscriptionStatus;
  currency: string | null;
  amountMinor: number | null;
  interval: BillingInterval | null;
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  endedAt: Date | null;
  autoRenew: boolean;
  createdAt: Date;
};

export type InvoiceListItem = {
  id: string;
  code: string | null;
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  amountRefundedMinor: number;
  outstandingMinor: number;
  issuedAt: Date | null;
  dueAt: Date | null;
  organizationId: string | null;
  organizationName: string | null;
  buyerName: string | null;
  subscriptionId: string | null;
  createdAt: Date;
};

export type InvoiceLineView = {
  id: string;
  description: string;
  taxCode: string | null;
  quantity: number;
  unitAmountMinor: number;
  discountMinor: number;
  amountMinor: number;
  taxRateBasisPoints: number;
  taxMinor: number;
  taxes: InvoiceLineTax[];
};

export type TaxSummaryRow = { kind: TaxRateKind; name: string; rateBasisPoints: number; taxableMinor: number; amountMinor: number };

export type PaymentListItem = {
  id: string;
  code: string;
  provider: PaymentProvider;
  method: PaymentMethod | null;
  status: PaymentStatus;
  currency: string;
  amountMinor: number;
  amountRefundedMinor: number;
  receivedAt: Date | null;
  externalReference: string | null;
  invoiceId: string | null;
  invoiceCode: string | null;
  organizationId: string | null;
  organizationName: string | null;
  failureReason: string | null;
  createdAt: Date;
};

export type InvoiceDocumentView = {
  id: string;
  code: string | null;
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  currency: string;
  taxTreatment: InvoiceTaxTreatment;
  placeOfSupply: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountRefundedMinor: number;
  outstandingMinor: number;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  servicePeriodStart: Date | null;
  servicePeriodEnd: Date | null;
  purchaseOrderReference: string | null;
  notes: string | null;
  buyer: InvoicePartySnapshot | null;
  seller: InvoicePartySnapshot | null;
  lines: InvoiceLineView[];
  taxSummary: TaxSummaryRow[];
  couponCode: string | null;
  originalInvoice: { id: string; code: string | null } | null;
  creditNotes: { id: string; code: string | null; totalMinor: number; issuedAt: Date | null }[];
  payments: { code: string; provider: PaymentProvider; amountMinor: number; receivedAt: Date | null; status: PaymentStatus }[];
};

export type InvoiceViewerAccess = {
  viewer: "staff" | "member" | "buyer";
  /** Organisation type of the invoice's organisation (portal links for members); null for individual buyers. */
  organizationType: OrgType | null;
  /** The viewer may start an online payment now. */
  canPayOnline: boolean;
  paymentOptions: { razorpay: boolean; stripe: boolean };
  /** Gateway-specific problem (e.g. three-decimal amount) explaining why online payment is unavailable. */
  onlinePaymentNote: string | null;
};

export type CreditLedgerItem = {
  id: string;
  entitlementKey: EntitlementKey;
  delta: number;
  balanceAfter: number;
  reason: CreditLedgerReason;
  referenceType: string | null;
  referenceId: string | null;
  expiresAt: Date | null;
  note: string | null;
  createdAt: Date;
};

export type RefundListItem = {
  id: string;
  code: string;
  status: RefundStatus;
  currency: string;
  amountMinor: number;
  reason: string;
  paymentId: string;
  paymentCode: string;
  provider: PaymentProvider;
  organizationName: string | null;
  approvalRequestId: string | null;
  creditNoteInvoiceId: string | null;
  processedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
};

export type DisputeListItem = {
  id: string;
  status: DisputeStatus;
  source: "customer" | "chargeback";
  reason: string;
  resolution: string | null;
  amountMinor: number | null;
  currency: string | null;
  invoiceId: string | null;
  invoiceCode: string | null;
  paymentId: string | null;
  organizationName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type SettlementListItem = {
  id: string;
  code: string;
  partnerOrganizationId: string;
  partnerName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  amountMinor: number;
  withholdingTaxMinor: number;
  netPayableMinor: number;
  status: PartnerSettlementStatus;
  approvedAt: Date | null;
  paidAt: Date | null;
  paymentReference: string | null;
  createdAt: Date;
};

export type SettlementDetail = SettlementListItem & {
  notes: string | null;
  /** Staff only (null for partners). */
  internalNotes: string | null;
  disputeReason: string | null;
  partnerInvoiceNumber: string | null;
  partnerInvoiceFileId: string | null;
  approvalRequestId: string | null;
  lines: { id: string; kind: PartnerSettlementLineKind; description: string; amountMinor: number; placementId: string | null; placementCode: string | null; voidedAt: Date | null }[];
};
