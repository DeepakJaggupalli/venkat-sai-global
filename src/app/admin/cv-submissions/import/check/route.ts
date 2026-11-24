import type { NextRequest } from "next/server";

import { previewCvImport } from "@/modules/operations/cv-import";
import type { CvImportPreview } from "@/modules/operations/cv-import-schemas";

import { importErrorResponse, json, readImportRequest } from "../_lib/upload";

/**
 * POST /admin/cv-submissions/import/check — multipart `file` (.xlsx). Reads and checks the file and answers with the
 * preview (ActionResult JSON). Nothing is written and the file is not kept. candidates.manage, same-origin.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  const req = await readImportRequest(request);
  if (req instanceof Response) return req;
  try {
    const preview = await previewCvImport(req.ctx, req.upload);
    return json<CvImportPreview>(200, { ok: true, data: preview });
  } catch (error) {
    return importErrorResponse(error, "check");
  }
}
