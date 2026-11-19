import type { NextRequest } from "next/server";

import { getPosterStaff, POSTER_NEW_PAGE, POSTER_SHARE_MAX_BYTES, sharedFilesFrom, sharedTextFrom, sharePosterForStaff } from "@/modules/recruitment-posters/share-target";

/**
 * Former Web Share Target action, kept for apps installed from the older manifest (the manifest now points at
 * POST /share, which routes staff, users and guests). Signed-in staff with content.edit + media.manage get the
 * shared image prefilled on the "Post requirement" page; everyone else is sent to /share/choose to share again
 * (the shared file cannot survive a redirect).
 *
 * Not a CSRF risk worth an Origin check: the share sheet's POST carries no usable Origin, and the only effect is a
 * private upload owned by the signed-in user, which is never published without their tap.
 */
export const maxDuration = 60;

/** Relative Location (RFC 9110), so the redirect stays on the host the browser used (proxies, dev servers). */
function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await getPosterStaff();
  if (!ctx) return redirectTo("/share/choose");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > POSTER_SHARE_MAX_BYTES) return redirectTo(`${POSTER_NEW_PAGE}?share_error=size`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${POSTER_NEW_PAGE}?share_error=read`);
  }
  const files = sharedFilesFrom(form);
  const poster = files.find((f) => f.type.startsWith("image/")) ?? files[0];
  if (!poster) return redirectTo(POSTER_NEW_PAGE);
  return redirectTo(await sharePosterForStaff(ctx, poster, sharedTextFrom(form)));
}

/** Opening the old share URL directly shows the normal page. */
export function GET(): Response {
  return redirectTo(POSTER_NEW_PAGE);
}
