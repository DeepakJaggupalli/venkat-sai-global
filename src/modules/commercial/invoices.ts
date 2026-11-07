import "server-only";

import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateProfiles, couponRedemptions, currencies, invoiceLines, invoices, organizations, subscriptions, users, type InvoiceStatus, type InvoiceTaxTreatment } from "@/db/schema";
import type { InvoicePartySnapshot } from "@/db/schema/commercial";
import { ActionError } from "@/lib/actions";
import { nextGstDocumentNumber } from "@/lib/codes";
import { formatMoney } from "@/lib/format";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { buyerSnapshotFromProfile, getBillingProfile } from "./billing-profiles";
import { getCommercialConfig, getSellerDetails, type SellerDetails } from "./config";
import { BILLING_PATHS, MAX_AMOUNT_MINOR } from "./constants";
import { couponForInvoice, redeemCoupon, reverseRedemptionForInvoice, toCouponDiscount, validateCoupon, type CouponRow } from "./coupons";
import { invalidState, notFound } from "./errors";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import { notifyBillingContacts } from "./notify";
import { addDays, isoDate } from "./periods";
import { priceInvoice, scaleLinesToAmount, type PricedLine, type PricingLineInput, type PricingResult } from "./pricing";
import type { ManualInvoiceInput } from "./schemas";
import type { TaxBuyer, TaxContext } from "./tax";
import { loadTaxRates } from "./tax-rates";

/**
 * Invoices and credit notes.
 *
 * Lifecycle: draft → issued → partially_paid → paid → refunded, with overdue (past due, unpaid) and void (issued,
 * nothing paid, with a reason). Drafts hold the input lines (manual discounts only); issuing re-prices them with
 * the current tax rates and billing profile, applies the coupon, freezes buyer + seller snapshots and assigns the
 * GST document number (nextGstDocumentNumber — CGST Rule 46, never for drafts). Issued documents are never edited.
 */

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;

/** Statuses in which an invoice still accepts payments. */
export const PAYABLE_STATUSES: readonly InvoiceStatus[] = ["issued", "partially_paid", "overdue"];

export function outstandingMinor(invoice: Pick<InvoiceRow, "totalMinor" | "amountPaidMinor">): number {
  return Math.max(0, invoice.totalMinor - invoice.amountPaidMinor);
}

/** Status of an issued invoice from its amounts and due date (void and draft are never recomputed). */
export function deriveInvoiceStatus(invoice: Pick<InvoiceRow, "status" | "totalMinor" | "amountPaidMinor" | "amountRefundedMinor" | "dueAt">, now: Date = new Date()): InvoiceStatus {
  if (invoice.status === "void" || invoice.status === "draft") return invoice.status;
  if (invoice.amountPaidMinor >= invoice.totalMinor && invoice.totalMinor > 0 && invoice.amountRefundedMinor >= invoice.amountPaidMinor) return "refunded";
  if (invoice.amountPaidMinor >= invoice.totalMinor) return "paid";
  if (invoice.dueAt && invoice.dueAt.getTime() < now.getTime()) return "overdue";
  if (invoice.amountPaidMinor > 0) return "partially_paid";
  return "issued";
}

export async function lockInvoice(tx: DbOrTx, invoiceId: string): Promise<InvoiceRow> {
  const [row] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1).for("update");
  if (!row) throw notFound("Invoice");
  return row;
}

export async function getInvoiceLines(invoiceId: string, tx: DbOrTx = db): Promise<InvoiceLineRow[]> {
  return tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.createdAt));
}

async function currencyMinorUnits(tx: DbOrTx, code: string): Promise<number> {
  const [row] = await tx.select({ code: currencies.code, minorUnits: currencies.minorUnits, isActive: currencies.isActive }).from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!row || !row.isActive) throw new ActionError("Choose an active currency.", { fieldErrors: { currency: ["Unknown or inactive currency"] } });
  return minorUnitsFor(row.code, row.minorUnits);
}

// ---------------------------------------------------------------------------
// Buyer / seller and tax context
// ---------------------------------------------------------------------------

export type BuyerResolution = { snapshot: InvoicePartySnapshot; tax: TaxBuyer; organizationName: string | null };

/**
 * Buyer details: an organisation's billing profile (required to issue), or an individual's account details.
 * Individuals have no GST state code on record: the place of supply is then the supplier's location (IGST Act
 * s. 12(2)(b)), i.e. the seller's state for an Indian or unknown address.
 */
export async function resolveBuyer(tx: DbOrTx, input: { organizationId: string | null; buyerUserId: string | null }, seller: SellerDetails): Promise<BuyerResolution | { problem: string }> {
  if (input.organizationId) {
    const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
    if (!org) return { problem: "The organisation no longer exists." };
    const profile = await getBillingProfile(input.organizationId, tx);
    if (!profile) return { problem: "The organisation has no billing details yet. Add the legal name, address and tax details (Billing → Billing details) before issuing." };
    return {
      snapshot: buyerSnapshotFromProfile(profile),
      tax: { countryCode: profile.countryCode, stateCode: profile.stateCode, taxExempt: profile.taxExempt },
      organizationName: org.name,
    };
  }
  if (input.buyerUserId) {
    const [row] = await tx
      .select({ name: users.displayName, email: users.email, phone: users.phone, country: candidateProfiles.currentCountryCode, region: candidateProfiles.stateRegion, city: candidateProfiles.city })
      .from(users)
      .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
      .where(eq(users.id, input.buyerUserId))
      .limit(1);
    if (!row) return { problem: "The buyer's account no longer exists." };
    const countryCode = row.country ?? seller.countryCode;
    const stateCode = countryCode === seller.countryCode ? seller.stateCode : null;
    return {
      snapshot: { legalName: row.name, email: row.email, phone: row.phone, city: row.city, stateRegion: row.region, stateCode, countryCode },
      tax: { countryCode, stateCode, taxExempt: false },
      organizationName: null,
    };
  }
  return { problem: "The invoice has no buyer." };
}

export async function buildTaxContext(
  tx: DbOrTx,
  input: { buyer: TaxBuyer; seller: SellerDetails; at: Date; treatmentOverride?: InvoiceTaxTreatment | null },
): Promise<TaxContext> {
  const config = await getCommercialConfig(tx);
  const rates = await loadTaxRates([input.seller.countryCode, input.buyer.countryCode ?? ""], tx);
  return {
    seller: { countryCode: input.seller.countryCode, stateCode: input.seller.stateCode, taxId: input.seller.taxId },
    buyer: input.buyer,
    rates,
    at: input.at,
    exportZeroRated: config["commercial.export_zero_rated"],
    treatmentOverride: input.treatmentOverride ?? null,
  };
}

function lineRows(invoiceId: string, currency: string, lines: readonly PricedLine[]) {
  return lines.map((line, index) => ({
    invoiceId,
    currency,
    sortOrder: index,
    description: line.description,
    taxCode: line.taxCode,
    quantity: line.quantity,
    unitAmountMinor: line.unitAmountMinor,
    discountMinor: line.discountMinor,
    amountMinor: line.amountMinor,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxMinor: line.taxMinor,
    taxes: line.taxes,
    referenceType: line.referenceType,
    referenceId: line.referenceId,
  }));
}

function pricingInputFromRows(rows: readonly InvoiceLineRow[]): PricingLineInput[] {
  return rows.map((r) => ({
    description: r.description,
    quantity: r.quantity,
    unitAmountMinor: r.unitAmountMinor,
    discountMinor: r.discountMinor,
    taxCode: r.taxCode,
    referenceType: r.referenceType,
    referenceId: r.referenceId,
  }));
}

function assertPricingOk(result: PricingResult): void {
  if (result.problems.length) throw new ActionError(`The invoice cannot be issued yet: ${result.problems.join(" ")}`, { code: "invoice_not_ready" });
  if (result.totals.totalMinor > MAX_AMOUNT_MINOR) throw new ActionError("The invoice total is unrealistically large. Check the amounts.");
}

// ---------------------------------------------------------------------------
// Drafts (staff)
// ---------------------------------------------------------------------------

function draftLinesFromInput(input: ManualInvoiceInput, minorUnits: number, defaultTaxCode: string): PricingLineInput[] {
  return input.lines.map((line, index) => {
    const unit = parseDecimalToMinor(line.unitAmount, minorUnits);
    if (!unit.ok || unit.minor < 0) throw new ActionError(unit.ok ? "Amounts cannot be negative." : unit.error, { fieldErrors: { [`lines.${index}.unitAmount`]: [unit.ok ? "Negative" : unit.error] } });
    const discount = line.discount ? parseDecimalToMinor(line.discount, minorUnits) : ({ ok: true, minor: 0 } as const);
    if (!discount.ok || discount.minor < 0) throw new ActionError(discount.ok ? "Discounts cannot be negative." : discount.error, { fieldErrors: { [`lines.${index}.discount`]: ["Invalid discount"] } });
    if (discount.minor > unit.minor * line.quantity) throw new ActionError("A discount is larger than its line.", { fieldErrors: { [`lines.${index}.discount`]: ["Too large"] } });
    return { description: line.description, quantity: line.quantity, unitAmountMinor: unit.minor, discountMinor: discount.minor, taxCode: line.taxCode ?? defaultTaxCode };
  });
}

async function previewPricing(tx: DbOrTx, draft: Pick<InvoiceRow, "organizationId" | "buyerUserId" | "taxTreatment">, lines: PricingLineInput[], treatmentOverride: InvoiceTaxTreatment | null, coupon: CouponRow | null): Promise<PricingResult | null> {
  const seller = await getSellerDetails(tx);
  const buyer = await resolveBuyer(tx, { organizationId: draft.organizationId, buyerUserId: draft.buyerUserId }, seller);
  const taxBuyer: TaxBuyer = "problem" in buyer ? { countryCode: null, stateCode: null, taxExempt: false } : buyer.tax;
  const ctx = await buildTaxContext(tx, { buyer: taxBuyer, seller, at: new Date(), treatmentOverride });
  return priceInvoice(lines, ctx, coupon ? toCouponDiscount(coupon) : null);
}

/** Create or replace a manual draft invoice (commercial.invoices). Lines are priced for preview (no coupon). */
export async function saveDraftInvoice(ctx: StaffContext, input: ManualInvoiceInput): Promise<InvoiceRow> {
  assertStaff(ctx, "commercial.invoices");
  return db.transaction(async (tx) => {
    const minorUnits = await currencyMinorUnits(tx, input.currency);
    if (input.organizationId) {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
      if (!org) throw notFound("Organisation");
    } else if (input.buyerUserId) {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.buyerUserId)).limit(1);
      if (!user) throw notFound("Buyer");
    }
    const config = await getCommercialConfig(tx);
    const lines = draftLinesFromInput(input, minorUnits, config["commercial.default_tax_code"]);
    const treatmentOverride = input.taxTreatment === "auto" ? null : input.taxTreatment;
    const dueDays = input.dueDays ?? config["commercial.invoice_due_days"];
    const now = new Date();
    const base = {
      currency: input.currency,
      organizationId: input.organizationId ?? null,
      buyerUserId: input.buyerUserId ?? null,
      taxTreatment: treatmentOverride ?? ("standard" as const),
      notes: input.notes ?? null,
      internalNotes: input.internalNotes ?? null,
      purchaseOrderReference: input.purchaseOrderReference ?? null,
      servicePeriodStart: input.servicePeriodStart ?? null,
      servicePeriodEnd: input.servicePeriodEnd ?? null,
      // Provisional: the due date is re-based on the issue date (same number of days).
      dueAt: addDays(now, dueDays),
    };
    let draft: InvoiceRow;
    if (input.id) {
      const existing = await lockInvoice(tx, input.id);
      if (existing.status !== "draft") throw invalidState("Only draft invoices can be edited. Void the invoice and issue a new one.");
      if (existing.currency !== input.currency) {
        const redeemed = await couponForInvoice(tx, existing.id);
        if (redeemed?.discountType === "fixed") throw invalidState("Remove the fixed-amount coupon before changing the currency.");
      }
      [draft] = (await tx.update(invoices).set(base).where(eq(invoices.id, existing.id)).returning()) as [InvoiceRow];
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, draft.id));
    } else {
      [draft] = (await tx.insert(invoices).values({ ...base, status: "draft" }).returning()) as [InvoiceRow];
    }
    const priced = await previewPricing(tx, draft, lines, treatmentOverride, null);
    const pricedLines = priced!.lines;
    await tx.insert(invoiceLines).values(lineRows(draft.id, draft.currency, pricedLines));
    // Draft lines keep the manual discount only; totals are a preview without the coupon.
    const [updated] = await tx
      .update(invoices)
      // taxTreatment keeps the staff's choice ("standard" = automatic): the computed treatment is decided at issue.
      .set({ ...priced!.totals, placeOfSupply: priced!.determination.placeOfSupply })
      .where(eq(invoices.id, draft.id))
      .returning();
    await audit({
      action: input.id ? "commercial.invoice_draft_updated" : "commercial.invoice_draft_created",
      entityType: "invoice",
      entityId: draft.id,
      organizationId: draft.organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { currency: draft.currency, lines: lines.length, totalMinor: priced!.totals.totalMinor },
      tx,
    });
    return updated!;
  });
}

export async function deleteDraftInvoice(ctx: StaffContext, invoiceId: string): Promise<void> {
  assertStaff(ctx, "commercial.invoices");
  await db.transaction(async (tx) => {
    const invoice = await lockInvoice(tx, invoiceId);
    if (invoice.status !== "draft") throw invalidState("Issued invoices cannot be deleted. Void the invoice instead.");
    await reverseRedemptionForInvoice(tx, invoiceId);
    await tx.delete(couponRedemptions).where(eq(couponRedemptions.invoiceId, invoiceId));
    await tx.delete(invoices).where(eq(invoices.id, invoiceId));
    await audit({ action: "commercial.invoice_draft_deleted", entityType: "invoice", entityId: invoiceId, organizationId: invoice.organizationId, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Attach a coupon to a draft (redemption reserved now; the discount is applied when the invoice is issued). */
export async function applyCouponToDraft(ctx: StaffContext, invoiceId: string, code: string): Promise<{ discountMinor: number }> {
  assertStaff(ctx, "commercial.invoices");
  return db.transaction(async (tx) => {
    const invoice = await lockInvoice(tx, invoiceId);
    if (invoice.status !== "draft") throw invalidState("Coupons can only be added to draft invoices.");
    if (await couponForInvoice(tx, invoiceId)) throw invalidState("The invoice already has a coupon. Remove it first.");
    const validation = await validateCoupon({ code, currency: invoice.currency, organizationId: invoice.organizationId, userId: invoice.buyerUserId }, tx);
    if (!validation.ok) throw new ActionError(validation.reason, { fieldErrors: { code: [validation.reason] } });
    const lines = await getInvoiceLines(invoiceId, tx);
    const preview = await previewPricing(tx, invoice, pricingInputFromRows(lines), invoice.taxTreatment === "standard" ? null : invoice.taxTreatment, validation.coupon);
    const discountMinor = preview?.couponDiscountMinor ?? 0;
    await redeemCoupon(tx, {
      couponId: validation.coupon.id,
      invoiceId,
      currency: invoice.currency,
      discountMinor,
      organizationId: invoice.organizationId,
      userId: invoice.buyerUserId,
      subscriptionId: invoice.subscriptionId,
      redeemedByUserId: ctx.user.id,
    });
    await audit({ action: "commercial.invoice_coupon_applied", entityType: "invoice", entityId: invoiceId, organizationId: invoice.organizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { code: validation.coupon.code, discountMinor }, tx });
    return { discountMinor };
  });
}

export async function removeCouponFromDraft(ctx: StaffContext, invoiceId: string): Promise<void> {
  assertStaff(ctx, "commercial.invoices");
  await db.transaction(async (tx) => {
    const invoice = await lockInvoice(tx, invoiceId);
    if (invoice.status !== "draft") throw invalidState("Coupons can only be removed from draft invoices.");
    await reverseRedemptionForInvoice(tx, invoiceId);
    await tx.delete(couponRedemptions).where(eq(couponRedemptions.invoiceId, invoiceId));
    await audit({ action: "commercial.invoice_coupon_removed", entityType: "invoice", entityId: invoiceId, organizationId: invoice.organizationId, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export type IssueOptions = {
  actorUserId: string | null;
  /** Days until due (default: provisional due date of the draft, else commercial.invoice_due_days). */
  dueDays?: number;
  /** Exact due date (subscription renewals are due on the period end). */
  dueAt?: Date;
  now?: Date;
};

/**
 * Issue a draft inside `tx`: re-price with current rates + coupon, freeze snapshots, assign the GST number,
 * notify the buyer. Returns the issued row (status paid when the total is zero).
 */
export async function issueInvoiceTx(tx: DbOrTx, invoiceId: string, opts: IssueOptions): Promise<InvoiceRow> {
  const now = opts.now ?? new Date();
  const invoice = await lockInvoice(tx, invoiceId);
  if (invoice.status !== "draft") throw invalidState("This invoice has already been issued.");
  if (invoice.documentType !== "invoice") throw invalidState("Credit notes are issued automatically.");
  const lines = await getInvoiceLines(invoiceId, tx);
  if (!lines.length) throw invalidState("Add at least one line before issuing.");
  const seller = await getSellerDetails(tx);
  const buyer = await resolveBuyer(tx, { organizationId: invoice.organizationId, buyerUserId: invoice.buyerUserId }, seller);
  if ("problem" in buyer) throw new ActionError(buyer.problem, { code: "invoice_not_ready" });
  const coupon = await couponForInvoice(tx, invoiceId);
  const treatmentOverride = invoice.taxTreatment === "standard" ? null : invoice.taxTreatment;
  const taxCtx = await buildTaxContext(tx, { buyer: buyer.tax, seller, at: now, treatmentOverride });
  const priced = priceInvoice(pricingInputFromRows(lines), taxCtx, coupon ? toCouponDiscount(coupon) : null);
  assertPricingOk(priced);

  await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  await tx.insert(invoiceLines).values(lineRows(invoiceId, invoice.currency, priced.lines));
  if (coupon) {
    await tx
      .update(couponRedemptions)
      .set({ discountMinor: priced.couponDiscountMinor })
      .where(and(eq(couponRedemptions.invoiceId, invoiceId), eq(couponRedemptions.couponId, coupon.id)));
  }

  const config = await getCommercialConfig(tx);
  // The draft's provisional due date was set when it was last saved (updatedAt): keep the same number of days.
  const provisionalDays = invoice.dueAt ? Math.max(0, Math.round((invoice.dueAt.getTime() - invoice.updatedAt.getTime()) / 86_400_000)) : null;
  const dueAt = opts.dueAt ?? addDays(now, opts.dueDays ?? provisionalDays ?? config["commercial.invoice_due_days"]);
  const code = await nextGstDocumentNumber("invoice", { date: now, tx });
  const zeroTotal = priced.totals.totalMinor === 0;
  const [issued] = await tx
    .update(invoices)
    .set({
      code,
      status: zeroTotal ? "paid" : "issued",
      ...priced.totals,
      taxTreatment: priced.determination.treatment,
      placeOfSupply: priced.determination.placeOfSupply,
      issuedAt: now,
      dueAt,
      paidAt: zeroTotal ? now : null,
      issuedByUserId: opts.actorUserId,
      buyerSnapshot: buyer.snapshot,
      sellerSnapshot: { ...seller },
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  await audit({
    action: "commercial.invoice_issued",
    entityType: "invoice",
    entityId: invoiceId,
    organizationId: invoice.organizationId,
    actorUserId: opts.actorUserId,
    actorType: opts.actorUserId ? "staff" : "system",
    metadata: { code, currency: invoice.currency, totalMinor: priced.totals.totalMinor, taxMinor: priced.totals.taxMinor, taxTreatment: priced.determination.treatment, placeOfSupply: priced.determination.placeOfSupply },
    tx,
  });
  if (!zeroTotal) {
    await notifyBillingContacts(tx, {
      event: "billing.invoice_issued",
      organizationId: invoice.organizationId,
      buyerUserId: invoice.buyerUserId,
      data: { code, amount: formatMoney(priced.totals.totalMinor, invoice.currency), organizationName: buyer.organizationName, dueAt: isoDate(dueAt) },
      link: BILLING_PATHS.invoice(invoiceId),
      dedupeKey: `invoice-issued:${invoiceId}`,
      includeBillingEmail: true,
    });
  }
  return issued!;
}

export async function issueInvoice(ctx: StaffContext, invoiceId: string, opts: { dueDays?: number } = {}): Promise<InvoiceRow> {
  assertStaff(ctx, "commercial.invoices");
  return db.transaction((tx) => issueInvoiceTx(tx, invoiceId, { actorUserId: ctx.user.id, dueDays: opts.dueDays }));
}

/**
 * Create and issue an invoice in one step (subscriptions, credit packs). Lines are priced exactly once with the
 * coupon (if any); tax-inclusive plan prices are backed out. Throws ActionError when the buyer is not ready
 * (billing details missing) — callers surface it to the person buying.
 */
export async function createAndIssueInvoice(
  tx: DbOrTx,
  input: {
    organizationId: string | null;
    buyerUserId?: string | null;
    subscriptionId?: string | null;
    currency: string;
    lines: PricingLineInput[];
    coupon?: CouponRow | null;
    servicePeriodStart?: Date | null;
    servicePeriodEnd?: Date | null;
    dueAt?: Date;
    notes?: string | null;
    actorUserId: string | null;
    now?: Date;
  },
): Promise<InvoiceRow> {
  const now = input.now ?? new Date();
  await currencyMinorUnits(tx, input.currency);
  const config = await getCommercialConfig(tx);
  const [draft] = await tx
    .insert(invoices)
    .values({
      currency: input.currency,
      organizationId: input.organizationId,
      buyerUserId: input.buyerUserId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      status: "draft",
      servicePeriodStart: input.servicePeriodStart ?? null,
      servicePeriodEnd: input.servicePeriodEnd ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  const seller = await getSellerDetails(tx);
  const buyer = await resolveBuyer(tx, { organizationId: input.organizationId, buyerUserId: input.buyerUserId ?? null }, seller);
  if ("problem" in buyer) throw new ActionError(buyer.problem, { code: "billing_profile_required" });
  const taxCtx = await buildTaxContext(tx, { buyer: buyer.tax, seller, at: now });
  const lines = input.lines.map((l) => ({ ...l, taxCode: l.taxCode ?? config["commercial.default_tax_code"] }));
  const priced = priceInvoice(lines, taxCtx, input.coupon ? toCouponDiscount(input.coupon) : null);
  assertPricingOk(priced);
  // Priced once (coupon allocation included) and frozen directly — not re-priced through issueInvoiceTx, which
  // would apply the coupon a second time on top of the allocated line discounts.
  await tx.insert(invoiceLines).values(lineRows(draft!.id, input.currency, priced.lines));
  if (input.coupon && priced.couponDiscountMinor > 0) {
    await redeemCoupon(tx, {
      couponId: input.coupon.id,
      invoiceId: draft!.id,
      currency: input.currency,
      discountMinor: priced.couponDiscountMinor,
      organizationId: input.organizationId,
      userId: input.buyerUserId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      redeemedByUserId: input.actorUserId,
    });
  }
  const dueAt = input.dueAt ?? addDays(now, config["commercial.invoice_due_days"]);
  const code = await nextGstDocumentNumber("invoice", { date: now, tx });
  const zeroTotal = priced.totals.totalMinor === 0;
  const [issued] = await tx
    .update(invoices)
    .set({
      code,
      status: zeroTotal ? "paid" : "issued",
      ...priced.totals,
      taxTreatment: priced.determination.treatment,
      placeOfSupply: priced.determination.placeOfSupply,
      issuedAt: now,
      dueAt,
      paidAt: zeroTotal ? now : null,
      issuedByUserId: input.actorUserId,
      buyerSnapshot: buyer.snapshot,
      sellerSnapshot: { ...seller },
    })
    .where(eq(invoices.id, draft!.id))
    .returning();
  await audit({
    action: "commercial.invoice_issued",
    entityType: "invoice",
    entityId: draft!.id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorType: input.actorUserId ? "user" : "system",
    metadata: { code, currency: input.currency, totalMinor: priced.totals.totalMinor, subscriptionId: input.subscriptionId ?? null, couponId: input.coupon?.id ?? null },
    tx,
  });
  if (!zeroTotal) {
    await notifyBillingContacts(tx, {
      event: "billing.invoice_issued",
      organizationId: input.organizationId,
      buyerUserId: input.buyerUserId ?? null,
      data: { code, amount: formatMoney(priced.totals.totalMinor, input.currency), organizationName: buyer.organizationName, dueAt: isoDate(dueAt) },
      link: BILLING_PATHS.invoice(draft!.id),
      dedupeKey: `invoice-issued:${draft!.id}`,
      includeBillingEmail: true,
    });
  }
  return issued!;
}

// ---------------------------------------------------------------------------
// Void, overdue, payments, credit notes
// ---------------------------------------------------------------------------

/** Void an issued invoice on which nothing has been paid (reason required). Paid invoices need a refund. */
export async function voidInvoiceTx(tx: DbOrTx, invoiceId: string, reason: string, actorUserId: string | null): Promise<InvoiceRow> {
  const invoice = await lockInvoice(tx, invoiceId);
  if (invoice.documentType !== "invoice") throw invalidState("Credit notes cannot be voided.");
  if (invoice.status === "draft") throw invalidState("Delete the draft instead of voiding it.");
  if (!PAYABLE_STATUSES.includes(invoice.status)) throw invalidState("Only unpaid issued invoices can be voided.");
  if (invoice.amountPaidMinor > 0) throw invalidState("Payments have been received on this invoice. Refund them (a credit note is issued) instead of voiding.");
  const [row] = await tx
    .update(invoices)
    .set({ status: "void", voidedAt: new Date(), voidReason: reason.trim(), voidedByUserId: actorUserId })
    .where(eq(invoices.id, invoiceId))
    .returning();
  await reverseRedemptionForInvoice(tx, invoiceId);
  // A subscription waiting for this first invoice cannot start any more.
  if (invoice.subscriptionId) {
    await tx
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), endedAt: new Date(), cancellationReason: "First invoice voided" })
      .where(and(eq(subscriptions.id, invoice.subscriptionId), eq(subscriptions.status, "pending")));
  }
  await audit({
    action: "commercial.invoice_voided",
    entityType: "invoice",
    entityId: invoiceId,
    organizationId: invoice.organizationId,
    actorUserId,
    actorType: actorUserId ? "staff" : "system",
    metadata: { code: invoice.code, reason: reason.trim(), totalMinor: invoice.totalMinor, currency: invoice.currency },
    tx,
  });
  return row!;
}

export async function voidInvoice(ctx: StaffContext, invoiceId: string, reason: string): Promise<InvoiceRow> {
  assertStaff(ctx, "commercial.invoices");
  if (reason.trim().length < 5) throw new ActionError("Give a reason for voiding (at least 5 characters).", { fieldErrors: { reason: ["Required"] } });
  return db.transaction((tx) => voidInvoiceTx(tx, invoiceId, reason, ctx.user.id));
}

/** Mark issued / partially paid invoices past their due date as overdue. Returns the number updated. */
export async function markOverdueInvoices(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(invoices)
    .set({ status: "overdue" })
    .where(and(inArray(invoices.status, ["issued", "partially_paid"]), eq(invoices.documentType, "invoice"), isNotNull(invoices.dueAt), lt(invoices.dueAt, now), sql`${invoices.amountPaidMinor} < ${invoices.totalMinor}`))
    .returning({ id: invoices.id, organizationId: invoices.organizationId, code: invoices.code });
  for (const row of rows) {
    await audit({ action: "commercial.invoice_overdue", entityType: "invoice", entityId: row.id, organizationId: row.organizationId, actorType: "system", actorUserId: null, metadata: { code: row.code } });
  }
  return rows.length;
}

/**
 * Apply money received to an invoice (inside the payment transaction). The amount must not exceed what is
 * outstanding. Returns the updated row and whether it became fully paid.
 */
export async function applyPaymentToInvoiceTx(tx: DbOrTx, invoiceId: string, amountMinor: number, receivedAt: Date): Promise<{ invoice: InvoiceRow; becamePaid: boolean }> {
  const invoice = await lockInvoice(tx, invoiceId);
  if (invoice.documentType !== "invoice" || !PAYABLE_STATUSES.includes(invoice.status)) throw invalidState("This invoice is not open for payment.");
  const outstanding = outstandingMinor(invoice);
  if (amountMinor <= 0) throw new ActionError("The amount must be more than zero.");
  if (amountMinor > outstanding) {
    throw new ActionError(`The amount is more than the ${formatMoney(outstanding, invoice.currency)} outstanding on this invoice.`, { fieldErrors: { amount: ["More than outstanding"] } });
  }
  const amountPaidMinor = invoice.amountPaidMinor + amountMinor;
  const status = deriveInvoiceStatus({ ...invoice, amountPaidMinor });
  const becamePaid = status === "paid";
  const [row] = await tx
    .update(invoices)
    .set({ amountPaidMinor, status, paidAt: becamePaid ? receivedAt : invoice.paidAt })
    .where(eq(invoices.id, invoiceId))
    .returning();
  return { invoice: row!, becamePaid };
}

/** Record a completed refund on the invoice (amountRefunded; status refunded when everything paid is refunded). */
export async function applyRefundToInvoiceTx(tx: DbOrTx, invoiceId: string, amountMinor: number): Promise<InvoiceRow> {
  const invoice = await lockInvoice(tx, invoiceId);
  const amountRefundedMinor = Math.min(invoice.amountPaidMinor, invoice.amountRefundedMinor + amountMinor);
  const status = deriveInvoiceStatus({ ...invoice, amountRefundedMinor });
  const [row] = await tx.update(invoices).set({ amountRefundedMinor, status }).where(eq(invoices.id, invoiceId)).returning();
  return row!;
}

/**
 * Issue a credit note reversing `amountMinor` (tax-inclusive) of an issued invoice: lines scaled in proportion,
 * snapshots copied from the original, its own GST number series (VSGC/…).
 */
export async function createCreditNoteTx(tx: DbOrTx, input: { invoiceId: string; amountMinor: number; reason: string; actorUserId: string | null; now?: Date }): Promise<InvoiceRow> {
  const now = input.now ?? new Date();
  const original = await lockInvoice(tx, input.invoiceId);
  if (original.documentType !== "invoice" || original.status === "draft" || original.status === "void") throw invalidState("A credit note needs an issued invoice.");
  if (input.amountMinor <= 0 || input.amountMinor > original.totalMinor) throw invalidState("The credit note amount must be between zero and the invoice total.");
  const lines = await getInvoiceLines(original.id, tx);
  const scaled = scaleLinesToAmount(
    lines.map((l) => ({ description: l.description, amountMinor: l.amountMinor, taxMinor: l.taxMinor, taxes: l.taxes, taxCode: l.taxCode, referenceType: l.referenceType, referenceId: l.referenceId })),
    input.amountMinor,
  ).filter((l) => l.amountMinor + l.taxMinor > 0);
  const totals = {
    subtotalMinor: scaled.reduce((a, l) => a + l.amountMinor, 0),
    discountMinor: 0,
    taxMinor: scaled.reduce((a, l) => a + l.taxMinor, 0),
  };
  const code = await nextGstDocumentNumber("credit_note", { date: now, tx });
  const [note] = await tx
    .insert(invoices)
    .values({
      currency: original.currency,
      code,
      documentType: "credit_note",
      originalInvoiceId: original.id,
      organizationId: original.organizationId,
      buyerUserId: original.buyerUserId,
      subscriptionId: original.subscriptionId,
      status: "issued",
      taxTreatment: original.taxTreatment,
      ...totals,
      totalMinor: totals.subtotalMinor + totals.taxMinor,
      placeOfSupply: original.placeOfSupply,
      issuedAt: now,
      issuedByUserId: input.actorUserId,
      buyerSnapshot: original.buyerSnapshot,
      sellerSnapshot: original.sellerSnapshot,
      notes: `Credit note against invoice ${original.code}. ${input.reason}`.slice(0, 2000),
    })
    .returning();
  await tx.insert(invoiceLines).values(lineRows(note!.id, original.currency, scaled));
  await audit({
    action: "commercial.credit_note_issued",
    entityType: "invoice",
    entityId: note!.id,
    organizationId: original.organizationId,
    actorUserId: input.actorUserId,
    actorType: input.actorUserId ? "staff" : "system",
    metadata: { code, originalInvoiceId: original.id, originalCode: original.code, totalMinor: note!.totalMinor, currency: original.currency },
    tx,
  });
  return note!;
}
