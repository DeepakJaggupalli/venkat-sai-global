import { hashIp } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { NO_STORE_HEADERS, readBodyWithLimit } from "@/modules/analytics/http";
import { pushUnsubscribeSchema } from "@/modules/push/schemas";
import { removePushSubscription } from "@/modules/push/service";

/**
 * POST /api/v1/push/unsubscribe — body { endpoint }. Removes the subscription (the endpoint itself is the proof
 * of ownership: an unguessable URL only the browser holds).
 *   204 removed (or already gone) · 400 invalid · 403 cross-site · 413 too large · 429 rate limited
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
  const parsed = pushUnsubscribeSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });

  try {
    const rl = await rateLimit(`push-unsubscribe:${hashIp(clientIp(request)) ?? "unknown"}`, 30, 60 * 60);
    if (!rl.allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: NO_STORE_HEADERS });
    await removePushSubscription(parsed.data.endpoint);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error("Removing a push subscription failed", { error });
    return Response.json({ error: "Could not turn off alerts. Try again." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
