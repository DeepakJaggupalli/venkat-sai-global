import "server-only";

import { integrations } from "@/lib/env";
import { getOnlinePaymentOptions } from "@/modules/commercial/config";
import { isFeatureEnabled } from "@/modules/settings";

/**
 * Payment hook for the resume service.
 *
 * Today every request is paid OFFLINE: the request is created as "awaiting payment", the team contacts the candidate
 * on WhatsApp/phone to collect the fee (UPI, bank transfer or cash at the centre), and staff mark it paid or waive it
 * in the Command Centre (`markResumeRequestPaid` in ./service). Online checkout is OFF.
 *
 * Switching on Razorpay later (no schema change needed — `resume_requests.gatewayOrderId`, `paymentMethod`
 * "razorpay" and `paymentReference` exist):
 *   1. Configure RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET and turn on the `commercial.online_payments` flag.
 *   2. Turn on the `services.resume_online_payments` flag (default off).
 *   3. On the confirmation page, when `getResumePaymentMode()` returns "razorpay", create an order with
 *      `createRazorpayOrder({ amountMinor, currency, receipt: request.code, notes: { resumeRequestId } })` from
 *      `@/modules/commercial/gateways/razorpay`, store the order id in `gatewayOrderId`, and open Razorpay Checkout.
 *   4. Verify the checkout signature (`@/modules/commercial/gateways/signatures`) server-side (and the payment.captured
 *      webhook for robustness), then call `markResumeRequestPaid(null, { id, method: "razorpay", reference: paymentId })`.
 * Only requests with a fixed price (`hasFixedPrice`) can be paid online; "price on request" stays offline.
 */

export type ResumePaymentMode = "offline" | "razorpay";

export async function getResumePaymentMode(): Promise<ResumePaymentMode> {
  const [resumeOnline, options] = await Promise.all([isFeatureEnabled("services.resume_online_payments"), getOnlinePaymentOptions()]);
  return resumeOnline && options.razorpay && integrations.razorpay() ? "razorpay" : "offline";
}
