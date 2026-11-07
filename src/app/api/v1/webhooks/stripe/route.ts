import { logger } from "@/lib/logger";
import { handleStripeWebhook } from "@/modules/commercial/webhooks";

/**
 * POST /api/v1/webhooks/stripe — Stripe webhook endpoint (configure in the Stripe dashboard with the signing secret
 * in STRIPE_WEBHOOK_SECRET; events: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, payment_intent.payment_failed, refund.created, refund.updated).
 * Authenticated by the Stripe-Signature header (HMAC-SHA256 of "t.payload", 5-minute tolerance, constant-time
 * comparison) — no CSRF / session. Idempotent per event id.
 * Responses: 200 processed / duplicate / ignored · 400 invalid signature or JSON · 413 too large ·
 * 503 not configured · 500 processing failed (Stripe retries).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "Payload too large." }, { status: 413, headers });
  let raw: string;
  try {
    raw = await request.text();
  } catch (error) {
    logger.warn("Stripe webhook body could not be read", { error });
    return Response.json({ error: "Invalid body." }, { status: 400, headers });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return Response.json({ error: "Payload too large." }, { status: 413, headers });
  const result = await handleStripeWebhook(raw, request.headers);
  return Response.json(result.body, { status: result.status, headers });
}
