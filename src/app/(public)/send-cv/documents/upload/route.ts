import type { NextRequest } from "next/server";

import { ActionError, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getRequestMeta, isSameOrigin } from "@/lib/request";
import { addCvSubmissionDocument, type CvSubmissionDocumentItem } from "@/modules/operations/cv-submission-documents";
import { CV_DOCUMENT_MAX_BYTES, cvDocumentKindSchema } from "@/modules/operations/cv-submission-schemas";

/**
 * POST /send-cv/documents/upload — one document per request from the candidate's signed upload link (multipart:
 * `token`, `kind`, `file`). Same-origin only; the link, rate limits and file checks are enforced by the operations
 * module. Responds with ActionResult JSON (the uploader is a client component).
 */
export const maxDuration = 60;

const BODY_LIMIT = CV_DOCUMENT_MAX_BYTES + 128 * 1024;

type Uploaded = Pick<CvSubmissionDocumentItem, "id" | "kind" | "kindLabel" | "fileName">;

function json(status: number, result: ActionResult<Uploaded>): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Please upload from our website.", code: "csrf" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return json(413, { ok: false, error: "The file is larger than 4 MB. Take a photo instead, or send a smaller file.", code: "too_large" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "The upload could not be read. Please try again.", code: "bad_request" });
  }
  const token = form.get("token");
  const kind = cvDocumentKindSchema.safeParse(form.get("kind"));
  const file = form.get("file");
  if (typeof token !== "string" || !token) return json(400, { ok: false, error: "This upload link is not valid.", code: "link_expired" });
  if (!kind.success) return json(400, { ok: false, error: "Choose the type of document.", fieldErrors: { kind: ["Choose the type of document"] }, code: "invalid" });

  try {
    const meta = await getRequestMeta();
    const upload = file instanceof File && file.size > 0 ? { data: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type || null } : null;
    const doc = await addCvSubmissionDocument({ kind: "candidate", token, ipHash: meta.ipHash }, { kind: kind.data, upload });
    return json(200, { ok: true, data: { id: doc.id, kind: doc.kind, kindLabel: doc.kindLabel, fileName: doc.fileName }, message: "Uploaded." });
  } catch (error) {
    if (error instanceof ActionError) {
      return json(error.code === "rate_limited" ? 429 : error.code === "link_expired" ? 410 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
    }
    logger.error("CV document upload failed", { error });
    return json(500, { ok: false, error: "Something went wrong while uploading. Please try again, or send the document on WhatsApp.", code: "server_error" });
  }
}
