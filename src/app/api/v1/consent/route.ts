import { hashIp } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { recordConsentReceipt } from "@/modules/analytics/consent-service";
import { NO_STORE_HEADERS, readBodyWithLimit } from "@/modules/analytics/http";
import { consentReceiptSchema } from "@/modules/analytics/schemas";
import { getCurrentUser } from "@/modules/identity/session";

/**
 * POST /api/v1/consent — server-side receipt of a cookie-consent choice (the browser has already stored
 * the choice in the vsg_consent cookie; this records proof of it).
 *
 * Body (JSON): { version, categories: { functional, analytics, session_insights }, anonymousId,
 *                method: accept_all | reject_all | custom | withdrawn | browser_signal,
 *                source?: cookie_banner | cookie_preferences | account_privacy, locale?, gpc? }
 *
 *   204 recorded · 400 invalid body · 403 cross-site request (CSRF) · 413 too large · 429 rate limited
 *
 * Signed-in users' choices are also written to their consent ledger (consent_records). No IP address or
 * user agent is stored with the receipt.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403, headers: NO_STORE_HEADERS });

  const body = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!body.ok) return Response.json({ error: "Invalid request." }, { status: body.status, headers: NO_STORE_HEADERS });
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const parsed = consentReceiptSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });

  try {
    const rl = await rateLimit(`consent:${hashIp(clientIp(request)) ?? "unknown"}`, 30, 10 * 60);
    if (!rl.allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: NO_STORE_HEADERS });

    const user = await getCurrentUser();
    await recordConsentReceipt(parsed.data, { userId: user?.id ?? null });
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error("Recording a consent receipt failed", { error });
    return Response.json({ error: "Could not record your choice. It is still saved in this browser." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
