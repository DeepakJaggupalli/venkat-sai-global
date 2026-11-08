import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { renderBlankResumeTemplate } from "@/modules/resume-service/service";

/**
 * GET /admin/resume-requests/template?format=docx|pdf — the business's resume layout with every value empty (no
 * personal data), generated from code. candidates.manage.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download the template.", { status: 401 });
  if (!staffCan(ctx, "candidates.manage")) return new Response("You do not have permission to download the template.", { status: 403 });
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";
  try {
    const bytes = await renderBlankResumeTemplate(ctx, format);
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="venkat-sai-resume-template.${format}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("Blank resume template failed", { error });
    return new Response("The template could not be created. Please try again.", { status: 500 });
  }
}
