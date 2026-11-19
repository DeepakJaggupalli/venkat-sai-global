import type { NextRequest } from "next/server";

import { openFileContent } from "@/modules/files";
import { buildFileHeaders } from "@/modules/files/http";
import { isRasterImageMime } from "@/modules/files/policies";
import { getSharedUpload } from "@/modules/files/shared-uploads";

/**
 * GET /share/file?t=<token> — thumbnail of an unused shared image for its own sharer (the signed token is the only
 * credential; guests have no session). Images only, never cached, not indexable, same-origin only.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const shared = await getSharedUpload(request.nextUrl.searchParams.get("t"));
  if (!shared || !isRasterImageMime(shared.file.mimeType)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const content = await openFileContent(shared.file, "thumb");
  if (!content) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = buildFileHeaders({
    mimeType: content.mimeType,
    size: content.size,
    fileName: shared.file.originalName,
    download: false,
    cacheControl: "private, no-store",
    etag: content.etag,
    crossOriginResourcePolicy: "same-origin",
    noIndex: true,
  });
  return new Response(content.body, { status: 200, headers });
}
