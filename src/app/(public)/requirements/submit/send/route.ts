import type { NextRequest } from "next/server";

import { ActionError, formDataToObject, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getRequestMeta, isSameOrigin } from "@/lib/request";
import { getCurrentUser } from "@/modules/identity/session";
import { POSTER_SUBMISSION_MAX_BYTES, publicPosterSubmissionSchema, type PublicPosterSubmissionResult } from "@/modules/operations/requirement-poster-schemas";
import { submitPublicRequirementPoster } from "@/modules/operations/requirement-poster-submissions";

/**
 * POST /requirements/submit/send — the public "Post a requirement" form (multipart: fields + `poster` photo, or
 * `shared`: the token of a file shared from the phone). A route handler (not a Server Action) because the photo
 * travels in the same request (up to 4 MB, under the 4.5 MB Vercel body limit). Same-origin only (CSRF); honeypot,
 * rate limits, consent and the file checks are enforced by the operations module. The result is a DRAFT poster
 * awaiting approval plus an employer enquiry: nothing is published here.
 *
 * `Accept: application/json` (the enhanced form) → ActionResult JSON; plain form posts are redirected back.
 */
export const maxDuration = 60;

const BODY_LIMIT = POSTER_SUBMISSION_MAX_BYTES + 256 * 1024;

function respond(request: NextRequest, status: number, result: ActionResult<PublicPosterSubmissionResult>): Response {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
  const query = result.ok ? `sent=${encodeURIComponent(result.data?.code ?? "1")}` : `error=${result.code === "rate_limited" ? "rate_limited" : "invalid"}`;
  return new Response(null, { status: 303, headers: { Location: `/requirements/submit?${query}`, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return respond(request, 403, { ok: false, error: "Please send the form from our website.", code: "csrf" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    return respond(request, 413, { ok: false, error: "The photo is larger than 4 MB. Choose a smaller photo.", fieldErrors: { poster: ["The photo is larger than 4 MB"] }, code: "too_large" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(request, 400, { ok: false, error: "The form could not be read. Please try again.", code: "bad_request" });
  }

  const poster = form.get("poster");
  const hasPoster = poster instanceof File && poster.size > 0;
  const parsed = publicPosterSubmissionSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    if (!hasPoster && !form.get("shared")) fieldErrors.poster = ["Add the poster photo"];
    return respond(request, 400, { ok: false, error: "Please check the highlighted fields.", fieldErrors, code: "invalid" });
  }

  try {
    const [meta, user] = await Promise.all([getRequestMeta(), getCurrentUser()]);
    const upload = hasPoster ? { data: new Uint8Array(await poster.arrayBuffer()), name: poster.name, type: poster.type || null } : null;
    const result = await submitPublicRequirementPoster(parsed.data, upload, { ipHash: meta.ipHash, userId: user?.id ?? null });
    return respond(request, 200, { ok: true, data: result, message: "Thank you. We have received your requirement." });
  } catch (error) {
    if (error instanceof ActionError) {
      return respond(request, error.code === "rate_limited" ? 429 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
    }
    logger.error("Requirement poster submission failed", { error });
    return respond(request, 500, { ok: false, error: "Something went wrong while sending your requirement. Please try again, or send the poster on WhatsApp.", code: "server_error" });
  }
}
