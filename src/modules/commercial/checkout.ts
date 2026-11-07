import "server-only";

import { and, eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { currencies, invoices, payments } from "@/db/schema";
import { BRAND } from "@/config/site";
import { ActionError } from "@/lib/actions";
import { absoluteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { audit, logSecurityEvent } from "@/modules/audit";
import type { SessionUser } from "@/modules/identity/session";

import { userCanManageOrgBilling, userCanViewOrgBilling } from "./access";
import { getOnlinePaymentOptions, razorpayCredentials } from "./config";
import { BILLING_PATHS } from "./constants";
import { GatewayError, invalidState, notFound } from "./errors";
import { captureRazorpayPayment, createRazorpayOrder, fetchRazorpayPayment, razorpayMethod } from "./gateways/razorpay";
import { verifyRazorpayPaymentSignature } from "./gateways/signatures";
import { createStripeCheckoutSession, retrieveStripeCheckoutSession } from "./gateways/stripe";
import { lockInvoice, outstandingMinor, PAYABLE_STATUSES, type InvoiceRow } from "./invoices";
import { minorUnitsFor } from "./money";
import { createPendingGatewayPaymentTx, recordGatewayFailureTx, recordGatewaySuccessTx, type GatewayOutcome, type PaymentRow } from "./payments";

/**
 * Online checkout for an issued invoice (Razorpay or Stripe). Available only when the commercial.online_payments
 * flag is on and the gateway keys are configured; otherwise invoices are paid offline. Who may pay: members of
 * the invoice's organisation with the billing-manage permission, or the individual buyer.
 *
 * External calls never run inside a database transaction: a pending payment row is created first (its id goes
 * into the gateway metadata / idempotency key), then the gateway is called, then the row is updated.
 */

export type RazorpayCheckoutPayload = {
  provider: "razorpay";
  paymentId: string;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string | null; contact: string | null };
  notes: Record<string, string>;
};
export type StripeCheckoutRedirect = { provider: "stripe"; paymentId: string; url: string };
export type CheckoutStart = RazorpayCheckoutPayload | StripeCheckoutRedirect;

async function canPay(user: SessionUser, invoice: Pick<InvoiceRow, "organizationId" | "buyerUserId">, tx: DbOrTx = db): Promise<boolean> {
  if (invoice.buyerUserId && invoice.buyerUserId === user.id) return true;
  return invoice.organizationId ? userCanManageOrgBilling(user.id, invoice.organizationId, tx) : false;
}

async function canSee(user: SessionUser, invoice: Pick<InvoiceRow, "organizationId" | "buyerUserId">, tx: DbOrTx = db): Promise<boolean> {
  if (invoice.buyerUserId && invoice.buyerUserId === user.id) return true;
  return invoice.organizationId ? userCanViewOrgBilling(user.id, invoice.organizationId, tx) : false;
}

/** Gateways need the last digit of three-decimal currencies (KWD, BHD, OMR…) to be 0. */
export function gatewayAmountProblem(amountMinor: number, minorUnits: number): string | null {
  if (amountMinor <= 0) return "Nothing is due on this invoice.";
  if (minorUnits === 3 && amountMinor % 10 !== 0) return "This amount cannot be paid online (card networks need the last decimal to be 0). Please pay by bank transfer.";
  return null;
}

/** Start an online payment for the outstanding amount of an invoice. */
export async function startInvoiceCheckout(user: SessionUser, input: { invoiceId: string; provider: "razorpay" | "stripe" }): Promise<CheckoutStart> {
  const limit = await rateLimit(`checkout:${user.id}`, 10, 600);
  if (!limit.allowed) throw new ActionError("Too many payment attempts. Please wait a few minutes and try again.", { code: "rate_limited" });

  // Feature flags are read before the transaction (no second pool connection while it holds one).
  const [head] = await db.select({ organizationId: invoices.organizationId }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!head) throw notFound("Invoice");
  const options = await getOnlinePaymentOptions(head.organizationId);
  if (!options[input.provider]) throw invalidState("Online payment is not available for this invoice. Please pay by bank transfer or UPI using the details on the invoice.");

  const prepared = await db.transaction(async (tx) => {
    const invoice = await lockInvoice(tx, input.invoiceId);
    if (!(await canPay(user, invoice, tx))) throw notFound("Invoice");
    if (invoice.documentType !== "invoice" || !PAYABLE_STATUSES.includes(invoice.status)) throw invalidState("This invoice is not open for payment.");
    const amount = outstandingMinor(invoice);
    const [cur] = await tx.select({ minorUnits: currencies.minorUnits }).from(currencies).where(eq(currencies.code, invoice.currency)).limit(1);
    const problem = gatewayAmountProblem(amount, minorUnitsFor(invoice.currency, cur?.minorUnits));
    if (problem) throw invalidState(problem);
    const pending = await createPendingGatewayPaymentTx(tx, {
      provider: input.provider,
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      payerUserId: user.id,
      currency: invoice.currency,
      amountMinor: amount,
      providerOrderId: `pending:${invoice.id}:${Date.now()}`,
    });
    return { invoice, pending, amount };
  });

  const { invoice, pending, amount } = prepared;
  const description = `Invoice ${invoice.code ?? invoice.id}`;
  try {
    if (input.provider === "razorpay") {
      const creds = razorpayCredentials();
      if (!creds) throw invalidState("Online payment is not available.");
      const notes = { invoiceId: invoice.id, paymentId: pending.id, invoiceCode: invoice.code ?? "" };
      const order = await createRazorpayOrder({ amountMinor: amount, currency: invoice.currency, receipt: pending.code, notes });
      await db.update(payments).set({ providerOrderId: order.id }).where(eq(payments.id, pending.id));
      return {
        provider: "razorpay",
        paymentId: pending.id,
        keyId: creds.keyId,
        orderId: order.id,
        amount,
        currency: invoice.currency,
        name: BRAND.name,
        description,
        prefill: { name: invoice.buyerSnapshot?.legalName ?? user.displayName, email: invoice.buyerSnapshot?.email ?? user.email, contact: invoice.buyerSnapshot?.phone ?? user.phone },
        notes,
      };
    }
    const session = await createStripeCheckoutSession({
      paymentId: pending.id,
      invoiceId: invoice.id,
      description,
      amountMinor: amount,
      currency: invoice.currency,
      customerEmail: invoice.buyerSnapshot?.email ?? user.email,
      // {CHECKOUT_SESSION_ID} is replaced by Stripe; it must stay unencoded.
      successUrl: `${absoluteUrl(BILLING_PATHS.checkoutSuccess)}?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${absoluteUrl(BILLING_PATHS.checkoutCancel)}?invoice=${invoice.id}`,
    });
    if (!session.url) throw new GatewayError("Stripe did not return a checkout page.", "stripe");
    await db.update(payments).set({ providerOrderId: session.id, metadata: { checkoutSessionId: session.id } }).where(eq(payments.id, pending.id));
    return { provider: "stripe", paymentId: pending.id, url: session.url };
  } catch (error) {
    await db.update(payments).set({ status: "failed", failureReason: "Checkout could not be started." }).where(and(eq(payments.id, pending.id), eq(payments.status, "pending")));
    if (error instanceof GatewayError) throw new ActionError(error.message, { code: "gateway_error" });
    throw error;
  } finally {
    await audit({ action: "commercial.checkout_started", entityType: "invoice", entityId: invoice.id, organizationId: invoice.organizationId, actorUserId: user.id, metadata: { provider: input.provider, paymentId: pending.id, amountMinor: amount, currency: invoice.currency } });
  }
}

async function paymentByOrder(provider: "razorpay" | "stripe", orderId: string): Promise<PaymentRow | null> {
  const [row] = await db.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerOrderId, orderId))).limit(1);
  return row ?? null;
}

/**
 * Verify the Razorpay Checkout handler response: signature HMAC-SHA256(order_id|payment_id, key_secret), then
 * confirm with the API (capturing an authorised payment) and record it. Idempotent with the webhook.
 */
export async function verifyRazorpayCheckout(user: SessionUser, input: { orderId: string; paymentId: string; signature: string }): Promise<GatewayOutcome> {
  const creds = razorpayCredentials();
  if (!creds) throw invalidState("Online payment is not available.");
  const payment = await paymentByOrder("razorpay", input.orderId);
  if (!payment || !payment.invoiceId) throw notFound("Payment");
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1);
  if (!invoice || !(await canPay(user, invoice))) throw notFound("Payment");
  if (!verifyRazorpayPaymentSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature, keySecret: creds.keySecret })) {
    await logSecurityEvent({ userId: user.id, type: "payment_signature_invalid", severity: "warning", metadata: { provider: "razorpay", paymentId: payment.id } });
    throw new ActionError("The payment could not be verified. If money was taken, it will be confirmed automatically or refunded by your bank.", { code: "signature_invalid" });
  }
  let remote = await fetchRazorpayPayment(input.paymentId);
  if (remote.order_id !== input.orderId) throw new ActionError("The payment does not belong to this order.", { code: "order_mismatch" });
  if (remote.status === "authorized") remote = await captureRazorpayPayment(remote.id, remote.amount, remote.currency);
  if (remote.status === "failed") {
    return db.transaction((tx) => recordGatewayFailureTx(tx, { provider: "razorpay", providerOrderId: input.orderId, providerPaymentId: remote.id, reason: remote.error_description ?? "Payment failed" }));
  }
  if (remote.status !== "captured" && remote.status !== "refunded") {
    logger.warn("Razorpay payment not captured yet", { paymentId: payment.id, status: remote.status });
    return { status: "not_found", paymentId: payment.id, invoiceId: payment.invoiceId };
  }
  return db.transaction((tx) =>
    recordGatewaySuccessTx(tx, {
      provider: "razorpay",
      providerOrderId: input.orderId,
      providerPaymentId: remote.id,
      amountMinor: remote.amount,
      currency: remote.currency,
      method: razorpayMethod(remote.method),
      providerFeeMinor: remote.fee ?? null,
      metadata: { razorpayStatus: remote.status },
    }),
  );
}

export type CheckoutStatus = {
  status: "succeeded" | "pending" | "failed" | "unknown";
  invoiceId: string | null;
  invoiceCode: string | null;
  amountMinor: number | null;
  currency: string | null;
  failureReason: string | null;
};

const UNKNOWN: CheckoutStatus = { status: "unknown", invoiceId: null, invoiceCode: null, amountMinor: null, currency: null, failureReason: null };

/**
 * Status for the checkout result page. For Stripe, a still-pending payment is confirmed with the API (in case the
 * webhook is delayed) and recorded when paid. Only the payer / billing members of the organisation see details.
 */
export async function getCheckoutStatus(user: SessionUser, input: { provider: "razorpay" | "stripe"; reference: string }): Promise<CheckoutStatus> {
  let payment = await paymentByOrder(input.provider, input.reference);
  if (!payment) return UNKNOWN;
  const [invoice] = payment.invoiceId ? await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1) : [];
  const allowed = payment.payerUserId === user.id || (invoice ? await canSee(user, invoice) : false);
  if (!allowed) return UNKNOWN;
  if (payment.status === "pending" && input.provider === "stripe") {
    try {
      const session = await retrieveStripeCheckoutSession(input.reference);
      if (session.payment_status === "paid" && session.payment_intent) {
        await db.transaction((tx) =>
          recordGatewaySuccessTx(tx, {
            provider: "stripe",
            providerOrderId: session.id,
            providerPaymentId: session.payment_intent!,
            amountMinor: session.amount_total ?? payment!.amountMinor,
            currency: session.currency ?? payment!.currency,
            method: "card",
            metadata: { confirmedBy: "return_page" },
          }),
        );
        [payment] = await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
      }
    } catch (error) {
      logger.warn("Stripe session lookup failed on the return page", { error });
    }
  }
  const status = payment!.status === "succeeded" || payment!.status === "partially_refunded" || payment!.status === "refunded" ? "succeeded" : payment!.status === "failed" ? "failed" : "pending";
  return { status, invoiceId: payment!.invoiceId ?? invoice?.id ?? null, invoiceCode: invoice?.code ?? null, amountMinor: payment!.amountMinor, currency: payment!.currency, failureReason: payment!.failureReason };
}
