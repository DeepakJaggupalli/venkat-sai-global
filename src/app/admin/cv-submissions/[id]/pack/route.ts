import type { NextRequest } from "next/server";

import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { buildCvSubmissionPack } from "@/modules/operations/cv-pack";
import { pdfResponse } from "@/server/pdf/pack";

/**
 * GET /admin/cv-submissions/[id]/pack?type=cv|visa — the CV pack (or visa pack: same order, different title) as one
 * PDF. candidates.view + a document permission; every file re-checked and the download logged by the operations module.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download documents.", { status: 401 });
  if (!staffCan(ctx, "candidates.view") || !staffCan(ctx, ["candidates.view_documents", "recruitment.manage"], "any")) return new Response("You do not have permission to open candidate documents.", { status: 403 });
  const limit = await rateLimit(`admin:cv-pack:${ctx.user.id}`, 60, 3600);
  if (!limit.allowed) return new Response("Too many downloads. Try again later.", { status: 429 });
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") === "visa" ? "visa" : "cv";
  try {
    const pack = await buildCvSubmissionPack(ctx, id, type);
    if (!pack) return new Response("This CV submission could not be found.", { status: 404 });
    return pdfResponse(pack.bytes, pack.filename);
  } catch (error) {
    if (error instanceof ActionError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 400 });
    logger.error("CV pack failed", { error });
    return new Response("The pack could not be created. Please try again.", { status: 500 });
  }
}
