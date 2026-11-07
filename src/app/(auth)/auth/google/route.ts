import type { NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { startGoogleSignIn } from "@/modules/identity/service";
import { SIGNUP_INTENTS } from "@/modules/identity/types";

/**
 * GET /auth/google — start Google sign-in (or, with mode=link, connect Google to the signed-in
 * account). Query: intent, returnTo, consent=checkbox|notice, me/ms/mw=1 (marketing choices
 * ticked on the sign-up page), mode=link.
 */
const querySchema = z.object({
  intent: z.enum(SIGNUP_INTENTS).optional().catch(undefined),
  returnTo: z.string().max(2000).optional().catch(undefined),
  consent: z.enum(["checkbox", "notice"]).catch("notice"),
  me: z.literal("1").optional().catch(undefined),
  ms: z.literal("1").optional().catch(undefined),
  mw: z.literal("1").optional().catch(undefined),
  mode: z.enum(["signin", "link"]).catch("signin"),
});

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  try {
    const location = await startGoogleSignIn({
      intent: query.intent ?? null,
      returnTo: query.returnTo ?? null,
      consent: query.consent,
      marketing: { email: query.me === "1", sms: query.ms === "1", whatsapp: query.mw === "1" },
      mode: query.mode,
    });
    return redirectTo(location);
  } catch (error) {
    logger.error("Could not start Google sign-in", { error });
    return redirectTo(query.mode === "link" ? "/account/security?google=failed" : "/sign-in?error=google_failed", 303);
  }
}
