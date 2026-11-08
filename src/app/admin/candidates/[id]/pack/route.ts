import type { NextRequest } from "next/server";

import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { buildCandidatePack } from "@/modules/candidates/cv-pack";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { pdfResponse } from "@/server/pdf/pack";

/**
 * GET /admin/candidates/[id]/pack?type=cv|visa — the candidate's documents as one PDF in the business's order
 * (candidates.view + candidates.view_documents; files re-checked and the download logged by the candidates module).
 */
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download documents.", { status: 401 });
  if (!staffCan(ctx, ["candidates.view", "candidates.view_documents"])) return new Response("You do not have permission to open candidate documents.", { status: 403 });
  const limit = await rateLimit(`admin:cv-pack:${ctx.user.id}`, 60, 3600);
  if (!limit.allowed) return new Response("Too many downloads. Try again later.", { status: 429 });
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") === "visa" ? "visa" : "cv";
  try {
    const pack = await buildCandidatePack(ctx, id, type);
    if (!pack) return new Response("This candidate could not be found.", { status: 404 });
    return pdfResponse(pack.bytes, pack.filename);
  } catch (error) {
    if (error instanceof ActionError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 400 });
    logger.error("Candidate pack failed", { error });
    return new Response("The pack could not be created. Please try again.", { status: 500 });
  }
}
