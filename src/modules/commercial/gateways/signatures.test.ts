import { describe, expect, it } from "vitest";

import {
  hexDigestsEqual,
  hmacSha256Hex,
  parseStripeSignatureHeader,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  verifyStripeWebhookSignature,
} from "./signatures";

// Vectors computed independently with node:crypto (E:\VenkatSaiGlobal-work\vectors.mjs) and the RFC 4231 sample.
const RZP_SECRET = "test_key_secret_abc123";
const RZP_ORDER = "order_9A33XWu170gUtm";
const RZP_PAYMENT = "pay_29QQoUBi66xm2f";
const RZP_CHECKOUT_SIGNATURE = "f1964ce9e7b463d406f61c57a29fbf8d32f7f3bfea22fa917c5910396d3c00ff";

const RZP_WEBHOOK_SECRET = "whsec_rzp_test";
const RZP_BODY =
  '{"entity":"event","account_id":"acc_test","event":"payment.captured","contains":["payment"],"payload":{"payment":{"entity":{"id":"pay_29QQoUBi66xm2f","order_id":"order_9A33XWu170gUtm","amount":118000,"currency":"INR","status":"captured"}}},"created_at":1762500000}';
const RZP_WEBHOOK_SIGNATURE = "82266d1bf81a1a19a83f7dbe21daba6321ad2cdd282fab3586405e89b4bbde0d";

const STRIPE_SECRET = "whsec_stripe_test";
const STRIPE_BODY = '{"id":"evt_test_1","type":"checkout.session.completed","data":{"object":{"id":"cs_test_1","payment_status":"paid"}}}';
const STRIPE_T = 1_762_500_000;
const STRIPE_V1 = "e228a0a57d73ee58461e6c42b77177a25200ef1c8dc8bf050b671e5e66c2ea0d";

describe("HMAC helpers", () => {
  it("matches RFC 4231 test case 2", () => {
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  it("compares digests in constant time and rejects malformed input", () => {
    expect(hexDigestsEqual("abcd", "ABCD")).toBe(true);
    expect(hexDigestsEqual("abcd", "abce")).toBe(false);
    expect(hexDigestsEqual("abcd", "abc")).toBe(false);
    expect(hexDigestsEqual("abcd", "zzzz")).toBe(false);
    expect(hexDigestsEqual("abcd", "")).toBe(false);
  });
});

describe("Razorpay", () => {
  it("verifies the checkout signature over order_id|payment_id", () => {
    expect(verifyRazorpayPaymentSignature({ orderId: RZP_ORDER, paymentId: RZP_PAYMENT, signature: RZP_CHECKOUT_SIGNATURE, keySecret: RZP_SECRET })).toBe(true);
    expect(verifyRazorpayPaymentSignature({ orderId: RZP_ORDER, paymentId: "pay_other", signature: RZP_CHECKOUT_SIGNATURE, keySecret: RZP_SECRET })).toBe(false);
    expect(verifyRazorpayPaymentSignature({ orderId: RZP_ORDER, paymentId: RZP_PAYMENT, signature: RZP_CHECKOUT_SIGNATURE, keySecret: "wrong" })).toBe(false);
    expect(verifyRazorpayPaymentSignature({ orderId: RZP_ORDER, paymentId: RZP_PAYMENT, signature: "", keySecret: RZP_SECRET })).toBe(false);
  });

  it("verifies the webhook signature over the exact raw body", () => {
    expect(verifyRazorpayWebhookSignature({ rawBody: RZP_BODY, signature: RZP_WEBHOOK_SIGNATURE, secret: RZP_WEBHOOK_SECRET })).toBe(true);
    // Re-serialising the JSON (different whitespace) must fail: the raw body is what was signed.
    const reserialised = JSON.stringify(JSON.parse(RZP_BODY), null, 1);
    expect(verifyRazorpayWebhookSignature({ rawBody: reserialised, signature: RZP_WEBHOOK_SIGNATURE, secret: RZP_WEBHOOK_SECRET })).toBe(false);
    expect(verifyRazorpayWebhookSignature({ rawBody: RZP_BODY, signature: null, secret: RZP_WEBHOOK_SECRET })).toBe(false);
    expect(verifyRazorpayWebhookSignature({ rawBody: RZP_BODY, signature: RZP_WEBHOOK_SIGNATURE, secret: "" })).toBe(false);
  });
});

describe("Stripe", () => {
  const header = `t=${STRIPE_T},v1=${STRIPE_V1},v0=ignored`;

  it("parses the Stripe-Signature header", () => {
    expect(parseStripeSignatureHeader(header)).toEqual({ timestamp: STRIPE_T, signatures: [STRIPE_V1] });
    expect(parseStripeSignatureHeader("garbage")).toEqual({ timestamp: null, signatures: [] });
  });

  it("accepts a valid signature within the 5 minute tolerance", () => {
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header, secret: STRIPE_SECRET, now: (STRIPE_T + 299) * 1000 })).toEqual({ ok: true, timestamp: STRIPE_T });
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header, secret: STRIPE_SECRET, now: (STRIPE_T - 120) * 1000 }).ok).toBe(true);
  });

  it("accepts any of several v1 signatures (secret rotation)", () => {
    const rotated = `t=${STRIPE_T},v1=${"0".repeat(64)},v1=${STRIPE_V1}`;
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header: rotated, secret: STRIPE_SECRET, now: STRIPE_T * 1000 }).ok).toBe(true);
  });

  it("rejects stale timestamps, tampered bodies, wrong secrets and malformed headers", () => {
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header, secret: STRIPE_SECRET, now: (STRIPE_T + 301) * 1000 })).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    expect(verifyStripeWebhookSignature({ rawBody: `${STRIPE_BODY} `, header, secret: STRIPE_SECRET, now: STRIPE_T * 1000 })).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header, secret: "whsec_other", now: STRIPE_T * 1000 })).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header: `v1=${STRIPE_V1}`, secret: STRIPE_SECRET, now: STRIPE_T * 1000 })).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header: null, secret: STRIPE_SECRET })).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeWebhookSignature({ rawBody: STRIPE_BODY, header, secret: "" })).toEqual({ ok: false, reason: "missing_secret" });
  });
});
