import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payment gateway signature checks (pure apart from node:crypto). All comparisons are constant-time.
 *
 *  - Razorpay checkout: signature = hex HMAC-SHA256("<order_id>|<payment_id>", key_secret)
 *  - Razorpay webhook:  X-Razorpay-Signature = hex HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)
 *  - Stripe webhook:    Stripe-Signature: t=<unix>,v1=<hex>[,v1=…]; v1 = hex HMAC-SHA256("<t>.<raw body>",
 *    STRIPE_WEBHOOK_SECRET); the timestamp must be within the tolerance (default 5 minutes).
 */

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two hex digests (false for malformed input or different lengths). */
export function hexDigestsEqual(expectedHex: string, providedHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length !== expectedHex.length || providedHex.length % 2 !== 0) return false;
  const a = Buffer.from(expectedHex.toLowerCase(), "hex");
  const b = Buffer.from(providedHex.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyRazorpayPaymentSignature(input: { orderId: string; paymentId: string; signature: string; keySecret: string }): boolean {
  if (!input.orderId || !input.paymentId || !input.signature || !input.keySecret) return false;
  const expected = hmacSha256Hex(input.keySecret, `${input.orderId}|${input.paymentId}`);
  return hexDigestsEqual(expected, input.signature.trim());
}

export function verifyRazorpayWebhookSignature(input: { rawBody: string; signature: string | null; secret: string }): boolean {
  if (!input.signature || !input.secret) return false;
  const expected = hmacSha256Hex(input.secret, input.rawBody);
  return hexDigestsEqual(expected, input.signature.trim());
}

export type StripeSignatureHeader = { timestamp: number | null; signatures: string[] };

export function parseStripeSignatureHeader(header: string | null): StripeSignatureHeader {
  const result: StripeSignatureHeader = { timestamp: null, signatures: [] };
  if (!header) return result;
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) result.timestamp = Number(value);
    else if (key === "v1" && value) result.signatures.push(value);
  }
  return result;
}

export type StripeVerification =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_secret" | "missing_header" | "malformed_header" | "timestamp_out_of_tolerance" | "signature_mismatch" };

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  header: string | null;
  secret: string;
  toleranceSeconds?: number;
  /** Current time in ms (tests). */
  now?: number;
}): StripeVerification {
  if (!input.secret) return { ok: false, reason: "missing_secret" };
  if (!input.header) return { ok: false, reason: "missing_header" };
  const parsed = parseStripeSignatureHeader(input.header);
  if (parsed.timestamp === null || parsed.signatures.length === 0) return { ok: false, reason: "malformed_header" };
  const tolerance = input.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };
  const expected = hmacSha256Hex(input.secret, `${parsed.timestamp}.${input.rawBody}`);
  // Check every v1 signature (Stripe sends several while a secret is being rolled) without short-circuiting.
  let matched = false;
  for (const signature of parsed.signatures) {
    if (hexDigestsEqual(expected, signature)) matched = true;
  }
  return matched ? { ok: true, timestamp: parsed.timestamp } : { ok: false, reason: "signature_mismatch" };
}
