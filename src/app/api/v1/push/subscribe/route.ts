import { hashIp } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { NO_STORE_HEADERS, readBodyWithLimit } from "@/modules/analytics/http";
import { getCurrentUser } from "@/modules/identity/session";
import { pushSubscribeSchema } from "@/modules/push/schemas";
import { pushPublicKey, savePushSubscription } from "@/modules/push/service";

/**
 * GET  /api/v1/push/subscribe — { publicKey } (VAPID application server key), or { publicKey: null } when phone
 *      alerts are not configured (the button then hides itself).
 * POST /api/v1/push/subscribe — body { subscription: PushSubscription.toJSON(), topics?, trades?, countryCodes?, locale? }
 *      204 saved · 400 invalid · 403 cross-site · 404 not configured · 413 too large · 429 rate limited
 * A signed-in visitor's subscription is linked to the account. No IP address or user agent is stored.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
}

export function GET(): Response {
  return Response.json({ publicKey: pushPublicKey() }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403, headers: NO_STORE_HEADERS });
  if (!pushPublicKey()) return Response.json({ error: "Phone alerts are not available." }, { status: 404, headers: NO_STORE_HEADERS });

  const body = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!body.ok) return Response.json({ error: "Invalid request." }, { status: body.status, headers: NO_STORE_HEADERS });
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const parsed = pushSubscribeSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid subscription." }, { status: 400, headers: NO_STORE_HEADERS });

  try {
    const rl = await rateLimit(`push-subscribe:${hashIp(clientIp(request)) ?? "unknown"}`, 20, 60 * 60);
    if (!rl.allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: NO_STORE_HEADERS });
    const user = await getCurrentUser();
    await savePushSubscription(parsed.data, user?.id ?? null);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error("Saving a push subscription failed", { error });
    return Response.json({ error: "Could not turn on alerts. Try again." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
