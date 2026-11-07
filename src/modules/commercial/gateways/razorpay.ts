import "server-only";

import { logger } from "@/lib/logger";

import { razorpayCredentials } from "../config";
import { GatewayError } from "../errors";

/**
 * Minimal Razorpay REST client (https://razorpay.com/docs/api/) — Basic auth with key_id:key_secret, JSON bodies,
 * amounts in the currency's smallest unit. Only the calls the platform needs: orders, payments (fetch / capture)
 * and refunds. Secrets never leave the server; errors are logged without credentials.
 */
const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt?: string | null };
export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string | null;
  fee?: number | null;
  error_description?: string | null;
  notes?: Record<string, string>;
};
export type RazorpayRefund = { id: string; payment_id: string; amount: number; currency: string; status: "pending" | "processed" | "failed" };

async function call<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const creds = razorpayCredentials();
  if (!creds) throw new GatewayError("Online payments by Razorpay are not configured.", "razorpay");
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    logger.error("Razorpay request failed", { path, error });
    throw new GatewayError("The payment provider could not be reached. Please try again.", "razorpay");
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const err = (json as { error?: { code?: string; description?: string } } | null)?.error;
    logger.error("Razorpay API error", { path, status: response.status, code: err?.code, description: err?.description });
    throw new GatewayError(err?.description ? `Razorpay: ${err.description}` : "The payment provider rejected the request.", "razorpay", response.status, err?.code ?? null);
  }
  return json as T;
}

export function createRazorpayOrder(input: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("POST", "/orders", {
    amount: input.amountMinor,
    currency: input.currency.toUpperCase(),
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

export function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export function captureRazorpayPayment(paymentId: string, amountMinor: number, currency: string): Promise<RazorpayPayment> {
  return call<RazorpayPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountMinor, currency: currency.toUpperCase() });
}

export function createRazorpayRefund(paymentId: string, input: { amountMinor: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayRefund> {
  return call<RazorpayRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: input.amountMinor,
    speed: "normal",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

/** Razorpay payment method → our payment method. */
export function razorpayMethod(method: string | null | undefined): "card" | "upi" | "netbanking" | "wallet" | "other" {
  switch (method) {
    case "card":
    case "upi":
    case "netbanking":
    case "wallet":
      return method;
    default:
      return "other";
  }
}
