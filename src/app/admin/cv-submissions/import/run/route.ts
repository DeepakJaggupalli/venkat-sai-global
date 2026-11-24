import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { runCvImport } from "@/modules/operations/cv-import";
import type { CvImportResult } from "@/modules/operations/cv-import-schemas";

import { importErrorResponse, json, readImportRequest } from "../_lib/upload";

/**
 * POST /admin/cv-submissions/import/run — multipart `file` (.xlsx), `consent` (the staff confirmation) and `fileHash`
 * (from the check). Imports the ready rows in one transaction and answers with the summary (ActionResult JSON).
 * candidates.manage, same-origin. The file is not kept.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  const req = await readImportRequest(request);
  if (req instanceof Response) return req;
  const consent = ["on", "true", "1", "yes"].includes(String(req.form.get("consent") ?? "").toLowerCase());
  const hash = req.form.get("fileHash");
  const expectedFileHash = typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash) ? hash : null;
  try {
    const result = await runCvImport(req.ctx, req.upload, { consent, expectedFileHash });
    revalidatePath("/admin/cv-submissions");
    revalidatePath("/admin");
    return json<CvImportResult>(200, { ok: true, data: result, message: `${result.created} ${result.created === 1 ? "person" : "people"} added` });
  } catch (error) {
    return importErrorResponse(error, "run");
  }
}
