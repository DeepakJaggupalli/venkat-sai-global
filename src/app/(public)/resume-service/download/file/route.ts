import type { NextRequest } from "next/server";

import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request";
import { buildFileHeaders } from "@/modules/files/http";
import { openResumeDownload } from "@/modules/resume-service/service";

/**
 * GET /resume-service/download/file?t=<signed token>&format=docx|pdf — the candidate's generated resume. The token is
 * checked (expiry, revocation version, status) by the resume-service module, which also logs the download.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get("t");
  const format = request.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";
  try {
    const meta = await getRequestMeta();
    const opened = await openResumeDownload(token, format, { ipHash: meta.ipHash });
    if (!opened) return new Response("This download link has expired. Please ask us on WhatsApp for a new link.", { status: 410, headers: { "Cache-Control": "no-store" } });
    const headers = buildFileHeaders({
      mimeType: opened.content.mimeType,
      size: opened.content.size,
      fileName: opened.file.originalName,
      download: true,
      cacheControl: "private, no-store",
      crossOriginResourcePolicy: "same-origin",
      noIndex: true,
    });
    headers.set("Referrer-Policy", "no-referrer");
    return new Response(opened.content.body, { status: 200, headers });
  } catch (error) {
    if (error instanceof ActionError) return new Response(error.message, { status: error.code === "rate_limited" ? 429 : 400 });
    logger.error("Resume download failed", { error });
    return new Response("The download failed. Please try again.", { status: 500 });
  }
}
