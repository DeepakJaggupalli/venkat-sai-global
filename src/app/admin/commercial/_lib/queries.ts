import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";

import type { PlatformPermission } from "@/config/permissions";
import { db } from "@/db";
import { billingProfiles, coupons, disputes, invoices, organizations, payments, refunds, taxRates, users } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

/**
 * Read models the commercial module does not expose yet (reported as cross-module needs). Every function
 * re-checks the staff permission; callers pass the context from requireStaff().
 */

function assert(ctx: StaffContext, permission: PlatformPermission | PlatformPermission[]): void {
  if (!staffCan(ctx, permission, "any")) forbidden();
}

export type OrgOption = { value: string; label: string; type: OrgType };

/** Organisations for pickers (not deleted), optionally of some types. */
export async function listOrganizationOptions(ctx: StaffContext, types?: OrgType[]): Promise<OrgOption[]> {
  assert(ctx, ["commercial.view", "partners.settlements"]);
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, type: organizations.type })
    .from(organizations)
    .where(and(isNull(organizations.deletedAt), types?.length ? inArray(organizations.type, types) : undefined))
    .orderBy(asc(organizations.name))
    .limit(1000);
  return rows.map((r) => ({ value: r.id, label: r.name, type: r.type }));
}

export type BuyerTaxProfile = { organizationId: string; name: string; countryCode: string | null; stateCode: string | null; taxExempt: boolean; currency: string | null; hasProfile: boolean };

/** Tax-relevant billing profile fields per organisation (live invoice tax preview). */
export async function listBuyerTaxProfiles(ctx: StaffContext): Promise<BuyerTaxProfile[]> {
  assert(ctx, "commercial.invoices");
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      profileId: billingProfiles.organizationId,
      countryCode: billingProfiles.countryCode,
      stateCode: billingProfiles.stateCode,
      taxExempt: billingProfiles.taxExempt,
      currency: billingProfiles.currency,
    })
    .from(organizations)
    .leftJoin(billingProfiles, eq(billingProfiles.organizationId, organizations.id))
    .where(isNull(organizations.deletedAt))
    .orderBy(asc(organizations.name))
    .limit(1000);
  return rows.map((r) => ({
    organizationId: r.id,
    name: r.name,
    countryCode: r.countryCode ?? null,
    stateCode: r.stateCode ?? null,
    taxExempt: r.taxExempt ?? false,
    currency: r.currency ?? null,
    hasProfile: Boolean(r.profileId),
  }));
}

/** Active tax rates (all countries) for the client-side preview; the service re-prices at issue. */
export async function listActiveTaxRatesForPreview(ctx: StaffContext) {
  assert(ctx, "commercial.invoices");
  const rows = await db.select().from(taxRates).where(eq(taxRates.isActive, true));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    countryCode: r.countryCode,
    region: r.region,
    kind: r.kind,
    rateBasisPoints: r.rateBasisPoints,
    taxCode: r.taxCode,
    isActive: r.isActive,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveUntil: r.effectiveUntil ? r.effectiveUntil.toISOString() : null,
  }));
}
export type PreviewTaxRate = Awaited<ReturnType<typeof listActiveTaxRatesForPreview>>[number];

export async function getTaxRate(ctx: StaffContext, id: string) {
  assert(ctx, "commercial.view");
  const [row] = await db.select().from(taxRates).where(eq(taxRates.id, id)).limit(1);
  return row ?? null;
}

export async function getCoupon(ctx: StaffContext, id: string) {
  assert(ctx, "commercial.view");
  const [row] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return row ?? null;
}

/** One refund with its payment, invoice and organisation. */
export async function getRefundDetail(ctx: StaffContext, id: string) {
  assert(ctx, "commercial.view");
  const [row] = await db
    .select({
      refund: refunds,
      paymentCode: payments.code,
      paymentProvider: payments.provider,
      paymentAmountMinor: payments.amountMinor,
      paymentRefundedMinor: payments.amountRefundedMinor,
      invoiceId: payments.invoiceId,
      organizationName: organizations.name,
      requestedBy: users.displayName,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .leftJoin(organizations, eq(organizations.id, refunds.organizationId))
    .leftJoin(users, eq(users.id, refunds.requestedByUserId))
    .where(eq(refunds.id, id))
    .limit(1);
  if (!row) return null;
  let invoiceCode: string | null = null;
  if (row.invoiceId) {
    const [inv] = await db.select({ code: invoices.code }).from(invoices).where(eq(invoices.id, row.invoiceId)).limit(1);
    invoiceCode = inv?.code ?? null;
  }
  return { ...row, invoiceCode };
}

/** One dispute with its invoice / payment references and organisation. */
export async function getDisputeDetail(ctx: StaffContext, id: string) {
  assert(ctx, "commercial.view");
  const [row] = await db
    .select({ dispute: disputes, organizationName: organizations.name, openedBy: users.displayName })
    .from(disputes)
    .leftJoin(organizations, eq(organizations.id, disputes.organizationId))
    .leftJoin(users, eq(users.id, disputes.openedByUserId))
    .where(eq(disputes.id, id))
    .limit(1);
  if (!row) return null;
  const [inv, pay] = await Promise.all([
    row.dispute.invoiceId ? db.select({ code: invoices.code, currency: invoices.currency, totalMinor: invoices.totalMinor }).from(invoices).where(eq(invoices.id, row.dispute.invoiceId)).limit(1) : Promise.resolve([]),
    row.dispute.paymentId ? db.select({ code: payments.code, currency: payments.currency, amountMinor: payments.amountMinor }).from(payments).where(eq(payments.id, row.dispute.paymentId)).limit(1) : Promise.resolve([]),
  ]);
  return { ...row, invoice: inv[0] ?? null, payment: pay[0] ?? null };
}

/** Open invoices (issued / partially paid / overdue) for the offline payment picker. */
export async function listPayableInvoiceOptions(ctx: StaffContext) {
  assert(ctx, "commercial.payments");
  const rows = await db
    .select({ id: invoices.id, code: invoices.code, currency: invoices.currency, totalMinor: invoices.totalMinor, paidMinor: invoices.amountPaidMinor, organizationId: invoices.organizationId, organizationName: organizations.name })
    .from(invoices)
    .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
    .where(and(eq(invoices.documentType, "invoice"), inArray(invoices.status, ["issued", "partially_paid", "overdue"])))
    .orderBy(asc(invoices.dueAt))
    .limit(500);
  return rows;
}

/** Payments recorded against one invoice (ids for refund requests). */
export async function listInvoicePayments(ctx: StaffContext, invoiceId: string) {
  assert(ctx, "commercial.view");
  return db
    .select({ id: payments.id, code: payments.code, provider: payments.provider, status: payments.status, currency: payments.currency, amountMinor: payments.amountMinor, amountRefundedMinor: payments.amountRefundedMinor, receivedAt: payments.receivedAt, externalReference: payments.externalReference })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(asc(payments.createdAt));
}
