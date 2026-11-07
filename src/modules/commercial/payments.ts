import "server-only";

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { currencies, invoices, organizations, payments, type PaymentMethod, type PaymentProvider } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { formatMoney } from "@/lib/format";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit";
import { requireUploadedFile } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { BILLING_PATHS, PENDING_CHECKOUT_TTL_HOURS } from "./constants";
import { invalidState, isUniqueViolation, notFound } from "./errors";
import { fulfilPaidInvoiceTx } from "./fulfilment";
import { applyPaymentToInvoiceTx, lockInvoice, outstandingMinor, PAYABLE_STATUSES } from "./invoices";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import { notifyBillingContacts } from "./notify";
import type { OfflinePaymentInput } from "./schemas";

/**
 * Payments: offline payments recorded by finance (bank transfer with UTR, UPI reference, cheque, other) and
 * gateway payments (Razorpay / Stripe) confirmed by checkout verification or signed webhooks. Gateway payments are
 * unique per (provider, providerPaymentId), so replayed callbacks can never record a payment twice. A payment on
 * an invoice is always in the invoice's currency (composite FK) and never exceeds what is outstanding.
 */

export type PaymentRow = typeof payments.$inferSelect;

async function lockPayment(tx: DbOrTx, paymentId: string): Promise<PaymentRow> {
  const [row] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for("update");
  if (!row) throw notFound("Payment");
  return row;
}

async function afterSuccess(tx: DbOrTx, payment: PaymentRow, invoiceId: string | null, now: Date, actorUserId: string | null): Promise<void> {
  let invoiceCode: string | null = null;
  let organizationId = payment.organizationId;
  let buyerUserId = payment.payerUserId;
  if (invoiceId) {
    const { invoice, becamePaid } = await applyPaymentToInvoiceTx(tx, invoiceId, payment.amountMinor, payment.receivedAt ?? now);
    invoiceCode = invoice.code;
    organizationId = invoice.organizationId;
    buyerUserId = invoice.buyerUserId;
    if (becamePaid) await fulfilPaidInvoiceTx(tx, invoice, now, actorUserId);
  }
  await notifyBillingContacts(tx, {
    event: "billing.payment_received",
    organizationId,
    buyerUserId,
    data: { code: payment.code, amount: formatMoney(payment.amountMinor, payment.currency), invoiceCode },
    link: invoiceId ? BILLING_PATHS.invoice(invoiceId) : null,
    dedupeKey: `payment-received:${payment.id}`,
    includeBillingEmail: true,
  });
}

/**
 * Record an offline payment (commercial.payments): bank transfer (UTR), UPI (transaction reference), cheque
 * (number) or other. With an invoice the amount may not exceed what is outstanding; without one it is an
 * advance payment of the organisation, allocated later.
 */
export async function recordOfflinePayment(ctx: StaffContext, input: OfflinePaymentInput): Promise<PaymentRow> {
  assertStaff(ctx, "commercial.payments");
  if (input.receivedAt.getTime() > Date.now() + 86_400_000) throw new ActionError("The received date cannot be in the future.", { fieldErrors: { receivedAt: ["In the future"] } });
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(currencies).where(eq(currencies.code, input.currency)).limit(1);
    if (!cur) throw new ActionError("Choose a currency.", { fieldErrors: { currency: ["Unknown currency"] } });
    const parsed = parseDecimalToMinor(input.amount, minorUnitsFor(cur.code, cur.minorUnits));
    if (!parsed.ok || parsed.minor <= 0) throw new ActionError(parsed.ok ? "The amount must be more than zero." : parsed.error, { fieldErrors: { amount: [parsed.ok ? "Must be positive" : parsed.error] } });

    let organizationId = input.organizationId ?? null;
    let payerUserId: string | null = null;
    if (input.invoiceId) {
      const invoice = await lockInvoice(tx, input.invoiceId);
      if (invoice.currency !== cur.code) throw new ActionError(`This invoice is in ${invoice.currency}. Record the payment in that currency.`, { fieldErrors: { currency: ["Different from the invoice"] } });
      if (!PAYABLE_STATUSES.includes(invoice.status) || invoice.documentType !== "invoice") throw invalidState("This invoice is not open for payment.");
      if (parsed.minor > outstandingMinor(invoice)) {
        throw new ActionError(`Only ${formatMoney(outstandingMinor(invoice), invoice.currency)} is outstanding. Record any excess as a separate advance payment.`, { fieldErrors: { amount: ["More than outstanding"] } });
      }
      organizationId = invoice.organizationId;
      payerUserId = invoice.buyerUserId;
    } else if (organizationId) {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (!org) throw notFound("Organisation");
    }
    if (input.proofFileId) await requireUploadedFile(input.proofFileId, { purposes: ["invoice", "other"] }, tx);
    if (input.externalReference) {
      const [dup] = await tx
        .select({ code: payments.code })
        .from(payments)
        .where(and(eq(payments.provider, input.provider), eq(payments.externalReference, input.externalReference), inArray(payments.status, ["succeeded", "partially_refunded", "refunded"])))
        .limit(1);
      if (dup) throw new ActionError(`A payment with this reference is already recorded (${dup.code}).`, { fieldErrors: { externalReference: ["Already recorded"] } });
    }
    const code = await nextCode("PAY", { tx });
    const method: PaymentMethod = input.method ?? (input.provider === "upi_manual" ? "upi" : input.provider === "cheque" ? "cheque" : input.provider === "bank_transfer" ? "bank_transfer" : "other");
    const [payment] = await tx
      .insert(payments)
      .values({
        currency: cur.code,
        code,
        organizationId,
        payerUserId,
        invoiceId: input.invoiceId ?? null,
        provider: input.provider,
        method,
        status: "succeeded",
        amountMinor: parsed.minor,
        externalReference: input.externalReference ?? null,
        receivedAt: input.receivedAt,
        proofFileId: input.proofFileId ?? null,
        recordedByUserId: ctx.user.id,
        metadata: input.notes ? { notes: input.notes } : {},
      })
      .returning();
    await afterSuccess(tx, payment!, input.invoiceId ?? null, new Date(), ctx.user.id);
    await audit({
      action: "commercial.payment_recorded",
      entityType: "payment",
      entityId: payment!.id,
      organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { code, provider: input.provider, amountMinor: parsed.minor, currency: cur.code, invoiceId: input.invoiceId ?? null, externalReference: input.externalReference ?? null },
      tx,
    });
    return payment!;
  });
}

/** Allocate an advance (unallocated) payment to an invoice of the same organisation and currency. */
export async function allocatePayment(ctx: StaffContext, input: { paymentId: string; invoiceId: string }): Promise<PaymentRow> {
  assertStaff(ctx, "commercial.payments");
  return db.transaction(async (tx) => {
    const payment = await lockPayment(tx, input.paymentId);
    if (payment.invoiceId) throw invalidState("This payment is already allocated to an invoice.");
    if (payment.status !== "succeeded" || payment.amountRefundedMinor > 0) throw invalidState("Only received, unrefunded payments can be allocated.");
    const invoice = await lockInvoice(tx, input.invoiceId);
    if (invoice.currency !== payment.currency) throw invalidState(`The invoice is in ${invoice.currency} but the payment is in ${payment.currency}.`);
    if (payment.organizationId && invoice.organizationId !== payment.organizationId) throw invalidState("The invoice belongs to another organisation.");
    const [row] = await tx.update(payments).set({ invoiceId: invoice.id, organizationId: invoice.organizationId }).where(eq(payments.id, payment.id)).returning();
    const { invoice: updated, becamePaid } = await applyPaymentToInvoiceTx(tx, invoice.id, payment.amountMinor, payment.receivedAt ?? new Date());
    if (becamePaid) await fulfilPaidInvoiceTx(tx, updated, new Date(), ctx.user.id);
    await audit({ action: "commercial.payment_allocated", entityType: "payment", entityId: payment.id, organizationId: invoice.organizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { invoiceId: invoice.id, code: payment.code }, tx });
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Gateway payments
// ---------------------------------------------------------------------------

/** Pending row created when a checkout starts (Razorpay order / Stripe Checkout Session). */
export async function createPendingGatewayPaymentTx(
  tx: DbOrTx,
  input: { provider: "razorpay" | "stripe"; invoiceId: string; organizationId: string | null; payerUserId: string | null; currency: string; amountMinor: number; providerOrderId: string; metadata?: Record<string, unknown> },
): Promise<PaymentRow> {
  const code = await nextCode("PAY", { tx });
  const [row] = await tx
    .insert(payments)
    .values({
      currency: input.currency,
      code,
      organizationId: input.organizationId,
      payerUserId: input.payerUserId,
      invoiceId: input.invoiceId,
      provider: input.provider,
      status: "pending",
      amountMinor: input.amountMinor,
      providerOrderId: input.providerOrderId,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row!;
}

export type GatewaySuccess = {
  provider: "razorpay" | "stripe";
  providerOrderId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  method?: PaymentMethod | null;
  providerFeeMinor?: number | null;
  metadata?: Record<string, unknown>;
  receivedAt?: Date;
};

export type GatewayOutcome = { status: "recorded" | "duplicate" | "unallocated" | "not_found"; paymentId: string | null; invoiceId: string | null };

/**
 * Record a confirmed gateway payment (checkout verification or webhook). Idempotent: an already succeeded payment
 * is reported as a duplicate. If the invoice can no longer take the money (voided, paid by another payment), the
 * payment is kept as an unallocated advance for finance to refund or allocate.
 */
export async function recordGatewaySuccessTx(tx: DbOrTx, input: GatewaySuccess): Promise<GatewayOutcome> {
  const [pending] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, input.provider), eq(payments.providerOrderId, input.providerOrderId)))
    .orderBy(sql`case when ${payments.status} = 'succeeded' then 0 else 1 end`)
    .limit(1)
    .for("update");
  if (!pending) return { status: "not_found", paymentId: null, invoiceId: null };
  if (["succeeded", "partially_refunded", "refunded"].includes(pending.status)) return { status: "duplicate", paymentId: pending.id, invoiceId: pending.invoiceId };
  if (pending.currency !== input.currency.toUpperCase() || pending.amountMinor !== input.amountMinor) {
    logger.error("Gateway amount mismatch", { paymentId: pending.id, expected: pending.amountMinor, got: input.amountMinor, currency: input.currency });
  }
  const receivedAt = input.receivedAt ?? new Date();
  let invoiceId = pending.invoiceId;
  let allocatable = false;
  if (invoiceId) {
    const invoice = await lockInvoice(tx, invoiceId);
    allocatable = PAYABLE_STATUSES.includes(invoice.status) && invoice.currency === input.currency.toUpperCase() && input.amountMinor <= outstandingMinor(invoice) && input.amountMinor > 0;
    if (!allocatable) invoiceId = null;
  }
  let updated: PaymentRow;
  try {
    [updated] = (await tx
      .update(payments)
      .set({
        status: "succeeded",
        providerPaymentId: input.providerPaymentId,
        amountMinor: input.amountMinor,
        method: input.method ?? null,
        providerFeeMinor: input.providerFeeMinor ?? null,
        receivedAt,
        invoiceId,
        failureReason: null,
        metadata: { ...pending.metadata, ...(input.metadata ?? {}) },
      })
      .where(eq(payments.id, pending.id))
      .returning()) as [PaymentRow];
  } catch (error) {
    if (isUniqueViolation(error, "payments_provider_ref_uq")) return { status: "duplicate", paymentId: pending.id, invoiceId: pending.invoiceId };
    throw error;
  }
  await afterSuccess(tx, updated, invoiceId, receivedAt, null);
  await audit({
    action: allocatable || !pending.invoiceId ? "commercial.payment_succeeded" : "commercial.payment_unallocated",
    entityType: "payment",
    entityId: pending.id,
    organizationId: pending.organizationId,
    actorType: "system",
    actorUserId: null,
    metadata: { provider: input.provider, providerPaymentId: input.providerPaymentId, amountMinor: input.amountMinor, currency: input.currency, invoiceId: pending.invoiceId, allocated: Boolean(invoiceId) },
    tx,
  });
  return { status: invoiceId || !pending.invoiceId ? "recorded" : "unallocated", paymentId: pending.id, invoiceId };
}

/** Record a failed gateway attempt (pending → failed) and tell the buyer. Idempotent. */
export async function recordGatewayFailureTx(tx: DbOrTx, input: { provider: "razorpay" | "stripe"; providerOrderId: string; providerPaymentId?: string | null; reason: string }): Promise<GatewayOutcome> {
  const [pending] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, input.provider), eq(payments.providerOrderId, input.providerOrderId), eq(payments.status, "pending")))
    .limit(1)
    .for("update");
  if (!pending) return { status: "not_found", paymentId: null, invoiceId: null };
  await tx
    .update(payments)
    .set({ status: "failed", failureReason: input.reason.slice(0, 500), metadata: { ...pending.metadata, ...(input.providerPaymentId ? { failedPaymentId: input.providerPaymentId } : {}) } })
    .where(eq(payments.id, pending.id));
  let invoiceCode: string | null = null;
  if (pending.invoiceId) {
    const [inv] = await tx.select({ code: invoices.code }).from(invoices).where(eq(invoices.id, pending.invoiceId)).limit(1);
    invoiceCode = inv?.code ?? null;
  }
  await notifyBillingContacts(tx, {
    event: "billing.payment_failed",
    organizationId: pending.organizationId,
    buyerUserId: pending.payerUserId,
    data: { amount: formatMoney(pending.amountMinor, pending.currency), invoiceCode, reason: input.reason.slice(0, 200) },
    link: pending.invoiceId ? BILLING_PATHS.invoice(pending.invoiceId) : null,
    dedupeKey: `payment-failed:${pending.id}`,
  });
  await audit({ action: "commercial.payment_failed", entityType: "payment", entityId: pending.id, organizationId: pending.organizationId, actorType: "system", actorUserId: null, metadata: { provider: input.provider, reason: input.reason.slice(0, 200) }, tx });
  return { status: "recorded", paymentId: pending.id, invoiceId: pending.invoiceId };
}

/** Gateway checkouts left pending for more than PENDING_CHECKOUT_TTL_HOURS are marked failed (no notification). */
export async function expireStaleCheckouts(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_CHECKOUT_TTL_HOURS * 3_600_000);
  const rows = await db
    .update(payments)
    .set({ status: "failed", failureReason: "Checkout was not completed." })
    .where(and(eq(payments.status, "pending"), inArray(payments.provider, ["razorpay", "stripe"] satisfies PaymentProvider[]), lt(payments.createdAt, cutoff), isNull(payments.providerPaymentId)))
    .returning({ id: payments.id });
  return rows.length;
}
