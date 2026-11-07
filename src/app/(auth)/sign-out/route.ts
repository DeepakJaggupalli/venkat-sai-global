import type { NextRequest } from "next/server";

import { isSameOrigin } from "@/lib/request";
import { logSecurityEvent } from "@/modules/audit";
import { getCurrentSession, invalidateCurrentSession } from "@/modules/identity/session";

/**
 * POST /sign-out — ends the current session (CSRF: same-origin requests only) and returns home.
 * Use a form: <form action="/sign-out" method="post"><button>Sign out</button></form>
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new Response("Cross-site sign-out requests are not allowed.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const current = await getCurrentSession();
  await invalidateCurrentSession();
  if (current) await logSecurityEvent({ userId: current.user.id, type: "signed_out" });
  return new Response(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } });
}

/** Signing out never happens on GET (links can be prefetched or forged); send people to their account page. */
export function GET(): Response {
  return new Response(null, { status: 303, headers: { Location: "/account/security", "Cache-Control": "no-store" } });
}
