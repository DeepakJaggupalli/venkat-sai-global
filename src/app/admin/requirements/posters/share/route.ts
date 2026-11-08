import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { FileValidationError } from "@/modules/files";
import { POSTER_PERMISSIONS, storeSharedPoster } from "@/modules/recruitment-posters/service";

/**
 * Web Share Target (src/app/manifest.ts): Android → Gallery / WhatsApp → Share → "Venkat Sai Global" POSTs the
 * image here (multipart: `poster` file, `title`, `text`, `url`). Signed-in staff with content.edit +
 * media.manage get the image stored as a private draft upload (purpose cms_media, owned by them) and are sent
 * to the "Post requirement" page with it prefilled for one-tap publishing.
 *
 * Signed out → sign-in with returnTo (the shared file cannot survive the redirect; staff choose it again).
 * Not a CSRF risk worth an Origin check: the share sheet's POST carries no usable Origin, and the only effect
 * is a private upload owned by the signed-in user, which is never published without their tap.
 */
export const maxDuration = 60;

const NEW_PAGE = "/admin/requirements/posters/new";
const MAX_BYTES = 20 * 1024 * 1024;

/** Relative Location (RFC 9110), so the redirect stays on the host the browser used (proxies, dev servers). */
function redirectTo(_request: NextRequest, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return redirectTo(request, `/sign-in?returnTo=${encodeURIComponent(NEW_PAGE)}`);
  if (!staffCan(ctx, [...POSTER_PERMISSIONS])) return redirectTo(request, "/admin/requirements/posters");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return redirectTo(request, `${NEW_PAGE}?share_error=size`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(request, `${NEW_PAGE}?share_error=read`);
  }
  const files = form.getAll("poster").filter((f): f is File => f instanceof File && f.size > 0);
  const poster = files.find((f) => f.type.startsWith("image/")) ?? files[0];
  if (!poster) return redirectTo(request, NEW_PAGE);

  const text = [form.get("text"), form.get("url")].filter((v): v is string => typeof v === "string" && v.trim() !== "").join("\n");
  const title = typeof form.get("title") === "string" ? (form.get("title") as string) : undefined;
  try {
    const stored = await storeSharedPoster(ctx, { data: new Uint8Array(await poster.arrayBuffer()), name: poster.name, type: poster.type || null }, { title, text });
    return redirectTo(request, `${NEW_PAGE}?file=${stored.id}`);
  } catch (error) {
    if (error instanceof FileValidationError) return redirectTo(request, `${NEW_PAGE}?share_error=type`);
    logger.error("Shared poster could not be stored", { error });
    return redirectTo(request, `${NEW_PAGE}?share_error=store`);
  }
}

/** Opening the share URL directly (or after sign-in) shows the normal page. */
export function GET(request: NextRequest): Response {
  return redirectTo(request, NEW_PAGE);
}
