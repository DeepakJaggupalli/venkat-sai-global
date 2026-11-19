import type { NextRequest } from "next/server";

import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getRequestMeta, isSameOrigin } from "@/lib/request";
import { FileValidationError } from "@/modules/files";
import { SHARED_UPLOAD_MAX_BYTES, storeSharedUpload } from "@/modules/files/shared-uploads";
import { getCurrentUser } from "@/modules/identity/session";
import { getPosterStaff, POSTER_SHARE_MAX_BYTES, sharedFilesFrom, sharedTextFrom, sharePosterForStaff } from "@/modules/recruitment-posters/share-target";

/**
 * POST /share — the Web Share Target for everyone (src/app/manifest.ts: multipart `file`, `title`, `text`, `url`),
 * also used by the "Choose a file" form on /share/choose.
 *
 *  - Staff who may post requirement posters (content.edit + media.manage) and share an image: the existing staff
 *    flow (private cms_media draft, "Post requirement" page prefilled).
 *  - Everyone else (guests, signed-in users, staff sharing a PDF/Word file): the file is checked by the files module
 *    (type sniffing, 4 MB, scan status) and held as a private `shared_upload` for 2 hours, rate limited per IP hash,
 *    then 303 → /share/choose?t=<signed token> ("Send as my CV" or "Post a job requirement").
 *
 * CSRF: share sheets send no usable Origin, so a missing / "null" Origin is accepted; a foreign Origin is refused.
 * The only effect is a private short-lived upload that nothing uses without the visitor's next tap.
 */
export const maxDuration = 60;

const CHOOSE = "/share/choose";

/** Relative Location (RFC 9110), so the redirect stays on the host the browser used (proxies, dev servers). */
function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null" && !isSameOrigin(request)) return redirectTo(`${CHOOSE}?error=origin`);

  const staff = await getPosterStaff();
  const declared = Number(request.headers.get("content-length"));
  const bodyLimit = staff ? POSTER_SHARE_MAX_BYTES : SHARED_UPLOAD_MAX_BYTES + 256 * 1024;
  if (Number.isFinite(declared) && declared > bodyLimit) return redirectTo(`${CHOOSE}?error=size`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CHOOSE}?error=read`);
  }
  const files = sharedFilesFrom(form);
  if (!files.length) return redirectTo(CHOOSE);
  const shared = sharedTextFrom(form);

  const image = files.find((f) => f.type.startsWith("image/"));
  if (staff && image) return redirectTo(await sharePosterForStaff(staff, image, shared));

  const file = image ?? files[0]!;
  if (file.size > SHARED_UPLOAD_MAX_BYTES) return redirectTo(`${CHOOSE}?error=size`);
  try {
    const [user, meta] = await Promise.all([getCurrentUser(), getRequestMeta()]);
    const stored = await storeSharedUpload(
      { data: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type || null },
      { ownerUserId: user?.id ?? null, ipHash: meta.ipHash, shared },
    );
    return redirectTo(`${CHOOSE}?t=${encodeURIComponent(stored.token)}`);
  } catch (error) {
    if (error instanceof FileValidationError) return redirectTo(`${CHOOSE}?error=${error.code === "too_large" ? "size" : "type"}`);
    if (error instanceof ActionError && error.code === "rate_limited") return redirectTo(`${CHOOSE}?error=rate_limited`);
    logger.error("Shared file could not be stored", { error });
    return redirectTo(`${CHOOSE}?error=store`);
  }
}

/** Opening /share directly shows the upload options. */
export function GET(): Response {
  return redirectTo(CHOOSE);
}
