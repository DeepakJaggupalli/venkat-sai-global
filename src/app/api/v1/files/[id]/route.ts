import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { logDataAccess } from "@/modules/audit";
import { checkFileAccess, getCurrentFileViewer } from "@/modules/files/access";
import { shouldLogDataAccess } from "@/modules/files/access-rules";
import { buildFileHeaders, isInlineSafe, jsonError, notModified } from "@/modules/files/http";
import { contentDisposition } from "@/modules/files/keys";
import { getFilePolicy } from "@/modules/files/policies";
import { getFile, openFileContent, presignedDownloadsEnabled, presignFileDownload } from "@/modules/files/service";
import { parseVariantParam } from "@/modules/files/urls";

/**
 * GET /api/v1/files/[id]?variant=thumb|md|lg&download=1 — serves a file after the access check.
 *
 *  - 401 signed out (top-level navigations are sent to sign-in and back), 403 not allowed,
 *    404 missing/deleted, 409 still being scanned, 403 quarantined.
 *  - Sensitive purposes read by anyone other than the owner are recorded in data_access_logs and
 *    never cached (`private, no-store`); other private files get a short private cache + ETag.
 *  - Content-Type comes from the database (sniffed at upload), Content-Disposition carries a safe
 *    file name, nosniff + a sandboxing CSP stop the browser from executing anything.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const file = await getFile(id);
  if (!file) return jsonError(404, "File not found.");

  const viewer = await getCurrentFileViewer();
  const decision = await checkFileAccess(viewer, file);
  if (!decision.allowed) {
    switch (decision.reason) {
      case "unauthenticated": {
        if (request.headers.get("sec-fetch-dest") === "document") {
          const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
          return Response.redirect(new URL(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, request.nextUrl.origin), 303);
        }
        return jsonError(401, "Please sign in to open this file.");
      }
      case "processing":
        return jsonError(409, "This file is still being checked for security. Try again in a minute.", {}, { "Retry-After": "60" });
      case "quarantined":
        return jsonError(403, "This file is not available because it failed a security check.");
      case "not_found":
        return jsonError(404, "File not found.");
      default:
        return jsonError(403, "You do not have access to this file.");
    }
  }

  const policy = getFilePolicy(file.purpose);
  const download = request.nextUrl.searchParams.get("download") === "1";
  const variant = parseVariantParam(request.nextUrl.searchParams.get("variant"));
  // Sensitive purposes are never cached (not even for their owner, e.g. on a shared computer).
  const cacheControl = policy.sensitive ? "private, no-store" : "private, max-age=300";

  if (viewer && shouldLogDataAccess(file, decision)) {
    try {
      await logDataAccess({
        actorUserId: viewer.userId,
        actorOrganizationId: decision.organizationId,
        subjectUserId: file.ownerUserId,
        subjectType: "file",
        subjectId: file.id,
        dataCategory: policy.dataCategory,
        accessType: download ? "download" : "view",
        reason: `file access via ${decision.via}`,
        metadata: { purpose: file.purpose, variant },
      });
    } catch (error) {
      // Never serve a sensitive file without its access record.
      logger.error("Failed to record file access", { error, fileId: file.id });
      return jsonError(503, "The file is temporarily unavailable. Please try again.");
    }
  }

  if (presignedDownloadsEnabled(file)) {
    const inline = !download && isInlineSafe(file.mimeType);
    const url = await presignFileDownload(file, variant, {
      contentDisposition: contentDisposition(inline ? "inline" : "attachment", file.originalName),
      cacheControl,
      expiresInSeconds: 300,
    });
    if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }

  const content = await openFileContent(file, variant);
  if (!content) {
    logger.error("Stored object missing", { fileId: file.id, driver: file.storageDriver });
    return jsonError(404, "File not found.");
  }

  const etag = policy.sensitive ? null : content.etag;
  if (etag && notModified(request, etag)) {
    await content.body.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }

  const headers = buildFileHeaders({
    mimeType: content.mimeType,
    size: content.size,
    fileName: file.originalName,
    download,
    cacheControl,
    etag,
    crossOriginResourcePolicy: "same-origin",
    noIndex: true,
  });
  return new Response(content.body, { status: 200, headers });
}
