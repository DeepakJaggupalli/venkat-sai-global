import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { paymentWebhookEvents, payments } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { razorpayMethod } from "./gateways/razorpay";
import { verifyRazorpayWebhookSignature, verifyStripeWebhookSignature } from "./gateways/signatures";
import { recordGatewayFailureTx, recordGatewaySuccessTx, type GatewayOutcome } from "./payments";
import { completeRefundTx, failRefundTx, refundByProviderId } from "./refunds";

/**
 * Payment gateway webhooks (POST /api/v1/webhooks/razorpay and /stripe).
 *  1. The signature is verified over the RAW body (Razorpay: X-Razorpay-Signature; Stripe: Stripe-Signature with a
 *     5-minute timestamp tolerance). Unsigned or forged requests are rejected and never stored.
 *  2. The event is stored once in payment_webhook_events (unique per provider + event id). A redelivered event that
 *     was already processed returns 200 without side effects; a previously failed one is processed again.
 *  3. Processing runs in one transaction; on error the event is marked failed and 500 is returned, so the gateway
 *     retries later.
 */

export type WebhookResult = { status: number; body: Record<string, unknown> };

type Handled = { outcome: "processed" | "ignored"; paymentId?: string | null };

const RAZORPAY_EVENTS = new Set(["payment.captured", "order.paid", "payment.failed", "refund.processed", "refund.failed"]);
const STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.payment_failed",
  "refund.updated",
  "refund.created",
]);

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Store the event (idempotent) and decide whether it still needs processing. */
async function claimEvent(provider: "razorpay" | "stripe", eventId: string, type: string, payload: Record<string, unknown>): Promise<{ id: string; process: boolean }> {
  const inserted = await db.insert(paymentWebhookEvents).values({ provider, eventId, type, payload }).onConflictDoNothing().returning({ id: paymentWebhookEvents.id });
  if (inserted[0]) return { id: inserted[0].id, process: true };
  const [existing] = await db
    .select({ id: paymentWebhookEvents.id, status: paymentWebhookEvents.status })
    .from(paymentWebhookEvents)
    .where(and(eq(paymentWebhookEvents.provider, provider), eq(paymentWebhookEvents.eventId, eventId)))
    .limit(1);
  if (!existing) throw new Error("Webhook event vanished after a conflict");
  return { id: existing.id, process: existing.status === "received" || existing.status === "failed" };
}

async function runEvent(eventRowId: string, handler: (tx: DbOrTx) => Promise<Handled>): Promise<WebhookResult> {
  try {
    const handled = await db.transaction(async (tx) => {
      // Serialise concurrent deliveries of the same event.
      const [locked] = await tx.select({ status: paymentWebhookEvents.status }).from(paymentWebhookEvents).where(eq(paymentWebhookEvents.id, eventRowId)).limit(1).for("update");
      if (locked && (locked.status === "processed" || locked.status === "ignored")) return { outcome: locked.status, paymentId: null } as Handled;
      const result = await handler(tx);
      await tx
        .update(paymentWebhookEvents)
        .set({ status: result.outcome, processedAt: new Date(), error: null, attempts: sql`${paymentWebhookEvents.attempts} + 1`, paymentId: result.paymentId ?? null })
        .where(eq(paymentWebhookEvents.id, eventRowId));
      return result;
    });
    return { status: 200, body: { received: true, outcome: handled.outcome } };
  } catch (error) {
    logger.error("Webhook processing failed", { error, eventRowId });
    await db
      .update(paymentWebhookEvents)
      .set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Processing failed", attempts: sql`${paymentWebhookEvents.attempts} + 1` })
      .where(eq(paymentWebhookEvents.id, eventRowId));
    return { status: 500, body: { received: true, error: "Processing failed" } };
  }
}

function outcomeOf(result: GatewayOutcome): Handled {
  return { outcome: result.status === "not_found" ? "ignored" : "processed", paymentId: result.paymentId };
}

// ---------------------------------------------------------------------------
// Razorpay
// ---------------------------------------------------------------------------

export async function handleRazorpayWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: "Razorpay webhooks are not configured." } };
  if (!verifyRazorpayWebhookSignature({ rawBody, signature: headers.get("x-razorpay-signature"), secret })) {
    logger.warn("Rejected Razorpay webhook with an invalid signature");
    return { status: 400, body: { error: "Invalid signature." } };
  }
  let event: Record<string, unknown>;
  try {
    event = obj(JSON.parse(rawBody));
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }
  const type = str(event.event) ?? "unknown";
  const eventId = str(headers.get("x-razorpay-event-id")) ?? `sha256:${sha256Hex(rawBody)}`;
  const claim = await claimEvent("razorpay", eventId, type, event);
  if (!claim.process) return { status: 200, body: { received: true, duplicate: true } };
  if (!RAZORPAY_EVENTS.has(type)) return runEvent(claim.id, async () => ({ outcome: "ignored" }));

  const payload = obj(event.payload);
  const payment = obj(obj(payload.payment).entity);
  const refund = obj(obj(payload.refund).entity);
  return runEvent(claim.id, async (tx) => {
    switch (type) {
      case "payment.captured":
      case "order.paid": {
        const orderId = str(payment.order_id) ?? str(obj(obj(payload.order).entity).id);
        const paymentId = str(payment.id);
        const amount = num(payment.amount);
        const currency = str(payment.currency);
        if (!orderId || !paymentId || amount === null || !currency) return { outcome: "ignored" };
        return outcomeOf(
          await recordGatewaySuccessTx(tx, {
            provider: "razorpay",
            providerOrderId: orderId,
            providerPaymentId: paymentId,
            amountMinor: amount,
            currency,
            method: razorpayMethod(str(payment.method)),
            providerFeeMinor: num(payment.fee),
            metadata: { webhookEvent: type },
            receivedAt: num(payment.created_at) ? new Date(num(payment.created_at)! * 1000) : undefined,
          }),
        );
      }
      case "payment.failed": {
        const orderId = str(payment.order_id);
        if (!orderId) return { outcome: "ignored" };
        return outcomeOf(await recordGatewayFailureTx(tx, { provider: "razorpay", providerOrderId: orderId, providerPaymentId: str(payment.id), reason: str(payment.error_description) ?? "The payment was declined." }));
      }
      case "refund.processed":
      case "refund.failed": {
        const refundId = str(refund.id);
        const row = refundId ? await refundByProviderId(refundId, tx) : null;
        if (!row) return { outcome: "ignored" };
        if (type === "refund.processed") await completeRefundTx(tx, row.id, { providerRefundId: refundId, processedAt: new Date(), actorUserId: null });
        else await failRefundTx(tx, row.id, "The payment provider reported the refund as failed.");
        return { outcome: "processed", paymentId: row.paymentId };
      }
      default:
        return { outcome: "ignored" };
    }
  });
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(rawBody: string, headers: Headers, now: number = Date.now()): Promise<WebhookResult> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: "Stripe webhooks are not configured." } };
  const verification = verifyStripeWebhookSignature({ rawBody, header: headers.get("stripe-signature"), secret, now });
  if (!verification.ok) {
    logger.warn("Rejected Stripe webhook", { reason: verification.reason });
    return { status: 400, body: { error: "Invalid signature." } };
  }
  let event: Record<string, unknown>;
  try {
    event = obj(JSON.parse(rawBody));
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }
  const type = str(event.type) ?? "unknown";
  const eventId = str(event.id) ?? `sha256:${sha256Hex(rawBody)}`;
  const claim = await claimEvent("stripe", eventId, type, event);
  if (!claim.process) return { status: 200, body: { received: true, duplicate: true } };
  if (!STRIPE_EVENTS.has(type)) return runEvent(claim.id, async () => ({ outcome: "ignored" }));

  const object = obj(obj(event.data).object);
  return runEvent(claim.id, async (tx) => {
    switch (type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const sessionId = str(object.id);
        if (!sessionId) return { outcome: "ignored" };
        // Delayed methods complete the session "unpaid" first; async_payment_succeeded follows.
        if (str(object.payment_status) !== "paid") return { outcome: "ignored" };
        const paymentIntent = str(object.payment_intent);
        const amount = num(object.amount_total);
        const currency = str(object.currency);
        if (!paymentIntent || amount === null || !currency) return { outcome: "ignored" };
        return outcomeOf(await recordGatewaySuccessTx(tx, { provider: "stripe", providerOrderId: sessionId, providerPaymentId: paymentIntent, amountMinor: amount, currency, method: "card", metadata: { webhookEvent: type } }));
      }
      case "checkout.session.async_payment_failed": {
        const sessionId = str(object.id);
        if (!sessionId) return { outcome: "ignored" };
        return outcomeOf(await recordGatewayFailureTx(tx, { provider: "stripe", providerOrderId: sessionId, providerPaymentId: str(object.payment_intent), reason: "The payment could not be completed." }));
      }
      case "payment_intent.payment_failed": {
        // Our payment id travels in the intent metadata (payment_intent_data.metadata at checkout).
        const ourPaymentId = str(obj(object.metadata).paymentId);
        if (!ourPaymentId || !/^[0-9a-f-]{36}$/i.test(ourPaymentId)) return { outcome: "ignored" };
        const [row] = await tx.select({ providerOrderId: payments.providerOrderId }).from(payments).where(and(eq(payments.id, ourPaymentId), eq(payments.provider, "stripe"))).limit(1);
        if (!row?.providerOrderId) return { outcome: "ignored" };
        const reason = str(obj(object.last_payment_error).message) ?? "The payment was declined.";
        return outcomeOf(await recordGatewayFailureTx(tx, { provider: "stripe", providerOrderId: row.providerOrderId, providerPaymentId: str(object.id), reason }));
      }
      case "refund.created":
      case "refund.updated": {
        const refundId = str(object.id);
        const row = refundId ? await refundByProviderId(refundId, tx) : null;
        if (!row) return { outcome: "ignored" };
        const status = str(object.status);
        if (status === "succeeded") await completeRefundTx(tx, row.id, { providerRefundId: refundId, processedAt: new Date(), actorUserId: null });
        else if (status === "failed" || status === "canceled") await failRefundTx(tx, row.id, str(object.failure_reason) ?? "The payment provider reported the refund as failed.");
        else return { outcome: "ignored", paymentId: row.paymentId };
        return { outcome: "processed", paymentId: row.paymentId };
      }
      default:
        return { outcome: "ignored" };
    }
  });
}
