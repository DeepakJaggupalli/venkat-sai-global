import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { buildFileHeaders, isInlineSafe, jsonError, notModified } from "@/modules/files/http";
import { contentDisposition } from "@/modules/files/keys";
import { getFile, openFileContent, presignedDownloadsEnabled, presignFileDownload } from "@/modules/files/service";
import { parseVariantParam } from "@/modules/files/urls";

/**
 * GET /media/[id]/[name]?variant=thumb|md|lg&download=1 — PUBLIC files only (logos, CMS media,
 * published portfolio items). The name segment is cosmetic (SEO / save-as); lookup is by id.
 *
 * File bytes never change for an id, so responses are cached for a year (`immutable`) by browsers
 * and CDNs. When a requested image variant has not been generated yet, the original is served with
 * a short cache instead so the long-lived URL is not pinned to the wrong bytes.
 * Private, deleted, quarantined or not-yet-scanned files answer 404 (existence is not revealed).
 */
const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=300";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; name: string }> }): Promise<Response> {
  const { id } = await context.params;
  const file = await getFile(id);
  if (!file || file.visibility !== "public" || (file.scanStatus !== "clean" && file.scanStatus !== "not_scanned")) {
    return jsonError(404, "Not found.");
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const variant = parseVariantParam(request.nextUrl.searchParams.get("variant"));

  if (presignedDownloadsEnabled(file)) {
    const inline = !download && isInlineSafe(file.mimeType);
    const url = await presignFileDownload(file, variant, {
      contentDisposition: contentDisposition(inline ? "inline" : "attachment", file.originalName),
      cacheControl: IMMUTABLE,
      expiresInSeconds: 3600,
    });
    // The redirect itself is cached briefly so the presigned URL is refreshed well before expiry.
    if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=600" } });
  }

  const content = await openFileContent(file, variant);
  if (!content) {
    logger.error("Stored object missing", { fileId: file.id, driver: file.storageDriver });
    return jsonError(404, "Not found.");
  }

  // A smaller variant served for a larger request is final once the variant set exists (the
  // original was too small for the bigger size); serving the original for a variant request is not.
  const variantsGenerated = Object.keys(file.variants ?? {}).length > 0;
  const exact = !variant || (content.variant !== null && (content.variant === variant || variantsGenerated));
  const cacheControl = exact ? IMMUTABLE : SHORT;
  if (notModified(request, content.etag)) {
    await content.body.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers: { ETag: content.etag, "Cache-Control": cacheControl } });
  }

  const headers = buildFileHeaders({
    mimeType: content.mimeType,
    size: content.size,
    fileName: file.originalName,
    download,
    cacheControl,
    etag: content.etag,
    crossOriginResourcePolicy: "cross-origin",
    noIndex: false,
  });
  return new Response(content.body, { status: 200, headers });
}
