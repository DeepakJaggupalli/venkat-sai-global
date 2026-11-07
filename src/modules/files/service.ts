import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { files } from "@/db/schema";
import type { FilePurpose, FileScanStatus, FileVisibility } from "@/db/schema/_constants";
import { ActionError } from "@/lib/actions";
import { sha256Hex } from "@/lib/crypto";
import { formatFileSize } from "@/lib/format";
import { logger } from "@/lib/logger";
import { audit, logSecurityEvent } from "@/modules/audit";
import { enqueueTask } from "@/server/tasks/queue";

import { createImageVariants, readImageDimensions, sanitizeImage } from "./images";
import { generateStorageKey, isUuid, normalizeOriginalName, variantStorageKey, withExtension } from "./keys";
import { decideMimeType, sniffFileType } from "./mime";
import { getFilePolicy, isRasterImageMime, MIME, type ImageVariantName } from "./policies";
import { isMalwareScanningEnabled, scanBuffer } from "./scan";
import { getStorageDriver, type StoredObject } from "./storage";
import { svgHasActiveContent } from "./svg";
import type { FileRow, FileVariantMap } from "./types";
import { resolveVariant } from "./urls";

/**
 * File storage pipeline and lifecycle.
 *
 * storeFile(): size limit → magic-byte sniffing (extension / declared type must agree, executables,
 * HTML and script-bearing SVG rejected) → malware scan (ClamAV, when configured) → image
 * sanitising (auto-rotate, ALL metadata stripped incl. GPS) + WebP variants → storage driver →
 * `files` row. Infected uploads are quarantined (kept for review, never served) and rejected.
 */

export type FileErrorCode =
  | "empty"
  | "too_large"
  | "type_not_allowed"
  | "type_mismatch"
  | "dangerous"
  | "unknown_type"
  | "invalid_image"
  | "infected"
  | "visibility_not_allowed";

const ERROR_STATUS: Record<FileErrorCode, number> = {
  empty: 400,
  too_large: 413,
  type_not_allowed: 415,
  type_mismatch: 415,
  dangerous: 415,
  unknown_type: 415,
  invalid_image: 422,
  infected: 422,
  visibility_not_allowed: 400,
};

/** Expected, user-facing upload failure (message is safe to show). */
export class FileValidationError extends Error {
  readonly code: FileErrorCode;
  readonly status: number;
  constructor(code: FileErrorCode, message: string) {
    super(message);
    this.name = "FileValidationError";
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

export type StoreFileInput = {
  data: Uint8Array;
  originalName: string;
  /** Type reported by the browser / caller (checked against the content, never trusted alone). */
  declaredMimeType?: string | null;
  purpose: FilePurpose;
  ownerUserId: string | null;
  organizationId?: string | null;
  /** Defaults to the purpose's default visibility; "public" only where the policy allows it. */
  visibility?: FileVisibility;
  /**
   * Defer the malware scan (when scanning is enabled) and image variants to the "files.process"
   * background task (large or bulk files). Metadata stripping still happens immediately.
   * With scanning enabled, non-owners cannot read the file until the scan has completed.
   */
  deferProcessing?: boolean;
  metadata?: Record<string, unknown>;
  /**
   * Insert the row (and enqueue processing) inside a transaction. Storage objects are written
   * before the row; if the transaction later rolls back they become orphans (harmless, unreferenced).
   */
  tx?: DbOrTx;
};

export async function storeFile(input: StoreFileInput): Promise<FileRow> {
  const policy = getFilePolicy(input.purpose);
  const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength);

  if (data.byteLength === 0) throw new FileValidationError("empty", "The file is empty.");
  if (data.byteLength > policy.maxBytes) {
    throw new FileValidationError("too_large", `The file is larger than the ${formatFileSize(policy.maxBytes)} limit.`);
  }

  const visibility = input.visibility ?? policy.defaultVisibility;
  if (visibility === "public" && !policy.allowPublic) {
    throw new FileValidationError("visibility_not_allowed", `${policy.label} files cannot be public.`);
  }

  let originalName = normalizeOriginalName(input.originalName);
  const sniffed = await sniffFileType(data);
  const decision = decideMimeType({ sniffed, declaredMimeType: input.declaredMimeType, fileName: originalName, allowed: policy.allowedMimeTypes, trusted: policy.trusted });
  if (!decision.ok) throw new FileValidationError(decision.code, decision.message);
  const mimeType = decision.mimeType;
  originalName = withExtension(originalName, decision.extension);

  if (mimeType === MIME.svg && svgHasActiveContent(data.toString("utf8"))) {
    throw new FileValidationError("dangerous", "This SVG contains scripts or external references and cannot be used. Export it again without them.");
  }

  const id = randomUUID();
  const now = new Date();
  const key = generateStorageKey(id, now);
  const driver = getStorageDriver();
  const uploadSha256 = sha256Hex(data);

  // --- Malware scan -------------------------------------------------------------------------
  // Server-generated purposes (e.g. data exports) are produced by the platform itself; scanning
  // them adds nothing and large exports would exceed clamd's stream limit.
  const generatedOnly = policy.upload.every((rule) => rule.kind === "system");
  const scanning = isMalwareScanningEnabled() && !generatedOnly;
  let scanStatus: FileScanStatus = scanning ? "pending" : "not_scanned";
  let scanDetail: string | null = null;
  let scannedAt: Date | null = null;
  let deferred = Boolean(input.deferProcessing);
  if (scanning && !input.deferProcessing) {
    const outcome = await scanBuffer(data);
    if (outcome?.status === "clean") {
      scanStatus = "clean";
      scannedAt = new Date();
    } else if (outcome?.status === "infected") {
      scanStatus = "infected";
      scanDetail = outcome.signature;
      scannedAt = new Date();
    } else {
      // Scanner unavailable: keep the file un-servable to others and retry in the background.
      scanDetail = outcome?.status === "error" ? outcome.detail.slice(0, 300) : null;
      deferred = true;
      logger.warn("Malware scan failed at upload; deferring", { fileId: id, purpose: input.purpose, detail: scanDetail });
    }
  }

  const executor = input.tx ?? db;
  const baseRow = {
    id,
    storageDriver: driver.name,
    storageKey: key,
    originalName,
    visibility,
    purpose: input.purpose,
    ownerUserId: input.ownerUserId,
    organizationId: input.organizationId ?? null,
    scanStatus,
    scanDetail,
    scannedAt,
  } satisfies Partial<typeof files.$inferInsert>;

  if (scanStatus === "infected") {
    // Quarantine: keep the raw bytes for review, never process or serve them.
    await driver.put(key, data, { contentType: "application/octet-stream" });
    await executor.insert(files).values({
      ...baseRow,
      mimeType,
      sizeBytes: data.byteLength,
      sha256: uploadSha256,
      metadata: { ...input.metadata, uploadSha256, quarantinedAt: now.toISOString() },
    });
    await logSecurityEvent({ userId: input.ownerUserId, type: "file_quarantined", severity: "warning", metadata: { fileId: id, purpose: input.purpose, signature: scanDetail } });
    await audit({ action: "file.quarantined", entityType: "file", entityId: id, organizationId: input.organizationId ?? null, metadata: { purpose: input.purpose, signature: scanDetail } });
    throw new FileValidationError("infected", "This file failed our security check and was not accepted.");
  }

  // --- Image processing ---------------------------------------------------------------------
  let stored: Buffer = data;
  let width: number | null = null;
  let height: number | null = null;
  let variantOutputs: Awaited<ReturnType<typeof createImageVariants>> = [];
  if (isRasterImageMime(mimeType)) {
    try {
      const sanitized = await sanitizeImage(data, mimeType);
      stored = sanitized.data;
      width = sanitized.width;
      height = sanitized.height;
      if (!deferred) variantOutputs = await createImageVariants(stored, policy.imageVariants);
    } catch (error) {
      logger.warn("Image processing failed", { purpose: input.purpose, error });
      throw new FileValidationError("invalid_image", "We could not read this image. Try exporting it again as JPG or PNG.");
    }
  } else if (mimeType === MIME.svg) {
    const dims = await readImageDimensions(data);
    width = dims?.width ?? null;
    height = dims?.height ?? null;
  }

  // --- Persist -------------------------------------------------------------------------------
  const written: string[] = [];
  try {
    await driver.put(key, stored, { contentType: mimeType });
    written.push(key);
    const variants: FileVariantMap = {};
    for (const v of variantOutputs) {
      const vKey = variantStorageKey(key, v.name);
      await driver.put(vKey, v.data, { contentType: v.mimeType });
      written.push(vKey);
      variants[v.name] = { key: vKey, width: v.width, height: v.height, mimeType: v.mimeType };
    }
    const [row] = await executor
      .insert(files)
      .values({
        ...baseRow,
        mimeType,
        sizeBytes: stored.byteLength,
        sha256: sha256Hex(stored),
        width,
        height,
        variants,
        metadata: {
          ...input.metadata,
          uploadSha256,
          ...(input.declaredMimeType ? { declaredMimeType: input.declaredMimeType.slice(0, 120) } : {}),
          ...(stored !== data ? { metadataStripped: true } : {}),
          processing: deferred ? "pending" : "complete",
        },
      })
      .returning();
    if (deferred) {
      await enqueueTask("files.process", { fileId: id }, { dedupeKey: `files.process:${id}`, tx: input.tx });
    }
    return row!;
  } catch (error) {
    await Promise.allSettled(written.map((k) => driver.delete(k)));
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A file row by id (not soft-deleted). Does NOT check access — use canAccessFile() for that. */
export async function getFile(id: string, tx: DbOrTx = db): Promise<FileRow | null> {
  const normalized = id.trim().toLowerCase();
  if (!isUuid(normalized)) return null;
  const [row] = await tx.select().from(files).where(and(eq(files.id, normalized), isNull(files.deletedAt))).limit(1);
  return row ?? null;
}

/** Several file rows by id (not soft-deleted), in no particular order. Does NOT check access. */
export async function getFiles(ids: readonly string[], tx: DbOrTx = db): Promise<FileRow[]> {
  const valid = [...new Set(ids.map((id) => id.trim().toLowerCase()))].filter(isUuid);
  if (!valid.length) return [];
  return tx.select().from(files).where(and(inArray(files.id, valid), isNull(files.deletedAt)));
}

export type FileExpectation = {
  purposes: readonly FilePurpose[];
  /** The file must be owned by this user… */
  ownerUserId?: string;
  /** …or belong to this organisation (either matches when both are given). */
  organizationId?: string;
};

/**
 * Validate a file id received from a form before linking it to a record: it must exist, have an
 * expected purpose, belong to the acting user/organisation and not be quarantined.
 * Throws ActionError (safe to show) otherwise.
 */
export async function requireUploadedFile(fileId: string, expectation: FileExpectation, tx: DbOrTx = db): Promise<FileRow> {
  const file = await getFile(fileId, tx);
  if (!file) throw new ActionError("The uploaded file could not be found. Please upload it again.");
  if (!expectation.purposes.includes(file.purpose)) throw new ActionError("This file cannot be used here. Please upload it again.");
  if (expectation.ownerUserId || expectation.organizationId) {
    const ownerOk = expectation.ownerUserId ? file.ownerUserId === expectation.ownerUserId : false;
    const orgOk = expectation.organizationId ? file.organizationId === expectation.organizationId : false;
    if (!ownerOk && !orgOk) throw new ActionError("This file cannot be used here. Please upload it again.");
  }
  if (file.scanStatus === "infected") throw new ActionError("This file failed our security check. Please upload a different file.");
  return file;
}

export type FileContent = {
  body: ReadableStream<Uint8Array>;
  size: number | null;
  mimeType: string;
  /** Variant actually served (null = original). */
  variant: ImageVariantName | null;
  /** Strong validator for conditional requests. */
  etag: string;
};

/** Open the bytes of a file (or the best available image variant). Null when the object is missing. */
export async function openFileContent(file: FileRow, requested: ImageVariantName | null): Promise<FileContent | null> {
  const driver = getStorageDriver(file.storageDriver);
  const variants = file.variants as FileVariantMap;
  const variant = isRasterImageMime(file.mimeType) ? resolveVariant(variants, requested) : null;
  let object: StoredObject | null = null;
  if (variant) {
    object = await driver.get(variants[variant]!.key);
    if (object) return { body: object.body, size: object.size, mimeType: variants[variant]!.mimeType, variant, etag: `"${file.sha256.slice(0, 40)}-${variant}"` };
    logger.warn("Image variant missing in storage; serving original", { fileId: file.id, variant });
  }
  object = await driver.get(file.storageKey);
  if (!object) return null;
  return { body: object.body, size: object.size, mimeType: file.mimeType, variant: null, etag: `"${file.sha256.slice(0, 40)}"` };
}

/** Whether downloads should redirect to short-lived presigned S3 URLs (STORAGE_S3_PRESIGNED_DOWNLOADS=true). */
export function presignedDownloadsEnabled(file: Pick<FileRow, "storageDriver">): boolean {
  return file.storageDriver === "s3" && process.env.STORAGE_S3_PRESIGNED_DOWNLOADS === "true";
}

/** Presigned GET URL for a file/variant (S3 only), with the response headers we would have sent. */
export async function presignFileDownload(
  file: FileRow,
  requested: ImageVariantName | null,
  headers: { contentDisposition: string; cacheControl: string; expiresInSeconds?: number },
): Promise<string | null> {
  const driver = getStorageDriver(file.storageDriver);
  if (!driver.presignGet) return null;
  const variants = file.variants as FileVariantMap;
  const variant = isRasterImageMime(file.mimeType) ? resolveVariant(variants, requested) : null;
  const key = variant ? variants[variant]!.key : file.storageKey;
  return driver.presignGet(key, {
    expiresInSeconds: headers.expiresInSeconds ?? 300,
    contentType: variant ? variants[variant]!.mimeType : file.mimeType,
    contentDisposition: headers.contentDisposition,
    cacheControl: headers.cacheControl,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Change a file's visibility (e.g. a candidate publishes a portfolio item). The CALLER authorises
 * the actor; this enforces the purpose policy and audits the change.
 * Note: public URLs are cached for a long time by browsers/CDNs, so making a file private again
 * does not recall copies already fetched.
 */
export async function setFileVisibility(fileId: string, visibility: FileVisibility, opts: { actorUserId: string | null; tx?: DbOrTx }): Promise<FileRow> {
  const executor = opts.tx ?? db;
  const file = await getFile(fileId, executor);
  if (!file) throw new ActionError("File not found.");
  if (visibility === "public" && !getFilePolicy(file.purpose).allowPublic) {
    throw new ActionError(`${getFilePolicy(file.purpose).label} files cannot be made public.`);
  }
  if (file.visibility === visibility) return file;
  const [row] = await executor.update(files).set({ visibility }).where(eq(files.id, fileId)).returning();
  await audit({
    action: "file.visibility_changed",
    entityType: "file",
    entityId: fileId,
    organizationId: file.organizationId,
    metadata: { from: file.visibility, to: visibility, purpose: file.purpose },
    actorUserId: opts.actorUserId,
    tx: opts.tx,
  });
  return row!;
}

/** Grace period before the bytes of a soft-deleted file are purged from storage. */
export const FILE_PURGE_GRACE_DAYS = 30;

/**
 * Soft-delete a file: it stops being served immediately; its bytes are purged from storage after
 * FILE_PURGE_GRACE_DAYS by the "files.purge" task (the row stays for referential integrity).
 * The CALLER authorises the actor (owner, or staff with the right permission).
 */
export async function softDeleteFile(fileId: string, opts: { actorUserId: string | null; reason?: string; tx?: DbOrTx }): Promise<boolean> {
  const executor = opts.tx ?? db;
  const [row] = await executor
    .update(files)
    .set({ deletedAt: new Date() })
    .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
    .returning({ id: files.id, purpose: files.purpose, organizationId: files.organizationId });
  if (!row) return false;
  await enqueueTask(
    "files.purge",
    { fileId },
    { runAt: new Date(Date.now() + FILE_PURGE_GRACE_DAYS * 24 * 3600 * 1000), dedupeKey: `files.purge:${fileId}`, tx: opts.tx },
  );
  await audit({
    action: "file.deleted",
    entityType: "file",
    entityId: fileId,
    organizationId: row.organizationId,
    metadata: { purpose: row.purpose, reason: opts.reason ?? null },
    actorUserId: opts.actorUserId,
    tx: opts.tx,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Background processing (used by tasks.ts)
// ---------------------------------------------------------------------------

export type ProcessFileResult = "missing" | "skipped" | "processed" | "quarantined";

/**
 * Deferred processing for one file: malware scan when still pending, plus any image variants
 * the policy wants that do not exist yet. Idempotent. Throws when the scanner is unavailable so
 * the task is retried with backoff.
 */
export async function processStoredFile(fileId: string): Promise<ProcessFileResult> {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file || file.deletedAt) return "missing";
  if (file.scanStatus === "infected") return "skipped";

  const driver = getStorageDriver(file.storageDriver);
  const data = await driver.getBuffer(file.storageKey);
  if (!data) throw new Error(`Stored object missing for file ${fileId}`);

  if ((file.scanStatus === "pending" || file.scanStatus === "error") && isMalwareScanningEnabled()) {
    const outcome = await scanBuffer(data);
    if (outcome?.status === "infected") {
      const variants = file.variants as FileVariantMap;
      await Promise.allSettled(Object.values(variants).map((v) => (v ? driver.delete(v.key) : Promise.resolve())));
      await db
        .update(files)
        .set({ scanStatus: "infected", scanDetail: outcome.signature, scannedAt: new Date(), variants: {}, metadata: sql`${files.metadata} || ${JSON.stringify({ quarantinedAt: new Date().toISOString() })}::jsonb` })
        .where(eq(files.id, fileId));
      await logSecurityEvent({ userId: file.ownerUserId, type: "file_quarantined", severity: "warning", metadata: { fileId, purpose: file.purpose, signature: outcome.signature } });
      await audit({ action: "file.quarantined", entityType: "file", entityId: fileId, organizationId: file.organizationId, actorType: "system", metadata: { purpose: file.purpose, signature: outcome.signature } });
      return "quarantined";
    }
    if (outcome?.status !== "clean") {
      const detail = outcome?.status === "error" ? outcome.detail : "Malware scanner not available";
      await db.update(files).set({ scanStatus: "error", scanDetail: detail.slice(0, 300) }).where(eq(files.id, fileId));
      throw new Error(`Malware scan failed for file ${fileId}: ${detail}`);
    }
    await db.update(files).set({ scanStatus: "clean", scanDetail: null, scannedAt: new Date() }).where(eq(files.id, fileId));
  } else if ((file.scanStatus === "pending" || file.scanStatus === "error") && !isMalwareScanningEnabled()) {
    // Scanning was switched off after upload: release the file as not scanned.
    await db.update(files).set({ scanStatus: "not_scanned", scanDetail: null }).where(eq(files.id, fileId));
  }

  if (isRasterImageMime(file.mimeType)) {
    const wanted = getFilePolicy(file.purpose).imageVariants;
    const existing = file.variants as FileVariantMap;
    // Variants are generated once as a set (small originals legitimately skip the larger sizes).
    if (wanted.length && Object.keys(existing).length === 0) {
      const outputs = await createImageVariants(data, wanted);
      const variants: FileVariantMap = {};
      for (const v of outputs) {
        const vKey = variantStorageKey(file.storageKey, v.name);
        await driver.put(vKey, v.data, { contentType: v.mimeType });
        variants[v.name] = { key: vKey, width: v.width, height: v.height, mimeType: v.mimeType };
      }
      await db.update(files).set({ variants }).where(eq(files.id, fileId));
    }
  }
  await db
    .update(files)
    .set({ metadata: sql`${files.metadata} || ${JSON.stringify({ processing: "complete" })}::jsonb` })
    .where(eq(files.id, fileId));
  return "processed";
}

/**
 * Remove the stored bytes (original + variants) of a soft-deleted file once the grace period has
 * passed. The row is kept (with metadata.purgedAt) because business records may reference it.
 */
export async function purgeDeletedFile(fileId: string, opts: { force?: boolean } = {}): Promise<"purged" | "not_deleted" | "not_due" | "already_purged"> {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file || !file.deletedAt) return "not_deleted";
  if ((file.metadata as Record<string, unknown>).purgedAt) return "already_purged";
  if (!opts.force && file.deletedAt.getTime() > Date.now() - FILE_PURGE_GRACE_DAYS * 24 * 3600 * 1000 + 60_000) return "not_due";
  const driver = getStorageDriver(file.storageDriver);
  const variants = file.variants as FileVariantMap;
  await driver.delete(file.storageKey);
  for (const v of Object.values(variants)) if (v) await driver.delete(v.key);
  await db
    .update(files)
    .set({ variants: {}, metadata: sql`${files.metadata} || ${JSON.stringify({ purgedAt: new Date().toISOString() })}::jsonb` })
    .where(eq(files.id, fileId));
  return "purged";
}

/** Soft-deleted files whose bytes are due for purging (safety net for missed purge tasks). */
export async function listFilesDueForPurge(limit = 200): Promise<string[]> {
  const cutoff = new Date(Date.now() - FILE_PURGE_GRACE_DAYS * 24 * 3600 * 1000);
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(lt(files.deletedAt, cutoff), sql`not (${files.metadata} ? 'purgedAt')`))
    .limit(limit);
  return rows.map((r) => r.id);
}
