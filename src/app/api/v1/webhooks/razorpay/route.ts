import { logger } from "@/lib/logger";
import { handleRazorpayWebhook } from "@/modules/commercial/webhooks";

/**
 * POST /api/v1/webhooks/razorpay — Razorpay webhook endpoint (configure in the Razorpay dashboard with the secret
 * in RAZORPAY_WEBHOOK_SECRET; events: payment.captured, order.paid, payment.failed, refund.processed, refund.failed).
 * Authenticated by the X-Razorpay-Signature HMAC over the raw body (no CSRF / session). Idempotent per event id.
 * Responses: 200 processed / duplicate / ignored · 400 invalid signature or JSON · 413 too large ·
 * 503 not configured · 500 processing failed (Razorpay retries).
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
    logger.warn("Razorpay webhook body could not be read", { error });
    return Response.json({ error: "Invalid body." }, { status: 400, headers });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return Response.json({ error: "Payload too large." }, { status: 413, headers });
  const result = await handleRazorpayWebhook(raw, request.headers);
  return Response.json(result.body, { status: result.status, headers });
}
