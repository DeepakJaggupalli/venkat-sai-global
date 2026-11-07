import type { NextRequest } from "next/server";
import { z } from "zod";

import { FILE_PURPOSES, FILE_VISIBILITIES } from "@/db/schema/_constants";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { audit } from "@/modules/audit";
import { authorizeUpload, UploadAuthorizationError } from "@/modules/files/authorize-upload";
import { jsonError } from "@/modules/files/http";
import { FILE_POLICIES, getFilePolicy, isFilePurpose, isUploadablePurpose } from "@/modules/files/policies";
import { toUploadedFile } from "@/modules/files/present";
import { FileValidationError, storeFile } from "@/modules/files/service";
import { getCurrentUser } from "@/modules/identity/session";

/**
 * POST /api/v1/uploads — multipart upload used by <FileUpload>.
 *
 * Fields: file (required), purpose (FILE_PURPOSES), organizationId (uuid, optional),
 * visibility ("public" | "private", optional; public only where the purpose allows it).
 * `?purpose=` may also be sent in the query string so the size limit applies before the body is read.
 *
 * Signed-in users only · same-origin (CSRF) · rate limited per user · purpose authorisation hook ·
 * validation + sniffing + scanning + metadata stripping in storeFile().
 * 201 → { id, url, thumbnailUrl, name, size, mimeType, width, height, scanStatus, visibility, purpose }
 * 4xx → { error, code? }
 */
export const maxDuration = 60;

const MULTIPART_OVERHEAD = 64 * 1024;
const LARGEST_UPLOAD = Math.max(...FILE_PURPOSES.filter(isUploadablePurpose).map((p) => FILE_POLICIES[p].maxBytes));
const UPLOADS_PER_WINDOW = 60;
const WINDOW_SECONDS = 10 * 60;

const fieldsSchema = z.object({
  purpose: z.enum(FILE_PURPOSES, { error: "Choose what this file is for." }),
  organizationId: z.uuid("Invalid organisation.").optional(),
  visibility: z.enum(FILE_VISIBILITIES).optional(),
});

class PayloadTooLarge extends Error {}

/** Parse multipart form data while refusing to buffer more than `maxBytes`. */
async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLarge();
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data") || !request.body) {
    throw new TypeError("Expected a multipart/form-data body");
  }
  let received = 0;
  let exceeded = false;
  const limited = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) {
          exceeded = true;
          controller.error(new PayloadTooLarge());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Response(limited, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (exceeded || error instanceof PayloadTooLarge) throw new PayloadTooLarge();
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-site uploads are not allowed.", { code: "csrf" });

  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Please sign in to upload files.", { code: "unauthenticated" });

  const rl = await rateLimit(`upload:${user.id}`, UPLOADS_PER_WINDOW, WINDOW_SECONDS);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
    return jsonError(429, "You have uploaded too many files in a short time. Please try again in a few minutes.", { code: "rate_limited" }, { "Retry-After": String(retryAfter) });
  }

  const queryPurpose = request.nextUrl.searchParams.get("purpose");
  const limit = (isFilePurpose(queryPurpose) ? getFilePolicy(queryPurpose).maxBytes : LARGEST_UPLOAD) + MULTIPART_OVERHEAD;

  let form: FormData;
  try {
    form = await readLimitedFormData(request, limit);
  } catch (error) {
    if (error instanceof PayloadTooLarge) return jsonError(413, "The file is too large.", { code: "too_large" });
    return jsonError(400, "The upload could not be read. Please try again.", { code: "bad_request" });
  }

  const parsed = fieldsSchema.safeParse({
    purpose: form.get("purpose") ?? queryPurpose ?? undefined,
    organizationId: (form.get("organizationId") as string | null) || undefined,
    visibility: (form.get("visibility") as string | null) || undefined,
  });
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid upload.", { code: "invalid_fields" });
  const { purpose, organizationId, visibility } = parsed.data;
  if (queryPurpose && queryPurpose !== purpose) return jsonError(400, "Invalid upload.", { code: "invalid_fields" });

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Choose a file to upload.", { code: "missing_file" });

  const policy = getFilePolicy(purpose);
  if (file.size === 0) return jsonError(400, "The file is empty.", { code: "empty" });
  if (file.size > policy.maxBytes) return jsonError(413, "The file is too large.", { code: "too_large" });
  if (visibility === "public" && !policy.allowPublic) return jsonError(400, `${policy.label} files cannot be public.`, { code: "visibility_not_allowed" });

  let authorization;
  try {
    authorization = await authorizeUpload({ user, purpose, organizationId: organizationId ?? null });
  } catch (error) {
    if (error instanceof UploadAuthorizationError) return jsonError(error.status, error.message, { code: error.status === 403 ? "forbidden" : "invalid_target" });
    throw error;
  }

  try {
    const stored = await storeFile({
      data: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      declaredMimeType: file.type || null,
      purpose,
      ownerUserId: authorization.ownerUserId,
      organizationId: authorization.organizationId,
      visibility,
    });
    await audit({
      action: "file.uploaded",
      entityType: "file",
      entityId: stored.id,
      organizationId: stored.organizationId,
      metadata: { purpose, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, scanStatus: stored.scanStatus, visibility: stored.visibility, via: authorization.via },
    });
    return Response.json(toUploadedFile(stored), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FileValidationError) return jsonError(error.status, error.message, { code: error.code });
    logger.error("Upload failed", { error, purpose, userId: user.id });
    return jsonError(500, "The upload failed. Please try again.", { code: "server_error" });
  }
}
