import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  coupons,
  couponRedemptions,
  creditLedger,
  currencies,
  disputes,
  invoiceLines,
  invoices,
  organizations,
  partnerSettlementLines,
  partnerSettlements,
  paymentWebhookEvents,
  payments,
  placements,
  planFeatures,
  planPrices,
  plans,
  refunds,
  subscriptions,
  users,
  type DisputeStatus,
  type InvoiceDocumentType,
  type InvoiceStatus,
  type PartnerSettlementStatus,
  type PaymentProvider,
  type PaymentStatus,
  type RefundStatus,
  type SubscriptionStatus,
} from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { getCurrentUser } from "@/modules/identity/session";
import { getSetting } from "@/modules/settings";

import { assertOrgBilling, assertStaff, userCanManageOrgBilling, userCanViewOrgBilling } from "./access";
import { getBillingProfile, type BillingProfileRow } from "./billing-profiles";
import { gatewayAmountProblem } from "./checkout";
import { getOnlinePaymentOptions } from "./config";
import { ENTITLEMENTS } from "./constants";
import { getCreditBalances } from "./credits";
import { computeEntitlementSnapshot, type EntitlementUsage } from "./entitlements-impl";
import type { EntitlementKey } from "./entitlements";
import { forbidden, notFound } from "./errors";
import { PAYABLE_STATUSES } from "./invoices";
import { minorUnitsFor } from "./money";
import { summarizeTaxes } from "./tax";
import type {
  CreditLedgerItem,
  DisputeListItem,
  InvoiceDocumentView,
  InvoiceListItem,
  InvoiceViewerAccess,
  MoneyByCurrency,
  PaymentListItem,
  PlanView,
  RefundListItem,
  SettlementDetail,
  SettlementListItem,
  SubscriptionView,
} from "./types";

/**
 * Commercial reads. Organisation reads take the member's portal context and are scoped to that organisation
 * (billing view permission); staff reads need commercial.view (settlements: partners.settlements); partners see
 * only their own settlements, without internal notes.
 */

function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "").trim()}%`;
}

// ---------------------------------------------------------------------------
// Plans (catalogue + admin)
// ---------------------------------------------------------------------------

async function plansWithDetails(where: SQL | undefined, opts: { activePricesOnly: boolean }): Promise<PlanView[]> {
  const rows = await db.select().from(plans).where(where).orderBy(asc(plans.audience), asc(plans.sortOrder), asc(plans.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [prices, features] = await Promise.all([
    db
      .select()
      .from(planPrices)
      .where(and(inArray(planPrices.planId, ids), opts.activePricesOnly ? eq(planPrices.isActive, true) : undefined))
      .orderBy(asc(planPrices.currency), asc(planPrices.interval)),
    db.select().from(planFeatures).where(inArray(planFeatures.planId, ids)),
  ]);
  return rows.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    audience: plan.audience,
    kind: plan.kind,
    isPublic: plan.isPublic,
    isActive: plan.isActive,
    isDefault: plan.isDefault,
    contactSalesOnly: plan.contactSalesOnly,
    trialDays: plan.trialDays,
    sortOrder: plan.sortOrder,
    highlights: plan.highlights,
    prices: prices
      .filter((p) => p.planId === plan.id)
      .map((p) => ({ id: p.id, currency: p.currency, interval: p.interval, amountMinor: p.amountMinor, taxInclusive: p.taxInclusive, isActive: p.isActive })),
    features: features
      .filter((f) => f.planId === plan.id)
      .map((f) => ({ entitlementKey: f.entitlementKey, label: ENTITLEMENTS[f.entitlementKey].label, limitValue: f.limitValue, period: f.period, resetPolicy: f.resetPolicy })),
  }));
}

/**
 * Plans an organisation can buy (pricing pages, plan chooser): active and public plans of the audience with their
 * active prices (all currencies — the UI picks the buyer's) and features. No authentication needed.
 */
export async function getPlanCatalog(audience: OrgType, opts: { kind?: "base" | "add_on"; includeNonPublic?: boolean } = {}): Promise<PlanView[]> {
  return plansWithDetails(and(eq(plans.audience, audience), eq(plans.isActive, true), opts.includeNonPublic ? undefined : eq(plans.isPublic, true), opts.kind ? eq(plans.kind, opts.kind) : undefined), { activePricesOnly: true });
}

/** Every plan with all prices (active and inactive) and features (commercial.view). */
export async function listPlansForAdmin(ctx: StaffContext, filters: { audience?: OrgType } = {}): Promise<PlanView[]> {
  assertStaff(ctx, ["commercial.view", "commercial.plans"], "any");
  return plansWithDetails(filters.audience ? eq(plans.audience, filters.audience) : undefined, { activePricesOnly: false });
}

export async function listCoupons(ctx: StaffContext, filters: { q?: string; active?: boolean }, page: PageQuery): Promise<Paginated<typeof coupons.$inferSelect>> {
  assertStaff(ctx, ["commercial.view", "commercial.plans"], "any");
  const where = and(filters.q ? ilike(coupons.code, likePattern(filters.q.toUpperCase())) : undefined, filters.active === undefined ? undefined : eq(coupons.isActive, filters.active));
  const [items, total] = await Promise.all([
    db.select().from(coupons).where(where).orderBy(desc(coupons.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(coupons).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

const subscriptionSelect = {
  id: subscriptions.id,
  organizationId: subscriptions.organizationId,
  organizationName: organizations.name,
  planId: subscriptions.planId,
  planName: plans.name,
  kind: subscriptions.kind,
  status: subscriptions.status,
  currency: subscriptions.currency,
  amountMinor: subscriptions.amountMinor,
  interval: subscriptions.interval,
  startedAt: subscriptions.startedAt,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
  trialEndsAt: subscriptions.trialEndsAt,
  cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
  cancelledAt: subscriptions.cancelledAt,
  endedAt: subscriptions.endedAt,
  autoRenew: subscriptions.autoRenew,
  createdAt: subscriptions.createdAt,
};

async function subscriptionsOf(organizationId: string, statuses: SubscriptionStatus[]): Promise<SubscriptionView[]> {
  return db
    .select(subscriptionSelect)
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(organizations, eq(organizations.id, subscriptions.organizationId))
    .where(and(eq(subscriptions.organizationId, organizationId), inArray(subscriptions.status, statuses)))
    .orderBy(asc(subscriptions.kind), desc(subscriptions.createdAt));
}

export async function listSubscriptions(
  ctx: StaffContext,
  filters: { status?: SubscriptionStatus; organizationId?: string; planId?: string; q?: string },
  page: PageQuery,
): Promise<Paginated<SubscriptionView>> {
  assertStaff(ctx, "commercial.view");
  const where = and(
    filters.status ? eq(subscriptions.status, filters.status) : undefined,
    filters.organizationId ? eq(subscriptions.organizationId, filters.organizationId) : undefined,
    filters.planId ? eq(subscriptions.planId, filters.planId) : undefined,
    filters.q ? ilike(organizations.name, likePattern(filters.q)) : undefined,
  );
  const base = db.select(subscriptionSelect).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).innerJoin(organizations, eq(organizations.id, subscriptions.organizationId));
  const [items, total] = await Promise.all([
    base.where(where).orderBy(desc(subscriptions.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(subscriptions).innerJoin(organizations, eq(organizations.id, subscriptions.organizationId)).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

export async function getSubscriptionDetail(ctx: StaffContext, subscriptionId: string): Promise<{ subscription: SubscriptionView; notes: string | null; invoices: InvoiceListItem[] } | null> {
  assertStaff(ctx, "commercial.view");
  const [row] = await db
    .select({ ...subscriptionSelect, notes: subscriptions.notes })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(organizations, eq(organizations.id, subscriptions.organizationId))
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  if (!row) return null;
  const { notes, ...subscription } = row;
  const list = await invoiceList(eq(invoices.subscriptionId, subscriptionId), { page: 1, pageSize: 100, offset: 0 });
  return { subscription, notes, invoices: list.items };
}

// ---------------------------------------------------------------------------
// Invoices & payments
// ---------------------------------------------------------------------------

const invoiceSelect = {
  id: invoices.id,
  code: invoices.code,
  documentType: invoices.documentType,
  status: invoices.status,
  currency: invoices.currency,
  totalMinor: invoices.totalMinor,
  amountPaidMinor: invoices.amountPaidMinor,
  amountRefundedMinor: invoices.amountRefundedMinor,
  issuedAt: invoices.issuedAt,
  dueAt: invoices.dueAt,
  organizationId: invoices.organizationId,
  organizationName: organizations.name,
  buyerName: sql<string | null>`coalesce(${invoices.buyerSnapshot} ->> 'legalName', ${users.displayName})`,
  subscriptionId: invoices.subscriptionId,
  createdAt: invoices.createdAt,
};

async function invoiceList(where: SQL | undefined, page: PageQuery): Promise<Paginated<InvoiceListItem>> {
  const [rows, total] = await Promise.all([
    db
      .select(invoiceSelect)
      .from(invoices)
      .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
      .leftJoin(users, eq(users.id, invoices.buyerUserId))
      .where(where)
      .orderBy(sql`${invoices.issuedAt} desc nulls first`, desc(invoices.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(invoices).leftJoin(organizations, eq(organizations.id, invoices.organizationId)).where(where),
  ]);
  const items = rows.map((r) => ({ ...r, outstandingMinor: r.documentType === "invoice" && PAYABLE_STATUSES.includes(r.status) ? Math.max(0, r.totalMinor - r.amountPaidMinor) : 0 }));
  return paginated(items, total[0]?.value ?? 0, page);
}

export type InvoiceFilters = { status?: InvoiceStatus | "open"; documentType?: InvoiceDocumentType; organizationId?: string; currency?: string; q?: string };

function invoiceWhere(filters: InvoiceFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(invoices.status, [...PAYABLE_STATUSES]));
  else if (filters.status) where.push(eq(invoices.status, filters.status));
  if (filters.documentType) where.push(eq(invoices.documentType, filters.documentType));
  if (filters.organizationId) where.push(eq(invoices.organizationId, filters.organizationId));
  if (filters.currency) where.push(eq(invoices.currency, filters.currency.toUpperCase()));
  if (filters.q) {
    const q = likePattern(filters.q);
    where.push(or(ilike(invoices.code, q), ilike(organizations.name, q))!);
  }
  return where;
}

/** Staff invoice list (commercial.view), drafts included. */
export async function listInvoices(ctx: StaffContext, filters: InvoiceFilters, page: PageQuery): Promise<Paginated<InvoiceListItem>> {
  assertStaff(ctx, "commercial.view");
  return invoiceList(and(...invoiceWhere(filters)), page);
}

/** The organisation's invoices and credit notes (never drafts). */
export async function listOrgInvoices(ctx: OrgContext, filters: Omit<InvoiceFilters, "organizationId" | "q">, page: PageQuery): Promise<Paginated<InvoiceListItem>> {
  assertOrgBilling(ctx, "view");
  return invoiceList(and(eq(invoices.organizationId, ctx.organization.id), ne(invoices.status, "draft"), ...invoiceWhere(filters)), page);
}

const paymentSelect = {
  id: payments.id,
  code: payments.code,
  provider: payments.provider,
  method: payments.method,
  status: payments.status,
  currency: payments.currency,
  amountMinor: payments.amountMinor,
  amountRefundedMinor: payments.amountRefundedMinor,
  receivedAt: payments.receivedAt,
  externalReference: payments.externalReference,
  invoiceId: payments.invoiceId,
  invoiceCode: invoices.code,
  organizationId: payments.organizationId,
  organizationName: organizations.name,
  failureReason: payments.failureReason,
  createdAt: payments.createdAt,
};

async function paymentList(where: SQL | undefined, page: PageQuery): Promise<Paginated<PaymentListItem>> {
  const [items, total] = await Promise.all([
    db
      .select(paymentSelect)
      .from(payments)
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(organizations, eq(organizations.id, payments.organizationId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(payments).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

export async function listPayments(
  ctx: StaffContext,
  filters: { status?: PaymentStatus; provider?: PaymentProvider; organizationId?: string; unallocated?: boolean; currency?: string },
  page: PageQuery,
): Promise<Paginated<PaymentListItem>> {
  assertStaff(ctx, "commercial.view");
  return paymentList(
    and(
      filters.status ? eq(payments.status, filters.status) : undefined,
      filters.provider ? eq(payments.provider, filters.provider) : undefined,
      filters.organizationId ? eq(payments.organizationId, filters.organizationId) : undefined,
      filters.currency ? eq(payments.currency, filters.currency.toUpperCase()) : undefined,
      filters.unallocated ? and(isNull(payments.invoiceId), inArray(payments.status, ["succeeded"])) : undefined,
    ),
    page,
  );
}

/** The organisation's payments (abandoned checkouts are hidden). */
export async function listOrgPayments(ctx: OrgContext, page: PageQuery): Promise<Paginated<PaymentListItem>> {
  assertOrgBilling(ctx, "view");
  return paymentList(and(eq(payments.organizationId, ctx.organization.id), ne(payments.status, "pending")), page);
}

async function invoiceDocument(invoiceId: string): Promise<InvoiceDocumentView | null> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return null;
  const [lines, original, notes, paid, coupon] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.createdAt)),
    invoice.originalInvoiceId ? db.select({ id: invoices.id, code: invoices.code }).from(invoices).where(eq(invoices.id, invoice.originalInvoiceId)).limit(1) : Promise.resolve([]),
    db.select({ id: invoices.id, code: invoices.code, totalMinor: invoices.totalMinor, issuedAt: invoices.issuedAt }).from(invoices).where(eq(invoices.originalInvoiceId, invoiceId)).orderBy(asc(invoices.issuedAt)),
    db
      .select({ code: payments.code, provider: payments.provider, amountMinor: payments.amountMinor, receivedAt: payments.receivedAt, status: payments.status })
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), inArray(payments.status, ["succeeded", "partially_refunded", "refunded"])))
      .orderBy(asc(payments.receivedAt)),
    db.select({ code: coupons.code }).from(couponRedemptions).innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId)).where(and(eq(couponRedemptions.invoiceId, invoiceId), isNull(couponRedemptions.reversedAt))).limit(1),
  ]);
  const lineViews = lines.map((l) => ({
    id: l.id,
    description: l.description,
    taxCode: l.taxCode,
    quantity: l.quantity,
    unitAmountMinor: l.unitAmountMinor,
    discountMinor: l.discountMinor,
    amountMinor: l.amountMinor,
    taxRateBasisPoints: l.taxRateBasisPoints,
    taxMinor: l.taxMinor,
    taxes: l.taxes,
  }));
  return {
    id: invoice.id,
    code: invoice.code,
    documentType: invoice.documentType,
    status: invoice.status,
    currency: invoice.currency,
    taxTreatment: invoice.taxTreatment,
    placeOfSupply: invoice.placeOfSupply,
    subtotalMinor: invoice.subtotalMinor,
    discountMinor: invoice.discountMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    amountPaidMinor: invoice.amountPaidMinor,
    amountRefundedMinor: invoice.amountRefundedMinor,
    outstandingMinor: invoice.documentType === "invoice" && PAYABLE_STATUSES.includes(invoice.status) ? Math.max(0, invoice.totalMinor - invoice.amountPaidMinor) : 0,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    voidReason: invoice.voidReason,
    servicePeriodStart: invoice.servicePeriodStart,
    servicePeriodEnd: invoice.servicePeriodEnd,
    purchaseOrderReference: invoice.purchaseOrderReference,
    notes: invoice.notes,
    buyer: invoice.buyerSnapshot,
    seller: invoice.sellerSnapshot,
    lines: lineViews,
    taxSummary: summarizeTaxes(lineViews),
    couponCode: coupon[0]?.code ?? null,
    originalInvoice: original[0] ?? null,
    creditNotes: notes,
    payments: paid,
  };
}

/** Full invoice document for staff (commercial.view), drafts included. */
export async function getInvoiceForStaff(ctx: StaffContext, invoiceId: string): Promise<(InvoiceDocumentView & { internalNotes: string | null; organizationId: string | null; buyerUserId: string | null }) | null> {
  assertStaff(ctx, "commercial.view");
  const doc = await invoiceDocument(invoiceId);
  if (!doc) return null;
  const [extra] = await db.select({ internalNotes: invoices.internalNotes, organizationId: invoices.organizationId, buyerUserId: invoices.buyerUserId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  return { ...doc, internalNotes: extra?.internalNotes ?? null, organizationId: extra?.organizationId ?? null, buyerUserId: extra?.buyerUserId ?? null };
}

/**
 * Invoice document for the signed-in viewer of the printable page (/billing/invoices/[id]):
 *  - staff with commercial.view (drafts included);
 *  - members of the invoice's organisation with its billing permission (employer.billing.view,
 *    partner.billing.manage, institution.billing.manage) — issued documents only;
 *  - the individual buyer — issued documents only.
 * Returns null when the invoice does not exist or the viewer may not see it (callers render 404).
 */
export async function getInvoiceForViewer(invoiceId: string): Promise<{ document: InvoiceDocumentView; access: InvoiceViewerAccess } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const [row] = await db
    .select({ organizationId: invoices.organizationId, organizationType: organizations.type, buyerUserId: invoices.buyerUserId, status: invoices.status, currency: invoices.currency, documentType: invoices.documentType, totalMinor: invoices.totalMinor, amountPaidMinor: invoices.amountPaidMinor })
    .from(invoices)
    .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) return null;
  let viewer: InvoiceViewerAccess["viewer"] | null = null;
  // Same policy as requireStaff(): staff without required two-factor authentication get no staff access.
  const staffAllowed = user.isStaff && (user.twoFactorEnabled || !(await getSetting("security.require_staff_2fa")));
  const staff = staffAllowed ? await getStaffContext() : null;
  if (staff && staffCan(staff, "commercial.view")) viewer = "staff";
  else if (row.status !== "draft") {
    if (row.buyerUserId && row.buyerUserId === user.id) viewer = "buyer";
    else if (row.organizationId && (await userCanViewOrgBilling(user.id, row.organizationId))) viewer = "member";
  }
  if (!viewer) return null;
  const document = await invoiceDocument(invoiceId);
  if (!document) return null;
  const payable = row.documentType === "invoice" && PAYABLE_STATUSES.includes(row.status) && document.outstandingMinor > 0;
  const canPay = payable && ((viewer === "buyer") || (viewer === "member" && row.organizationId !== null && (await userCanManageOrgBilling(user.id, row.organizationId))));
  const options = canPay ? await getOnlinePaymentOptions(row.organizationId) : { razorpay: false, stripe: false, any: false };
  let onlinePaymentNote: string | null = null;
  if (canPay && options.any) {
    const [cur] = await db.select({ minorUnits: currencies.minorUnits }).from(currencies).where(eq(currencies.code, row.currency)).limit(1);
    onlinePaymentNote = gatewayAmountProblem(document.outstandingMinor, minorUnitsFor(row.currency, cur?.minorUnits));
  }
  return {
    document,
    access: { viewer, organizationType: row.organizationType ?? null, canPayOnline: canPay && options.any && !onlinePaymentNote, paymentOptions: { razorpay: options.razorpay, stripe: options.stripe }, onlinePaymentNote },
  };
}

// ---------------------------------------------------------------------------
// Organisation billing overview, credits
// ---------------------------------------------------------------------------

export type OrgBillingOverview = {
  organization: { id: string; name: string; type: OrgType };
  billingProfile: BillingProfileRow | null;
  subscriptions: SubscriptionView[];
  pendingSubscriptions: SubscriptionView[];
  usage: { enforced: boolean; items: EntitlementUsage[] };
  credits: Partial<Record<EntitlementKey, number>>;
  outstanding: MoneyByCurrency[];
  onlinePayments: { razorpay: boolean; stripe: boolean };
};

async function outstandingByCurrency(organizationId: string): Promise<MoneyByCurrency[]> {
  const rows = await db
    .select({ currency: invoices.currency, amountMinor: sql<string>`sum(${invoices.totalMinor} - ${invoices.amountPaidMinor})` })
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.documentType, "invoice"), inArray(invoices.status, [...PAYABLE_STATUSES])))
    .groupBy(invoices.currency)
    .orderBy(asc(invoices.currency));
  return rows.map((r) => ({ currency: r.currency, amountMinor: Number(r.amountMinor) }));
}

async function overviewFor(organizationId: string): Promise<OrgBillingOverview> {
  const [org] = await db.select({ id: organizations.id, name: organizations.name, type: organizations.type }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw notFound("Organisation");
  const [billingProfile, live, pending, usage, credits, outstanding, online] = await Promise.all([
    getBillingProfile(organizationId),
    subscriptionsOf(organizationId, ["trialing", "active", "past_due", "paused"]),
    subscriptionsOf(organizationId, ["pending"]),
    computeEntitlementSnapshot(organizationId),
    getCreditBalances(organizationId),
    outstandingByCurrency(organizationId),
    getOnlinePaymentOptions(organizationId),
  ]);
  const creditOnly = Object.fromEntries(Object.entries(credits).filter(([key]) => ENTITLEMENTS[key as EntitlementKey]?.mode === "credit")) as Partial<Record<EntitlementKey, number>>;
  return { organization: org, billingProfile, subscriptions: live, pendingSubscriptions: pending, usage, credits: creditOnly, outstanding, onlinePayments: { razorpay: online.razorpay, stripe: online.stripe } };
}

/** Current plan(s), pending plan change, usage vs limits, credits, amounts outstanding (portal billing page). */
export async function getOrgBillingOverview(ctx: OrgContext): Promise<OrgBillingOverview> {
  assertOrgBilling(ctx, "view");
  return overviewFor(ctx.organization.id);
}

/** The same overview for staff (commercial.view). */
export async function getOrgBillingForStaff(ctx: StaffContext, organizationId: string): Promise<OrgBillingOverview> {
  assertStaff(ctx, "commercial.view");
  return overviewFor(organizationId);
}

async function ledgerFor(organizationId: string, key: EntitlementKey | undefined, page: PageQuery): Promise<Paginated<CreditLedgerItem>> {
  const where = and(eq(creditLedger.organizationId, organizationId), key ? eq(creditLedger.entitlementKey, key) : undefined);
  const [items, total] = await Promise.all([
    db
      .select({
        id: creditLedger.id,
        entitlementKey: creditLedger.entitlementKey,
        delta: creditLedger.delta,
        balanceAfter: creditLedger.balanceAfter,
        reason: creditLedger.reason,
        referenceType: creditLedger.referenceType,
        referenceId: creditLedger.referenceId,
        expiresAt: creditLedger.expiresAt,
        note: creditLedger.note,
        createdAt: creditLedger.createdAt,
      })
      .from(creditLedger)
      .where(where)
      .orderBy(desc(creditLedger.createdAt), desc(creditLedger.seq))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(creditLedger).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

/** Credit / usage history of the organisation (portal). */
export async function listOrgCreditLedger(ctx: OrgContext, filters: { key?: EntitlementKey }, page: PageQuery): Promise<Paginated<CreditLedgerItem>> {
  assertOrgBilling(ctx, "view");
  return ledgerFor(ctx.organization.id, filters.key, page);
}

export async function listCreditLedgerForStaff(ctx: StaffContext, organizationId: string, filters: { key?: EntitlementKey }, page: PageQuery): Promise<Paginated<CreditLedgerItem>> {
  assertStaff(ctx, "commercial.view");
  return ledgerFor(organizationId, filters.key, page);
}

// ---------------------------------------------------------------------------
// Refunds, disputes, webhooks
// ---------------------------------------------------------------------------

export async function listRefunds(ctx: StaffContext, filters: { status?: RefundStatus; organizationId?: string }, page: PageQuery): Promise<Paginated<RefundListItem>> {
  assertStaff(ctx, ["commercial.view", "commercial.refunds"], "any");
  const where = and(filters.status ? eq(refunds.status, filters.status) : undefined, filters.organizationId ? eq(refunds.organizationId, filters.organizationId) : undefined);
  const [items, total] = await Promise.all([
    db
      .select({
        id: refunds.id,
        code: refunds.code,
        status: refunds.status,
        currency: refunds.currency,
        amountMinor: refunds.amountMinor,
        reason: refunds.reason,
        paymentId: refunds.paymentId,
        paymentCode: payments.code,
        provider: payments.provider,
        organizationName: organizations.name,
        approvalRequestId: refunds.approvalRequestId,
        creditNoteInvoiceId: refunds.creditNoteInvoiceId,
        processedAt: refunds.processedAt,
        failureReason: refunds.failureReason,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .leftJoin(organizations, eq(organizations.id, refunds.organizationId))
      .where(where)
      .orderBy(desc(refunds.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(refunds).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

const disputeSelect = {
  id: disputes.id,
  status: disputes.status,
  source: disputes.source,
  reason: disputes.reason,
  resolution: disputes.resolution,
  amountMinor: disputes.amountMinor,
  currency: disputes.currency,
  invoiceId: disputes.invoiceId,
  invoiceCode: invoices.code,
  paymentId: disputes.paymentId,
  organizationName: organizations.name,
  createdAt: disputes.createdAt,
  resolvedAt: disputes.resolvedAt,
};

export async function listDisputes(ctx: StaffContext, filters: { status?: DisputeStatus }, page: PageQuery): Promise<Paginated<DisputeListItem>> {
  assertStaff(ctx, ["commercial.view", "commercial.refunds"], "any");
  const where = filters.status ? eq(disputes.status, filters.status) : undefined;
  const [items, total] = await Promise.all([
    db.select(disputeSelect).from(disputes).leftJoin(invoices, eq(invoices.id, disputes.invoiceId)).leftJoin(organizations, eq(organizations.id, disputes.organizationId)).where(where).orderBy(desc(disputes.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(disputes).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

/** The organisation's own disputes (portal). */
export async function listOrgDisputes(ctx: OrgContext, page: PageQuery): Promise<Paginated<DisputeListItem>> {
  assertOrgBilling(ctx, "view");
  const where = eq(disputes.organizationId, ctx.organization.id);
  const [items, total] = await Promise.all([
    db.select(disputeSelect).from(disputes).leftJoin(invoices, eq(invoices.id, disputes.invoiceId)).leftJoin(organizations, eq(organizations.id, disputes.organizationId)).where(where).orderBy(desc(disputes.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(disputes).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

/** Gateway webhook inbox for troubleshooting (payloads are not returned). */
export async function listWebhookEvents(
  ctx: StaffContext,
  filters: { provider?: "razorpay" | "stripe"; status?: "received" | "processed" | "failed" | "ignored" },
  page: PageQuery,
): Promise<Paginated<{ id: string; provider: string; eventId: string; type: string; status: string; attempts: number; error: string | null; paymentId: string | null; receivedAt: Date; processedAt: Date | null }>> {
  assertStaff(ctx, "commercial.view");
  const where = and(filters.provider ? eq(paymentWebhookEvents.provider, filters.provider) : undefined, filters.status ? eq(paymentWebhookEvents.status, filters.status) : undefined);
  const [items, total] = await Promise.all([
    db
      .select({
        id: paymentWebhookEvents.id,
        provider: paymentWebhookEvents.provider,
        eventId: paymentWebhookEvents.eventId,
        type: paymentWebhookEvents.type,
        status: paymentWebhookEvents.status,
        attempts: paymentWebhookEvents.attempts,
        error: paymentWebhookEvents.error,
        paymentId: paymentWebhookEvents.paymentId,
        receivedAt: paymentWebhookEvents.receivedAt,
        processedAt: paymentWebhookEvents.processedAt,
      })
      .from(paymentWebhookEvents)
      .where(where)
      .orderBy(desc(paymentWebhookEvents.receivedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(paymentWebhookEvents).where(where),
  ]);
  return paginated(items, total[0]?.value ?? 0, page);
}

// ---------------------------------------------------------------------------
// Partner settlements
// ---------------------------------------------------------------------------

const settlementSelect = {
  id: partnerSettlements.id,
  code: partnerSettlements.code,
  partnerOrganizationId: partnerSettlements.partnerOrganizationId,
  partnerName: organizations.name,
  periodStart: partnerSettlements.periodStart,
  periodEnd: partnerSettlements.periodEnd,
  currency: partnerSettlements.currency,
  amountMinor: partnerSettlements.amountMinor,
  withholdingTaxMinor: partnerSettlements.withholdingTaxMinor,
  status: partnerSettlements.status,
  approvedAt: partnerSettlements.approvedAt,
  paidAt: partnerSettlements.paidAt,
  paymentReference: partnerSettlements.paymentReference,
  createdAt: partnerSettlements.createdAt,
};

async function settlementList(where: SQL | undefined, page: PageQuery): Promise<Paginated<SettlementListItem>> {
  const [rows, total] = await Promise.all([
    db.select(settlementSelect).from(partnerSettlements).innerJoin(organizations, eq(organizations.id, partnerSettlements.partnerOrganizationId)).where(where).orderBy(desc(partnerSettlements.periodEnd), desc(partnerSettlements.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(partnerSettlements).where(where),
  ]);
  return paginated(
    rows.map((r) => ({ ...r, netPayableMinor: r.amountMinor - r.withholdingTaxMinor })),
    total[0]?.value ?? 0,
    page,
  );
}

export async function listSettlements(ctx: StaffContext, filters: { status?: PartnerSettlementStatus; partnerOrganizationId?: string }, page: PageQuery): Promise<Paginated<SettlementListItem>> {
  assertStaff(ctx, "partners.settlements");
  return settlementList(and(filters.status ? eq(partnerSettlements.status, filters.status) : undefined, filters.partnerOrganizationId ? eq(partnerSettlements.partnerOrganizationId, filters.partnerOrganizationId) : undefined), page);
}

/** A partner's own settlements (drafts hidden until submitted). */
export async function listPartnerSettlements(ctx: OrgContext, page: PageQuery): Promise<Paginated<SettlementListItem>> {
  if (ctx.orgType !== "recruitment_partner" || !ctx.permissions.has("partner.settlements.view")) throw forbidden();
  return settlementList(and(eq(partnerSettlements.partnerOrganizationId, ctx.organization.id), inArray(partnerSettlements.status, ["pending_approval", "approved", "paid", "disputed"])), page);
}

/** Settlement with lines: staff (partners.settlements) see everything; the partner its own, without internal notes. */
export async function getSettlementDetail(actor: StaffContext | OrgContext, settlementId: string): Promise<SettlementDetail | null> {
  const isPartner = "orgType" in actor;
  if (isPartner) {
    if (actor.orgType !== "recruitment_partner" || !actor.permissions.has("partner.settlements.view")) throw forbidden();
  } else {
    assertStaff(actor, "partners.settlements");
  }
  const [row] = await db
    .select({
      ...settlementSelect,
      notes: partnerSettlements.notes,
      internalNotes: partnerSettlements.internalNotes,
      disputeReason: partnerSettlements.disputeReason,
      partnerInvoiceNumber: partnerSettlements.partnerInvoiceNumber,
      partnerInvoiceFileId: partnerSettlements.partnerInvoiceFileId,
      approvalRequestId: partnerSettlements.approvalRequestId,
    })
    .from(partnerSettlements)
    .innerJoin(organizations, eq(organizations.id, partnerSettlements.partnerOrganizationId))
    .where(and(eq(partnerSettlements.id, settlementId), isPartner ? eq(partnerSettlements.partnerOrganizationId, actor.organization.id) : undefined))
    .limit(1);
  if (!row || (isPartner && row.status === "draft") || (isPartner && row.status === "cancelled" && !row.approvedAt)) return null;
  const lines = await db
    .select({ id: partnerSettlementLines.id, kind: partnerSettlementLines.kind, description: partnerSettlementLines.description, amountMinor: partnerSettlementLines.amountMinor, placementId: partnerSettlementLines.placementId, placementCode: placements.code, voidedAt: partnerSettlementLines.voidedAt })
    .from(partnerSettlementLines)
    .leftJoin(placements, eq(placements.id, partnerSettlementLines.placementId))
    .where(eq(partnerSettlementLines.settlementId, settlementId))
    .orderBy(asc(partnerSettlementLines.createdAt));
  return {
    ...row,
    netPayableMinor: row.amountMinor - row.withholdingTaxMinor,
    internalNotes: isPartner ? null : row.internalNotes,
    approvalRequestId: isPartner ? null : row.approvalRequestId,
    lines: isPartner ? lines.filter((l) => !l.voidedAt) : lines,
  };
}

/** Organisations with unpaid open invoices (staff follow-up list). */
export async function listOrganizationsWithOutstanding(ctx: StaffContext): Promise<{ organizationId: string; organizationName: string; currency: string; outstandingMinor: number; invoices: number }[]> {
  assertStaff(ctx, "commercial.view");
  const rows = await db
    .select({
      organizationId: invoices.organizationId,
      organizationName: organizations.name,
      currency: invoices.currency,
      outstandingMinor: sql<string>`sum(${invoices.totalMinor} - ${invoices.amountPaidMinor})`,
      invoices: count(),
    })
    .from(invoices)
    .innerJoin(organizations, eq(organizations.id, invoices.organizationId))
    .where(and(eq(invoices.documentType, "invoice"), inArray(invoices.status, [...PAYABLE_STATUSES]), isNotNull(invoices.organizationId)))
    .groupBy(invoices.organizationId, organizations.name, invoices.currency)
    .orderBy(asc(organizations.name), asc(invoices.currency));
  return rows.map((r) => ({ organizationId: r.organizationId!, organizationName: r.organizationName, currency: r.currency, outstandingMinor: Number(r.outstandingMinor), invoices: r.invoices }));
}
