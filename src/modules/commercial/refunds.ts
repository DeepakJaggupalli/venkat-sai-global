import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { currencies, payments, refunds, type RefundStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { formatMoney } from "@/lib/format";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit";
import { submitForApproval } from "@/modules/approvals/service";
import type { ApprovalDecision } from "@/modules/approvals/types";
import type { StaffContext } from "@/modules/identity/authz";
import { enqueueTask } from "@/server/tasks/queue";

import { assertStaff } from "./access";
import { BILLING_PATHS } from "./constants";
import { GatewayError, invalidState, notFound } from "./errors";
import { createRazorpayRefund } from "./gateways/razorpay";
import { createStripeRefund } from "./gateways/stripe";
import { applyRefundToInvoiceTx, createCreditNoteTx, lockInvoice } from "./invoices";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import { notifyBillingContacts } from "./notify";
import type { RefundRequestInput } from "./schemas";

/**
 * Refunds: requested by staff (commercial.payments or commercial.refunds) → approval "refund" (approvals.decide +
 * commercial.refunds) → processed by the gateway refund API (Razorpay / Stripe; task commercial.process_refund) or,
 * for offline payments, completed manually by finance with the payout reference. On completion the payment and
 * invoice record the refunded amount, a GST credit note is issued against the invoice, and the buyer is notified
 * (billing.refund_processed).
 *
 *   requested ──approve──► approved ──gateway──► processing ──► completed | failed
 *        └──reject──► rejected        └──offline: completeManualRefund──► completed
 */

export type RefundRow = typeof refunds.$inferSelect;

const OPEN_REFUND_STATUSES: RefundStatus[] = ["requested", "approved", "processing"];

async function lockRefund(tx: DbOrTx, refundId: string): Promise<RefundRow> {
  const [row] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1).for("update");
  if (!row) throw notFound("Refund");
  return row;
}

/** Amount still refundable on a payment: paid − refunded − refunds already in progress. */
async function refundableMinor(tx: DbOrTx, payment: typeof payments.$inferSelect, excludeRefundId?: string): Promise<number> {
  const [open] = await tx
    .select({ value: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, OPEN_REFUND_STATUSES), excludeRefundId ? sql`${refunds.id} <> ${excludeRefundId}` : undefined));
  return payment.amountMinor - payment.amountRefundedMinor - Number(open?.value ?? 0);
}

export async function requestRefund(ctx: StaffContext, input: RefundRequestInput): Promise<RefundRow> {
  assertStaff(ctx, ["commercial.payments", "commercial.refunds"], "any");
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1).for("update");
    if (!payment) throw notFound("Payment");
    if (!["succeeded", "partially_refunded"].includes(payment.status)) throw invalidState("Only received payments can be refunded.");
    const available = await refundableMinor(tx, payment);
    if (available <= 0) throw invalidState("This payment has nothing left to refund.");
    let amountMinor = available;
    if (input.amount) {
      const [cur] = await tx.select({ minorUnits: currencies.minorUnits }).from(currencies).where(eq(currencies.code, payment.currency)).limit(1);
      const parsed = parseDecimalToMinor(input.amount, minorUnitsFor(payment.currency, cur?.minorUnits));
      if (!parsed.ok || parsed.minor <= 0) throw new ActionError(parsed.ok ? "The amount must be more than zero." : parsed.error, { fieldErrors: { amount: ["Invalid amount"] } });
      if (parsed.minor > available) throw new ActionError(`At most ${formatMoney(available, payment.currency)} can be refunded.`, { fieldErrors: { amount: ["More than refundable"] } });
      amountMinor = parsed.minor;
    }
    const code = await nextCode("RFD", { tx });
    const [refund] = await tx
      .insert(refunds)
      .values({ code, currency: payment.currency, paymentId: payment.id, organizationId: payment.organizationId, amountMinor, reason: input.reason, requestedByUserId: ctx.user.id })
      .returning();
    const approval = await submitForApproval(
      {
        type: "refund",
        entityType: "refund",
        entityId: refund!.id,
        organizationId: payment.organizationId,
        title: `Refund ${formatMoney(amountMinor, payment.currency)} of payment ${payment.code}`,
        summary: input.reason,
        payload: { refundCode: code, paymentCode: payment.code, amountMinor, currency: payment.currency, provider: payment.provider },
        priority: "normal",
        submittedByUserId: ctx.user.id,
      },
      tx,
    );
    const [linked] = await tx.update(refunds).set({ approvalRequestId: approval.id }).where(eq(refunds.id, refund!.id)).returning();
    await audit({ action: "commercial.refund_requested", entityType: "refund", entityId: refund!.id, organizationId: payment.organizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { code, paymentId: payment.id, amountMinor, currency: payment.currency, approvalId: approval.id }, tx });
    return linked!;
  });
}

/** Apply an approval decision (approval handler; inside the decision transaction). */
export async function applyRefundDecisionTx(tx: DbOrTx, refundId: string, decision: ApprovalDecision, reason: string | null, actorUserId: string): Promise<void> {
  const refund = await lockRefund(tx, refundId);
  if (refund.status !== "requested") throw invalidState("This refund has already been decided.");
  if (decision === "approved") {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1).for("update");
    if (!payment || (await refundableMinor(tx, payment, refund.id)) < refund.amountMinor) throw invalidState("The payment no longer has enough left to refund this amount.");
    await tx.update(refunds).set({ status: "approved", approvedByUserId: actorUserId, approvedAt: new Date(), decisionNote: reason }).where(eq(refunds.id, refund.id));
    if (payment.provider === "razorpay" || payment.provider === "stripe") {
      await enqueueTask("commercial.process_refund", { refundId: refund.id }, { tx, dedupeKey: `commercial.process_refund:${refund.id}` });
    }
  } else if (decision === "rejected") {
    await tx.update(refunds).set({ status: "rejected", decisionNote: reason }).where(eq(refunds.id, refund.id));
  } else {
    // changes_requested: stays requested; the requester can resubmit with a new amount or reason.
    await tx.update(refunds).set({ decisionNote: reason }).where(eq(refunds.id, refund.id));
  }
  await audit({ action: `commercial.refund_${decision}`, entityType: "refund", entityId: refund.id, organizationId: refund.organizationId, actorUserId, actorType: "staff", metadata: { code: refund.code, reason }, tx });
}

/** Resubmit a refund after "changes requested" (optionally with a new amount / reason). */
export async function resubmitRefund(ctx: StaffContext, input: { refundId: string; amount?: string; reason?: string }): Promise<RefundRow> {
  assertStaff(ctx, ["commercial.payments", "commercial.refunds"], "any");
  return db.transaction(async (tx) => {
    const refund = await lockRefund(tx, input.refundId);
    if (refund.status !== "requested") throw invalidState("Only open refund requests can be resubmitted.");
    const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1).for("update");
    if (!payment) throw notFound("Payment");
    let amountMinor = refund.amountMinor;
    if (input.amount) {
      const [cur] = await tx.select({ minorUnits: currencies.minorUnits }).from(currencies).where(eq(currencies.code, payment.currency)).limit(1);
      const parsed = parseDecimalToMinor(input.amount, minorUnitsFor(payment.currency, cur?.minorUnits));
      if (!parsed.ok || parsed.minor <= 0) throw new ActionError("Enter a valid amount.", { fieldErrors: { amount: ["Invalid amount"] } });
      amountMinor = parsed.minor;
    }
    if (amountMinor > (await refundableMinor(tx, payment, refund.id))) throw new ActionError("The amount is more than can be refunded.", { fieldErrors: { amount: ["More than refundable"] } });
    const reason = input.reason?.trim() || refund.reason;
    const [row] = await tx.update(refunds).set({ amountMinor, reason }).where(eq(refunds.id, refund.id)).returning();
    await submitForApproval(
      { type: "refund", entityType: "refund", entityId: refund.id, organizationId: refund.organizationId, title: `Refund ${formatMoney(amountMinor, refund.currency)} of payment ${payment.code}`, summary: reason, payload: { refundCode: refund.code, paymentCode: payment.code, amountMinor, currency: refund.currency, provider: payment.provider }, submittedByUserId: ctx.user.id },
      tx,
    );
    await audit({ action: "commercial.refund_resubmitted", entityType: "refund", entityId: refund.id, organizationId: refund.organizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { amountMinor }, tx });
    return row!;
  });
}

/**
 * Send an approved gateway refund to the provider (task commercial.process_refund). The API call runs outside any
 * transaction; the provider's refund id is stored, and the refund completes immediately when the provider reports
 * it processed, otherwise on the refund webhook.
 */
export async function processApprovedRefund(refundId: string): Promise<RefundStatus> {
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (!refund) throw notFound("Refund");
  if (refund.status !== "approved") return refund.status;
  const [payment] = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  if (!payment?.providerPaymentId || (payment.provider !== "razorpay" && payment.provider !== "stripe")) return refund.status;
  try {
    if (payment.provider === "razorpay") {
      const result = await createRazorpayRefund(payment.providerPaymentId, { amountMinor: refund.amountMinor, receipt: refund.code, notes: { refundId: refund.id } });
      return await db.transaction(async (tx) => {
        await tx.update(refunds).set({ status: "processing", providerRefundId: result.id }).where(and(eq(refunds.id, refund.id), eq(refunds.status, "approved")));
        if (result.status === "processed") return completeRefundTx(tx, refund.id, { providerRefundId: result.id, processedAt: new Date(), actorUserId: null });
        if (result.status === "failed") return failRefundTx(tx, refund.id, "The payment provider could not process the refund.");
        return "processing" as const;
      });
    }
    const result = await createStripeRefund({ paymentIntentId: payment.providerPaymentId, amountMinor: refund.amountMinor, refundId: refund.id });
    return await db.transaction(async (tx) => {
      await tx.update(refunds).set({ status: "processing", providerRefundId: result.id }).where(and(eq(refunds.id, refund.id), eq(refunds.status, "approved")));
      if (result.status === "succeeded") return completeRefundTx(tx, refund.id, { providerRefundId: result.id, processedAt: new Date(), actorUserId: null });
      if (result.status === "failed" || result.status === "canceled") return failRefundTx(tx, refund.id, result.failure_reason ?? "The payment provider could not process the refund.");
      return "processing" as const;
    });
  } catch (error) {
    if (error instanceof GatewayError && error.status !== null && error.status >= 400 && error.status < 500) {
      // A definite rejection (e.g. already refunded at the provider): record it; retrying will not help.
      return db.transaction((tx) => failRefundTx(tx, refund.id, error.message));
    }
    logger.error("Refund processing failed (will retry)", { error, refundId });
    throw error;
  }
}

/**
 * Complete a refund (gateway confirmation or manual payout): payment + invoice amounts, credit note, notification.
 * Idempotent: a completed refund is left as it is.
 */
export async function completeRefundTx(tx: DbOrTx, refundId: string, input: { providerRefundId?: string | null; processedAt: Date; actorUserId: string | null; reference?: string | null }): Promise<RefundStatus> {
  const refund = await lockRefund(tx, refundId);
  if (refund.status === "completed") return "completed";
  if (!["approved", "processing"].includes(refund.status)) throw invalidState("Only approved refunds can be completed.");
  const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1).for("update");
  if (!payment) throw notFound("Payment");
  const amountRefundedMinor = Math.min(payment.amountMinor, payment.amountRefundedMinor + refund.amountMinor);
  await tx
    .update(payments)
    .set({ amountRefundedMinor, status: amountRefundedMinor >= payment.amountMinor ? "refunded" : "partially_refunded" })
    .where(eq(payments.id, payment.id));
  let creditNoteId: string | null = null;
  if (payment.invoiceId) {
    const invoice = await lockInvoice(tx, payment.invoiceId);
    if (invoice.status !== "void" && invoice.code) {
      const note = await createCreditNoteTx(tx, { invoiceId: invoice.id, amountMinor: Math.min(refund.amountMinor, invoice.totalMinor), reason: `Refund ${refund.code}: ${refund.reason}`, actorUserId: input.actorUserId });
      creditNoteId = note.id;
    }
    await applyRefundToInvoiceTx(tx, invoice.id, refund.amountMinor);
  }
  await tx
    .update(refunds)
    .set({ status: "completed", processedAt: input.processedAt, providerRefundId: input.providerRefundId ?? refund.providerRefundId ?? (input.reference ? `manual:${input.reference}` : null), creditNoteInvoiceId: creditNoteId, failureReason: null })
    .where(eq(refunds.id, refund.id));
  await notifyBillingContacts(tx, {
    event: "billing.refund_processed",
    organizationId: payment.organizationId,
    buyerUserId: payment.payerUserId,
    data: { code: refund.code, amount: formatMoney(refund.amountMinor, refund.currency) },
    link: payment.invoiceId ? BILLING_PATHS.invoice(payment.invoiceId) : null,
    dedupeKey: `refund-processed:${refund.id}`,
    includeBillingEmail: true,
  });
  await audit({ action: "commercial.refund_completed", entityType: "refund", entityId: refund.id, organizationId: refund.organizationId, actorUserId: input.actorUserId, actorType: input.actorUserId ? "staff" : "system", metadata: { code: refund.code, amountMinor: refund.amountMinor, currency: refund.currency, creditNoteId, reference: input.reference ?? null }, tx });
  return "completed";
}

export async function failRefundTx(tx: DbOrTx, refundId: string, reason: string): Promise<RefundStatus> {
  const refund = await lockRefund(tx, refundId);
  if (refund.status === "completed" || refund.status === "failed") return refund.status;
  await tx.update(refunds).set({ status: "failed", failureReason: reason.slice(0, 500) }).where(eq(refunds.id, refund.id));
  await audit({ action: "commercial.refund_failed", entityType: "refund", entityId: refund.id, organizationId: refund.organizationId, actorType: "system", actorUserId: null, metadata: { reason: reason.slice(0, 200) }, tx });
  return "failed";
}

/** Finance completes an approved refund of an offline payment, with the payout reference (commercial.refunds). */
export async function completeManualRefund(ctx: StaffContext, input: { refundId: string; reference: string; processedAt: Date }): Promise<RefundStatus> {
  assertStaff(ctx, "commercial.refunds");
  return db.transaction(async (tx) => {
    const refund = await lockRefund(tx, input.refundId);
    const [payment] = await tx.select({ provider: payments.provider }).from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
    if (payment && (payment.provider === "razorpay" || payment.provider === "stripe") && refund.status === "processing") {
      throw invalidState("This refund is being processed by the payment provider and completes automatically.");
    }
    return completeRefundTx(tx, refund.id, { processedAt: input.processedAt, actorUserId: ctx.user.id, reference: input.reference.trim() });
  });
}

/** Retry a failed gateway refund (after fixing the cause at the provider). */
export async function retryRefund(ctx: StaffContext, refundId: string): Promise<void> {
  assertStaff(ctx, "commercial.refunds");
  await db.transaction(async (tx) => {
    const refund = await lockRefund(tx, refundId);
    if (refund.status !== "failed") throw invalidState("Only failed refunds can be retried.");
    await tx.update(refunds).set({ status: "approved", failureReason: null, providerRefundId: null }).where(eq(refunds.id, refund.id));
    await enqueueTask("commercial.process_refund", { refundId }, { tx });
    await audit({ action: "commercial.refund_retried", entityType: "refund", entityId: refundId, organizationId: refund.organizationId, actorUserId: ctx.user.id, actorType: "staff", tx });
  });
}

/** Refund lookup by the provider's refund id (webhooks). */
export async function refundByProviderId(providerRefundId: string, tx: DbOrTx = db): Promise<RefundRow | null> {
  const [row] = await tx.select().from(refunds).where(eq(refunds.providerRefundId, providerRefundId)).limit(1);
  return row ?? null;
}
