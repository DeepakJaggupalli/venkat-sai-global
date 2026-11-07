import { hashIp } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { classifyUserAgent } from "@/lib/request";
import { ingestCollectBatch } from "@/modules/analytics/collect";
import { getConsentVersion, isExcludedFromTracking } from "@/modules/analytics/config";
import { consentFromRequest, isSameSiteBeacon, NO_STORE_HEADERS, noContent, readBodyWithLimit } from "@/modules/analytics/http";
import { COLLECT_LIMITS, collectPayloadSchema } from "@/modules/analytics/schemas";
import { getCurrentUser } from "@/modules/identity/session";
import { isFeatureEnabled } from "@/modules/settings";

/**
 * POST /api/v1/collect — first-party analytics collector (called by the consent-aware tracker with
 * navigator.sendBeacon / fetch keepalive).
 *
 * Body (JSON, ≤ 64 KB): { v: 1, sid, vid?, sentAt, start?, events[≤50], heatmap[≤50], scroll[≤20] } —
 * see collectPayloadSchema in src/modules/analytics/schemas.ts.
 *
 *   204 stored, or silently dropped (bot, no analytics consent, analytics switched off, staff or minor)
 *   400 invalid body · 403 cross-site request · 413 body too large · 429 rate limited
 *
 * Privacy: requires the visitor's analytics consent cookie (checked here, not just in the browser);
 * honours Sec-GPC; stores no IP address (the rate-limit key is a salted hash) and no user-agent string
 * (device / browser / OS family only); country comes from the edge geo header only.
 */
export const dynamic = "force-dynamic";

const RATE_LIMIT = { requests: 120, windowSeconds: 60 };

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameSiteBeacon(request)) {
    return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const userAgent = request.headers.get("user-agent");
  if (!userAgent || classifyUserAgent(userAgent).deviceType === "bot") return noContent();

  const body = await readBodyWithLimit(request, COLLECT_LIMITS.maxBodyBytes);
  if (!body.ok) {
    return Response.json({ error: body.status === 413 ? "Payload too large." : "Invalid request." }, { status: body.status, headers: NO_STORE_HEADERS });
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const parsed = collectPayloadSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });

  try {
    const ipHash = hashIp(clientIp(request));
    const rl = await rateLimit(`collect:${ipHash ?? "unknown"}`, RATE_LIMIT.requests, RATE_LIMIT.windowSeconds);
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return Response.json({ error: "Too many requests." }, { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfter) } });
    }

    if (!(await isFeatureEnabled("analytics.first_party"))) return noContent();

    const { effective } = consentFromRequest(request, await getConsentVersion());
    if (!effective.analytics) return noContent();

    const user = await getCurrentUser();
    if (await isExcludedFromTracking(user)) return noContent();

    await ingestCollectBatch(parsed.data, {
      userAgent,
      countryHeader: request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry"),
      consent: effective,
      userId: user?.id ?? null,
      heatmapsEnabled: await isFeatureEnabled("analytics.heatmaps"),
    });
    return noContent();
  } catch (error) {
    logger.error("Analytics collection failed", { error });
    return Response.json({ error: "Could not record analytics." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
