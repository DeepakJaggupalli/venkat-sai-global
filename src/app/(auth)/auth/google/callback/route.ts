import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { completeGoogleSignIn } from "@/modules/identity/service";

/**
 * GET /auth/google/callback — Google redirects here with ?code&state (or ?error).
 * State, nonce and the PKCE verifier come from the encrypted cookie set by /auth/google.
 */
function redirectTo(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const query = request.nextUrl.searchParams;
  const read = (key: string): string | null => {
    const value = query.get(key);
    return value && value.length <= 4096 ? value : null;
  };
  try {
    const location = await completeGoogleSignIn({ code: read("code"), state: read("state"), error: read("error") });
    return redirectTo(location);
  } catch (error) {
    logger.error("Google sign-in callback failed", { error });
    return redirectTo("/sign-in?error=google_failed");
  }
}
