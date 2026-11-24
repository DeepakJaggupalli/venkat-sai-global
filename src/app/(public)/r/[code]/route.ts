import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { resolveReferralLanding } from "@/modules/referrals/service";

/**
 * GET /r/<CODE> — a referrer's share link. A valid, active code sets the `vsg_ref` cookie (30 days, httpOnly,
 * SameSite=Lax, Secure in production); /send-cv reads it and stores the code on the CV. Every visitor then lands on
 * the homepage, which shows the open requirements first. Unknown or blocked codes redirect without a cookie.
 * The response is never cached (it may carry a cookie), and the Location is relative so it stays on the host used.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const response = new NextResponse(null, { status: 307, headers: { Location: "/", "Cache-Control": "private, no-store" } });
  try {
    const cookie = await resolveReferralLanding(code, { production: process.env.NODE_ENV === "production" });
    if (cookie) response.cookies.set(cookie.name, cookie.value, cookie.options);
  } catch (error) {
    // A database hiccup must never stop the visitor from reaching the jobs.
    logger.warn("Referral link could not be checked", { error });
  }
  return response;
}
