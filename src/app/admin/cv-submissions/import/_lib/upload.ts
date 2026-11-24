import "server-only";

import type { NextRequest } from "next/server";

import { ActionError, type ActionResult } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/request";
import { getStaffContext, staffCan, type StaffContext } from "@/modules/identity/authz";
import { CV_IMPORT_MAX_BYTES } from "@/modules/operations/cv-import-schemas";
import type { CvImportUpload } from "@/modules/operations/cv-import";
import { pgError } from "@/modules/operations/internal";
import { getSetting } from "@/modules/settings";

/** Body limit: the file plus room for the multipart wrapping and the small form fields. */
const BODY_LIMIT = CV_IMPORT_MAX_BYTES + 128 * 1024;

export function json<T>(status: number, result: ActionResult<T>): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Common start of the import POST handlers: same-origin, staff with candidates.manage, size limit, then the uploaded
 * file read into memory (never stored). Returns a JSON error Response when the request cannot go on.
 */
export async function readImportRequest(request: NextRequest): Promise<{ ctx: StaffContext; upload: CvImportUpload; form: FormData } | Response> {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Cross-site request blocked.", code: "csrf" });
  const ctx = await getStaffContext();
  if (!ctx) return json(401, { ok: false, error: "Sign in as staff to import CVs.", code: "unauthenticated" });
  if (!staffCan(ctx, "candidates.manage")) return json(403, { ok: false, error: "You do not have permission to import CVs.", code: "forbidden" });
  // Same two-factor rule as the Command Centre pages (requireStaff): a direct POST must not skip it.
  if (!ctx.user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"))) {
    return json(403, { ok: false, error: "Set up two-factor authentication at /account/security first.", code: "two_factor_required" });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return json(413, { ok: false, error: "The file is larger than 4 MB. Split it into smaller files.", code: "too_large" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "The file could not be read. Please try again.", code: "bad_request" });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json(400, { ok: false, error: "Choose your Excel file.", fieldErrors: { file: ["Choose your Excel file"] }, code: "invalid_file" });
  if (file.size > CV_IMPORT_MAX_BYTES) return json(413, { ok: false, error: "The file is larger than 4 MB. Split it into smaller files.", code: "too_large" });
  return { ctx, form, upload: { data: new Uint8Array(await file.arrayBuffer()), name: file.name } };
}

/** Expected failures → 400/403 with the message; anything else is logged without personal data (no query values). */
export function importErrorResponse(error: unknown, what: string): Response {
  if (error instanceof ActionError) {
    return json(error.code === "forbidden" ? 403 : error.code === "rate_limited" ? 429 : 400, { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code });
  }
  logger.error(`CV import ${what} failed`, { errorName: error instanceof Error ? error.name : typeof error, ...pgError(error) });
  return json(500, { ok: false, error: "Something went wrong while reading the file. Please try again.", code: "server_error" });
}
