import "server-only";

import { and, eq, isNull, lt, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { files } from "@/db/schema";
import type { FilePurpose } from "@/db/schema/_constants";
import { ActionError } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/modules/audit";
import { enqueueTask } from "@/server/tasks/queue";

import { getFilePolicy, isAllowedMimeType, MIME_LABELS } from "./policies";
import { FileValidationError, getFile, purgeDeletedFile, storeFile } from "./service";
import { SHARED_UPLOAD_TTL_MINUTES, signSharedUploadToken, verifySharedUploadToken } from "./shared-upload-token";
import { getStorageDriver } from "./storage";
import type { FileRow } from "./types";

/**
 * Shared uploads (purpose `shared_upload`): the Web Share Target (POST /share) and the "Choose a file" picker on
 * /share/choose store what a visitor shares here first, before they choose what it is for. The file is private
 * (owner = the signed-in user, or null for guests), nobody else can read it, and the visitor's only handle is a
 * signed token (shared-upload-token.ts). It is then spent once:
 *  - claimSharedUpload: re-linked in place to another purpose (the CV of a "Send your CV" submission);
 *  - consumeSharedUpload: its bytes handed to the caller (copied into the media library for a poster) and the
 *    holding file deleted.
 * Unused files are deleted after SHARED_UPLOAD_TTL_MINUTES by "files.expire_shared_upload" (one delayed task per
 * file) with "system.cleanup" as the safety net.
 */
export { SHARED_UPLOAD_TTL_MINUTES, signSharedUploadToken, verifySharedUploadToken };

export const SHARED_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export type SharedUploadInput = { data: Uint8Array; name: string; type: string | null };
export type SharedUpload = { file: FileRow; sharedTitle: string | null; sharedText: string | null };

function expired(): never {
  throw new ActionError("The shared file has expired or was already used. Please choose the file again.", {
    code: "shared_file_expired",
    fieldErrors: { shared: ["Choose the file again"] },
  });
}

/** Store a shared file (type sniffing, size limit, metadata stripping, malware scan status) and sign its token. */
export async function storeSharedUpload(
  upload: SharedUploadInput,
  opts: { ownerUserId: string | null; ipHash: string | null; shared?: { title?: string | null; text?: string | null } },
): Promise<{ file: FileRow; token: string; expiresAt: Date }> {
  if (opts.ipHash) {
    const limits: [string, number, number][] = [
      [`share:ip:${opts.ipHash}`, 10, 10 * 60],
      [`share:ip-day:${opts.ipHash}`, 40, 24 * 60 * 60],
    ];
    for (const [key, limit, windowSeconds] of limits) {
      if (!(await rateLimit(key, limit, windowSeconds)).allowed) {
        throw new ActionError("You have shared several files in a short time. Please wait a little and try again.", { code: "rate_limited" });
      }
    }
  }
  const title = opts.shared?.title?.trim();
  const text = opts.shared?.text?.trim();
  const file = await storeFile({
    data: upload.data,
    originalName: upload.name || "shared-file",
    declaredMimeType: upload.type,
    purpose: "shared_upload",
    ownerUserId: opts.ownerUserId,
    visibility: "private",
    metadata: { source: "share", ...(title ? { sharedTitle: title.slice(0, 200) } : {}), ...(text ? { sharedText: text.slice(0, 2000) } : {}) },
  });
  await enqueueTask(
    "files.expire_shared_upload",
    { fileId: file.id },
    { runAt: new Date(Date.now() + (SHARED_UPLOAD_TTL_MINUTES + 5) * 60_000), dedupeKey: `files.expire_shared_upload:${file.id}` },
  );
  return { file, ...signSharedUploadToken(file.id) };
}

/** The unused shared file a valid token points at (preview, form prefill), else null. No other access check. */
export async function getSharedUpload(token: string | null | undefined): Promise<SharedUpload | null> {
  const verified = verifySharedUploadToken(token);
  if (!verified) return null;
  const file = await getFile(verified.fileId);
  if (!file || file.purpose !== "shared_upload" || file.scanStatus === "infected") return null;
  const meta = (file.metadata ?? {}) as Record<string, unknown>;
  return {
    file,
    sharedTitle: typeof meta.sharedTitle === "string" ? meta.sharedTitle : null,
    sharedText: typeof meta.sharedText === "string" ? meta.sharedText : null,
  };
}

async function lockSharedUpload(token: string, tx: DbOrTx): Promise<FileRow> {
  const verified = verifySharedUploadToken(token);
  if (!verified) expired();
  const [file] = await tx
    .select()
    .from(files)
    .where(and(eq(files.id, verified.fileId), eq(files.purpose, "shared_upload"), isNull(files.deletedAt)))
    .for("update")
    .limit(1);
  if (!file) expired();
  if (file.scanStatus === "infected") throw new FileValidationError("infected", "This file failed our security check and was not accepted.");
  return file;
}

function assertFitsPurpose(file: FileRow, purpose: FilePurpose, accepted?: readonly string[]): void {
  const policy = getFilePolicy(purpose);
  const allowed: readonly string[] = accepted ?? policy.allowedMimeTypes;
  if (!allowed.includes(file.mimeType)) {
    const labels = [...new Set(allowed.filter(isAllowedMimeType).map((m) => MIME_LABELS[m]))].join(", ");
    throw new FileValidationError("type_not_allowed", `This file cannot be used here. Choose a ${labels} file.`);
  }
  if (file.sizeBytes > policy.maxBytes) throw new FileValidationError("too_large", "The shared file is too large. Choose a smaller file.");
}

/**
 * Spend the token by re-linking the stored file to `purpose` (one-time: the row stops being a shared upload).
 * Runs in the caller's transaction, so a failed submission leaves the shared file usable.
 */
export async function claimSharedUpload(
  token: string,
  target: { purpose: FilePurpose; ownerUserId: string | null; metadata?: Record<string, unknown> },
  tx: DbOrTx,
): Promise<FileRow> {
  const file = await lockSharedUpload(token, tx);
  assertFitsPurpose(file, target.purpose);
  // The shared WhatsApp text stays with the visitor's choice, not with the stored document.
  const kept = { ...(file.metadata ?? {}) } as Record<string, unknown>;
  delete kept.sharedTitle;
  delete kept.sharedText;
  const [row] = await tx
    .update(files)
    .set({
      purpose: target.purpose,
      ownerUserId: target.ownerUserId,
      visibility: "private",
      metadata: { ...kept, ...target.metadata, sharedUploadClaimedAt: new Date().toISOString() },
    })
    .where(eq(files.id, file.id))
    .returning();
  await audit({ action: "file.shared_upload_claimed", entityType: "file", entityId: file.id, metadata: { purpose: target.purpose }, tx });
  return row!;
}

/**
 * Spend the token by taking the file's bytes (e.g. to store them again as a media library image) and deleting the
 * holding file. `mimeTypes` narrows the accepted types (e.g. raster images only). Runs in the caller's transaction.
 */
export async function consumeSharedUpload(
  token: string,
  accepted: { purpose: FilePurpose; mimeTypes?: readonly string[] },
  tx: DbOrTx,
): Promise<{ file: FileRow; data: Buffer }> {
  const file = await lockSharedUpload(token, tx);
  assertFitsPurpose(file, accepted.purpose, accepted.mimeTypes);
  const data = await getStorageDriver(file.storageDriver).getBuffer(file.storageKey);
  if (!data) expired();
  await tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, file.id));
  await enqueueTask("files.expire_shared_upload", { fileId: file.id }, { dedupeKey: `files.expire_shared_upload:consumed:${file.id}`, tx });
  return { file, data };
}

/** Delete an unused shared upload once its time is up (bytes purged at once, the row kept). Idempotent. */
export async function expireSharedUpload(fileId: string, now: Date = new Date()): Promise<"expired" | "claimed" | "not_due" | "missing"> {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return "missing";
  if (file.purpose !== "shared_upload") return "claimed";
  if (!file.deletedAt) {
    if (file.createdAt.getTime() > now.getTime() - SHARED_UPLOAD_TTL_MINUTES * 60_000) return "not_due";
    await db.update(files).set({ deletedAt: now }).where(and(eq(files.id, fileId), isNull(files.deletedAt)));
  }
  await purgeDeletedFile(fileId, { force: true });
  return "expired";
}

/** Shared uploads past their time whose bytes are still stored (safety net for missed expiry tasks). */
export async function listExpiredSharedUploads(limit = 200, now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - SHARED_UPLOAD_TTL_MINUTES * 60_000);
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.purpose, "shared_upload"), lt(files.createdAt, cutoff), sql`not (${files.metadata} ? 'purgedAt')`))
    .limit(limit);
  return rows.map((r) => r.id);
}
