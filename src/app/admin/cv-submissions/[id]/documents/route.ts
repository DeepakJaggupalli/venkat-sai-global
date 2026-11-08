import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { ActionError, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/request";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { addCvSubmissionDocument } from "@/modules/operations/cv-submission-documents";
import { CV_DOCUMENT_MAX_BYTES, cvDocumentKindSchema } from "@/modules/operations/cv-submission-schemas";
import { CV_SUBMISSIONS_ADMIN_PATH } from "@/modules/operations/cv-submissions";

/**
 * POST /admin/cv-submissions/[id]/documents — staff add one document to a CV submission on the candidate's behalf
 * (multipart: `kind`, `file`). candidates.manage, same-origin; the operations module re-checks and audits.
 */
export const maxDuration = 60;

const BODY_LIMIT = CV_DOCUMENT_MAX_BYTES + 128 * 1024;

function json(status: number, result: ActionResult<{ id: string }>): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Cross-site request blocked.", code: "csrf" });
  const ctx = await getStaffContext();
  if (!ctx) return json(401, { ok: false, error: "Sign in as staff to upload documents.", code: "unauthenticated" });
  if (!staffCan(ctx, "candidates.manage")) return json(403, { ok: false, error: "You do not have permission to add documents.", code: "forbidden" });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(404, { ok: false, error: "This CV submission could not be found.", code: "not_found" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return json(413, { ok: false, error: "The file is larger than 4 MB.", code: "too_large" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "The upload could not be read. Please try again.", code: "bad_request" });
  }
  const kind = cvDocumentKindSchema.safeParse(form.get("kind"));
  if (!kind.success) return json(400, { ok: false, error: "Choose the type of document.", code: "invalid" });
  const file = form.get("file");

  try {
    const upload = file instanceof File && file.size > 0 ? { data: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type || null } : null;
    const doc = await addCvSubmissionDocument({ kind: "staff", ctx }, { submissionId: id, kind: kind.data, upload });
    revalidatePath(`${CV_SUBMISSIONS_ADMIN_PATH}/${id}`);
    return json(200, { ok: true, data: { id: doc.id }, message: `${doc.kindLabel} added.` });
  } catch (error) {
    if (error instanceof ActionError) return json(error.code === "forbidden" ? 403 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
    logger.error("Staff CV document upload failed", { error });
    return json(500, { ok: false, error: "The document could not be uploaded. Please try again.", code: "server_error" });
  }
}
