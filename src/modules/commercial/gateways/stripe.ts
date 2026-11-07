import "server-only";

import { logger } from "@/lib/logger";

import { stripeSecretKey } from "../config";
import { GatewayError } from "../errors";

import { encodeForm, type FormValue } from "./form";

/**
 * Minimal Stripe REST client (https://docs.stripe.com/api) — bearer secret key, form-encoded bodies, amounts in
 * the currency's smallest unit (zero-decimal currencies such as JPY in whole units). POSTs send an
 * Idempotency-Key so a retried request never creates a second session or refund.
 */
const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 15_000;

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
};

export type StripeRefund = { id: string; status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled"; amount: number; currency: string; payment_intent: string | null; failure_reason?: string | null };

async function call<T>(method: "GET" | "POST", path: string, params?: Record<string, FormValue>, idempotencyKey?: string): Promise<T> {
  const secret = stripeSecretKey();
  if (!secret) throw new GatewayError("Online payments by Stripe are not configured.", "stripe");
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}`, Accept: "application/json" };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: method === "POST" && params ? encodeForm(params) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    logger.error("Stripe request failed", { path, error });
    throw new GatewayError("The payment provider could not be reached. Please try again.", "stripe");
  }
  const json = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    logger.error("Stripe API error", { path, status: response.status, code: err?.code, message: err?.message });
    throw new GatewayError(err?.message ? `Stripe: ${err.message}` : "The payment provider rejected the request.", "stripe", response.status, err?.code ?? null);
  }
  return json as T;
}

export function createStripeCheckoutSession(input: {
  paymentId: string;
  invoiceId: string;
  description: string;
  amountMinor: number;
  currency: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  const metadata = { invoiceId: input.invoiceId, paymentId: input.paymentId };
  return call<StripeCheckoutSession>(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.invoiceId,
      customer_email: input.customerEmail ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: input.currency.toLowerCase(), unit_amount: input.amountMinor, product_data: { name: input.description.slice(0, 250) } } }],
      metadata,
      payment_intent_data: { metadata, description: input.description.slice(0, 250) },
    },
    `checkout-${input.paymentId}`,
  );
}

export function retrieveStripeCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
  return call<StripeCheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

export function createStripeRefund(input: { paymentIntentId: string; amountMinor: number; refundId: string }): Promise<StripeRefund> {
  return call<StripeRefund>(
    "POST",
    "/refunds",
    { payment_intent: input.paymentIntentId, amount: input.amountMinor, metadata: { refundId: input.refundId } },
    `refund-${input.refundId}`,
  );
}
