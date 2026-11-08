import type { NextRequest } from "next/server";

import { ActionError, formDataToObject, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getRequestMeta, isSameOrigin } from "@/lib/request";
import { RESUME_PHOTO_MAX_BYTES, resumeRequestSchema, type ResumeRequestResult } from "@/modules/resume-service/schemas";
import { createResumeRequest } from "@/modules/resume-service/service";

/**
 * POST /resume-service/submit — the public "Prepare my resume" request (multipart: `details` JSON, consent, notes and
 * an optional `photo`, shrunk in the browser so the request stays under the 4.5 MB body limit). Same-origin only;
 * honeypot, rate limits, the feature flag and the file checks are enforced by the resume-service module.
 */
export const maxDuration = 60;

const BODY_LIMIT = RESUME_PHOTO_MAX_BYTES + 256 * 1024;

function json(status: number, result: ActionResult<ResumeRequestResult>): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Please send the form from our website.", code: "csrf" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return json(413, { ok: false, error: "The photo is larger than 4 MB. Choose a smaller photo.", fieldErrors: { photo: ["The photo is larger than 4 MB"] }, code: "too_large" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "The form could not be read. Please try again.", code: "bad_request" });
  }
  const photo = form.get("photo");
  const parsed = resumeRequestSchema.safeParse(formDataToObject(form));
  if (!parsed.success) return json(400, { ok: false, error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error), code: "invalid" });

  try {
    const meta = await getRequestMeta();
    const upload = photo instanceof File && photo.size > 0 ? { data: new Uint8Array(await photo.arrayBuffer()), name: photo.name, type: photo.type || null } : null;
    const result = await createResumeRequest(parsed.data, upload, { ipHash: meta.ipHash });
    return json(200, { ok: true, data: result, message: "Thank you. We have received your request." });
  } catch (error) {
    if (error instanceof ActionError) return json(error.code === "rate_limited" ? 429 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
    logger.error("Resume request failed", { error });
    return json(500, { ok: false, error: "Something went wrong while sending your request. Please try again, or message us on WhatsApp.", code: "server_error" });
  }
}
