import { ActionError } from "@/lib/actions";
import { absoluteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { unsubscribeWithToken } from "@/modules/notifications/service";

/**
 * POST /api/v1/notifications/unsubscribe?token=… — RFC 8058 one-click unsubscribe endpoint (the target of a
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header). Authenticated by the signed token itself
 * (no session, no CSRF check: the token is the proof), rate limited per IP. Visitors who click the link in
 * an email land on the confirmation page /notifications/unsubscribe instead (GET never changes anything).
 *   200 { ok: true, category } · 400 invalid / expired token · 429 rate limited
 * GET (mail clients without one-click support open the List-Unsubscribe URL in a browser) → 303 to that
 * confirmation page with the same token.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export function GET(request: Request): Response {
  const token = new URL(request.url).searchParams.get("token");
  const target = absoluteUrl(token ? `/notifications/unsubscribe?token=${encodeURIComponent(token)}` : "/notifications/unsubscribe");
  return new Response(null, { status: 303, headers: { Location: target, "Referrer-Policy": "no-referrer", ...NO_STORE } });
}

export async function POST(request: Request): Promise<Response> {
  const meta = await getRequestMeta().catch(() => null);
  const rl = await rateLimit(`unsubscribe:${meta?.ipHash ?? "unknown"}`, 30, 60 * 10);
  if (!rl.allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: NO_STORE });

  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  if (!token) {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      const value = form?.get("token");
      token = typeof value === "string" ? value : null;
    }
  }
  if (!token) return Response.json({ error: "Missing unsubscribe token." }, { status: 400, headers: NO_STORE });

  try {
    const result = await unsubscribeWithToken(token);
    return Response.json({ ok: true, category: result.category }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ActionError) return Response.json({ error: error.message }, { status: 400, headers: NO_STORE });
    logger.error("One-click unsubscribe failed", { error });
    return Response.json({ error: "Could not unsubscribe. Please try again." }, { status: 500, headers: NO_STORE });
  }
}
