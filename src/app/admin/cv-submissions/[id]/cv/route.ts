import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { ActionError, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { CV_MAX_BYTES } from "@/modules/operations/cv-submission-schemas";
import { attachCvSubmissionFile, CV_SUBMISSIONS_ADMIN_PATH } from "@/modules/operations/cv-submissions";
import { getSetting } from "@/modules/settings";

/**
 * POST /admin/cv-submissions/[id]/cv — staff attach (or replace) the CV of a submission (multipart: `cv`), e.g. the
 * CV a candidate who applied without one sent later on WhatsApp. candidates.manage, same-origin; the operations module
 * re-checks, stores the file (files module rules) and audits.
 */
export const maxDuration = 60;

const BODY_LIMIT = CV_MAX_BYTES + 128 * 1024;

function json(status: number, result: ActionResult<{ replaced: boolean }>): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Cross-site request blocked.", code: "csrf" });
  const ctx = await getStaffContext();
  if (!ctx) return json(401, { ok: false, error: "Sign in as staff to upload a CV.", code: "unauthenticated" });
  if (!staffCan(ctx, "candidates.manage")) return json(403, { ok: false, error: "You do not have permission to attach CVs.", code: "forbidden" });
  // Same two-factor rule as the Command Centre pages (requireStaff): a direct POST must not skip it.
  if (!ctx.user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"))) {
    return json(403, { ok: false, error: "Set up two-factor authentication at /account/security first.", code: "two_factor_required" });
  }
  const limit = await rateLimit(`admin:cv-attach:${ctx.user.id}`, 60, 3600);
  if (!limit.allowed) return json(429, { ok: false, error: "Too many uploads. Try again later.", code: "rate_limited" });
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
  const file = form.get("cv");
  try {
    const upload = file instanceof File && file.size > 0 ? { data: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type || null } : null;
    const result = await attachCvSubmissionFile(ctx, { id, upload });
    revalidatePath(`${CV_SUBMISSIONS_ADMIN_PATH}/${id}`);
    revalidatePath(CV_SUBMISSIONS_ADMIN_PATH);
    return json(200, { ok: true, data: result, message: result.replaced ? "CV replaced." : "CV attached." });
  } catch (error) {
    if (error instanceof ActionError) return json(error.code === "forbidden" ? 403 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
    logger.error("Staff CV attach failed", { error });
    return json(500, { ok: false, error: "The CV could not be uploaded. Please try again.", code: "server_error" });
  }
}
