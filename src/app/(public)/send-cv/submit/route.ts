import type { NextRequest } from "next/server";

import { ActionError, formDataToObject, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getRequestMeta, isSameOrigin } from "@/lib/request";
import { CV_MAX_BYTES, cvSubmissionSchema, type CvSubmissionResult } from "@/modules/operations/cv-submission-schemas";
import { submitCvSubmission } from "@/modules/operations/cv-submissions";

/**
 * POST /send-cv/submit — the public "Send your CV" form (multipart: fields + `cv` file).
 *
 * A route handler rather than a Server Action because the CV travels in the same request (up to 4 MB, under
 * the 4.5 MB Vercel body limit; Server Actions are capped lower). No account needed. Same-origin only (CSRF);
 * honeypot, rate limits, consent and the file checks are enforced by the operations module.
 *
 * `Accept: application/json` (the enhanced form) → ActionResult JSON. Plain form posts (no JavaScript) are
 * redirected back to /send-cv with the reference (or an error flag).
 */
export const maxDuration = 60;

const BODY_LIMIT = CV_MAX_BYTES + 256 * 1024;

function respond(request: NextRequest, status: number, result: ActionResult<CvSubmissionResult>): Response {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
  const query = result.ok ? `sent=${encodeURIComponent(result.data?.code ?? "1")}` : `error=${result.code === "rate_limited" ? "rate_limited" : "invalid"}`;
  // Relative Location (RFC 9110): stays on the host the browser used.
  return new Response(null, { status: 303, headers: { Location: `/send-cv?${query}`, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return respond(request, 403, { ok: false, error: "Please send the form from our website.", code: "csrf" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    return respond(request, 413, { ok: false, error: "The CV is larger than 4 MB. Send a smaller file, or a photo of the first page.", fieldErrors: { cv: ["The file is larger than 4 MB"] }, code: "too_large" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(request, 400, { ok: false, error: "The form could not be read. Please try again.", code: "bad_request" });
  }

  const cv = form.get("cv");
  const parsed = cvSubmissionSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    if (!(cv instanceof File) || cv.size === 0) fieldErrors.cv = ["Attach your CV"];
    return respond(request, 400, { ok: false, error: "Please check the highlighted fields.", fieldErrors, code: "invalid" });
  }

  try {
    const meta = await getRequestMeta();
    const upload = cv instanceof File && cv.size > 0 ? { data: new Uint8Array(await cv.arrayBuffer()), name: cv.name, type: cv.type || null } : null;
    const result = await submitCvSubmission(parsed.data, upload, { ipHash: meta.ipHash, sourcePage: "/send-cv" });
    return respond(request, 200, { ok: true, data: result, message: "Thank you. We have received your CV." });
  } catch (error) {
    if (error instanceof ActionError) {
      return respond(request, error.code === "rate_limited" ? 429 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
    }
    logger.error("CV submission failed", { error });
    return respond(request, 500, { ok: false, error: "Something went wrong while sending your CV. Please try again, or send it to us on WhatsApp.", code: "server_error" });
  }
}
