import "server-only";

import { and, asc, count, eq, gt, lt, desc, sql } from "drizzle-orm";

import { db } from "@/db";
import { cvSubmissionDocuments, cvSubmissions, files } from "@/db/schema";
import type { CvSubmissionDocumentKind } from "@/db/schema/cv-submissions";
import { ActionError } from "@/lib/actions";
import { absoluteUrl } from "@/lib/env";
import { audit } from "@/modules/audit";
import { FileValidationError, fileUrl, softDeleteFile, storeFile, thumbnailUrl } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { cvDocumentUploadPath, issueCvDocumentUploadToken, readCvDocumentUploadToken } from "./cv-document-tokens";
import { CV_DOCUMENT_KIND_LABELS, CV_DOCUMENT_MAX_BYTES, CV_DOCUMENT_MAX_PER_SUBMISSION, CV_DOCUMENT_SINGLE_KINDS } from "./cv-submission-schemas";
import { assertStaff, enforceRateLimits } from "./internal";

/**
 * Further documents for a CV submission (certificates, licences, passport pages, photo), one file per upload so a
 * request never approaches the 4.5 MB body limit. Candidates add them through a signed link (no account); staff with
 * candidates.manage add, reorder and delete them on /admin/cv-submissions/[id]. Files are private
 * (`cv_submission_document`): staff read them with candidates.view_documents or recruitment.manage, logged by the
 * files module.
 */

export type CvDocumentUpload = { data: Uint8Array; name: string; type: string | null };

export type CvDocumentUploader = { kind: "candidate"; token: string; ipHash: string | null } | { kind: "staff"; ctx: StaffContext };

export type CvSubmissionDocumentItem = {
  id: string;
  kind: CvSubmissionDocumentKind;
  kindLabel: string;
  sortOrder: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: Date;
  uploadedByStaff: boolean;
  /** Authorised, logged URLs (null when the viewer may not open documents or the scan has not passed). */
  url: string | null;
  thumbnailUrl: string | null;
  blocked: boolean;
};

const DOC_VIEW = ["candidates.view_documents", "recruitment.manage"] as const;

/** The submission behind an upload link (null when the link is invalid, expired or the submission is gone). */
export async function resolveCvDocumentLink(token: string | null | undefined): Promise<{ id: string; code: string; firstName: string; expiresAt: Date } | null> {
  const claims = readCvDocumentUploadToken(token);
  if (!claims) return null;
  const [row] = await db.select({ id: cvSubmissions.id, code: cvSubmissions.code, name: cvSubmissions.name }).from(cvSubmissions).where(eq(cvSubmissions.id, claims.submissionId)).limit(1);
  if (!row) return null;
  return { id: row.id, code: row.code, firstName: row.name.trim().split(/\s+/)[0] ?? "", expiresAt: claims.expiresAt };
}

/** What the candidate already sent through the link: kinds and file names only (no file access). */
export async function listDocumentsForLink(submissionId: string): Promise<{ kind: CvSubmissionDocumentKind; kindLabel: string; fileName: string }[]> {
  const rows = await db
    .select({ kind: cvSubmissionDocuments.kind, name: files.originalName })
    .from(cvSubmissionDocuments)
    .innerJoin(files, eq(files.id, cvSubmissionDocuments.fileId))
    .where(and(eq(cvSubmissionDocuments.submissionId, submissionId), sql`${files.deletedAt} is null`))
    .orderBy(asc(cvSubmissionDocuments.createdAt));
  return rows.map((r) => ({ kind: r.kind, kindLabel: CV_DOCUMENT_KIND_LABELS[r.kind], fileName: r.name }));
}

/**
 * Add one document. Candidates: valid link + rate limits (per submission and per IP). Staff: candidates.manage.
 * Single kinds (passport pages, photo) replace the previous file; certificates, licences and "other" accumulate.
 */
export async function addCvSubmissionDocument(uploader: CvDocumentUploader, input: { submissionId?: string; kind: CvSubmissionDocumentKind; upload: CvDocumentUpload | null }): Promise<CvSubmissionDocumentItem> {
  let submissionId: string;
  let actorUserId: string | null = null;
  if (uploader.kind === "candidate") {
    const link = await resolveCvDocumentLink(uploader.token);
    if (!link) throw new ActionError("This upload link has expired. Please ask us on WhatsApp for a new link.", { code: "link_expired" });
    submissionId = link.id;
    await enforceRateLimits(
      [
        { key: `cvdoc:sub:${submissionId}`, limit: 30, windowSeconds: 3600 },
        ...(uploader.ipHash ? [{ key: `cvdoc:ip:${uploader.ipHash}`, limit: 60, windowSeconds: 3600 }] : []),
      ],
      "You have uploaded many files in a short time. Please wait a little, or send the rest on WhatsApp.",
    );
  } else {
    assertStaff(uploader.ctx, "candidates.manage");
    if (!input.submissionId) throw new ActionError("This CV submission could not be found.");
    submissionId = input.submissionId;
    actorUserId = uploader.ctx.user.id;
  }

  const upload = input.upload;
  if (!upload || upload.data.byteLength === 0) throw new ActionError("Choose a file to upload.", { fieldErrors: { file: ["Choose a file to upload"] } });
  if (upload.data.byteLength > CV_DOCUMENT_MAX_BYTES) throw new ActionError("The file is larger than 4 MB. Take a photo instead, or send a smaller file.", { fieldErrors: { file: ["The file is larger than 4 MB"] } });

  try {
    return await db.transaction(async (tx) => {
      const [submission] = await tx.select({ id: cvSubmissions.id, code: cvSubmissions.code }).from(cvSubmissions).where(eq(cvSubmissions.id, submissionId)).for("update").limit(1);
      if (!submission) throw new ActionError("This CV submission could not be found.");
      const [{ value: existing } = { value: 0 }] = await tx.select({ value: count() }).from(cvSubmissionDocuments).where(eq(cvSubmissionDocuments.submissionId, submission.id));
      const single = CV_DOCUMENT_SINGLE_KINDS.includes(input.kind);
      const previous = single
        ? await tx
            .select({ id: cvSubmissionDocuments.id, fileId: cvSubmissionDocuments.fileId })
            .from(cvSubmissionDocuments)
            .where(and(eq(cvSubmissionDocuments.submissionId, submission.id), eq(cvSubmissionDocuments.kind, input.kind)))
        : [];
      if (existing - previous.length >= CV_DOCUMENT_MAX_PER_SUBMISSION) throw new ActionError(`Up to ${CV_DOCUMENT_MAX_PER_SUBMISSION} documents can be added. Send the rest on WhatsApp.`);

      const file = await storeFile({
        data: upload.data,
        originalName: upload.name || `${input.kind}`,
        declaredMimeType: upload.type,
        purpose: "cv_submission_document",
        ownerUserId: null,
        visibility: "private",
        metadata: { source: uploader.kind === "candidate" ? "upload_link" : "staff", reference: submission.code, kind: input.kind },
        tx,
      });
      for (const p of previous) {
        await tx.delete(cvSubmissionDocuments).where(eq(cvSubmissionDocuments.id, p.id));
        await softDeleteFile(p.fileId, { actorUserId, reason: "Replaced by a newer upload", tx });
      }
      const [{ next } = { next: 0 }] = await tx
        .select({ next: sql<number>`coalesce(max(${cvSubmissionDocuments.sortOrder}) + 1, 0)::int` })
        .from(cvSubmissionDocuments)
        .where(and(eq(cvSubmissionDocuments.submissionId, submission.id), eq(cvSubmissionDocuments.kind, input.kind)));
      const [row] = await tx
        .insert(cvSubmissionDocuments)
        .values({ submissionId: submission.id, kind: input.kind, fileId: file.id, sortOrder: next, uploadedByUserId: actorUserId })
        .returning();
      await tx.update(cvSubmissions).set({ updatedAt: new Date() }).where(eq(cvSubmissions.id, submission.id));
      await audit({
        action: "cv_submission.document_added",
        entityType: "cv_submission",
        entityId: submission.id,
        actorUserId,
        metadata: { kind: input.kind, fileId: file.id, via: uploader.kind, replaced: previous.length, scanStatus: file.scanStatus },
        tx,
      });
      const blocked = file.scanStatus === "infected" || file.scanStatus === "pending" || file.scanStatus === "error";
      return {
        id: row!.id,
        kind: row!.kind,
        kindLabel: CV_DOCUMENT_KIND_LABELS[row!.kind],
        sortOrder: row!.sortOrder,
        fileName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: row!.createdAt,
        uploadedByStaff: actorUserId !== null,
        url: null,
        thumbnailUrl: null,
        blocked,
      };
    });
  } catch (error) {
    if (error instanceof FileValidationError) throw new ActionError(error.message, { fieldErrors: { file: [error.message] } });
    throw error;
  }
}

/** Documents of one submission for staff (candidates.view). URLs only with a document permission (reads logged). */
export async function listCvSubmissionDocuments(ctx: StaffContext, submissionId: string): Promise<CvSubmissionDocumentItem[]> {
  assertStaff(ctx, "candidates.view");
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return [];
  const canOpen = staffCan(ctx, [...DOC_VIEW], "any");
  const rows = await db
    .select({ d: cvSubmissionDocuments, file: files })
    .from(cvSubmissionDocuments)
    .innerJoin(files, eq(files.id, cvSubmissionDocuments.fileId))
    .where(and(eq(cvSubmissionDocuments.submissionId, submissionId), sql`${files.deletedAt} is null`))
    .orderBy(asc(cvSubmissionDocuments.sortOrder), asc(cvSubmissionDocuments.createdAt));
  const order = new Map(Object.keys(CV_DOCUMENT_KIND_LABELS).map((k, i) => [k, i]));
  return rows
    .map(({ d, file }): CvSubmissionDocumentItem => {
      const blocked = file.scanStatus === "infected" || file.scanStatus === "pending" || file.scanStatus === "error";
      return {
        id: d.id,
        kind: d.kind,
        kindLabel: CV_DOCUMENT_KIND_LABELS[d.kind],
        sortOrder: d.sortOrder,
        fileName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: d.createdAt,
        uploadedByStaff: d.uploadedByUserId !== null,
        url: canOpen && !blocked ? fileUrl(file) : null,
        thumbnailUrl: canOpen && !blocked ? thumbnailUrl(file) : null,
        blocked,
      };
    })
    .sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) || a.sortOrder - b.sortOrder);
}

/** Move a certificate / licence / other document up or down within its kind (candidates.manage). */
export async function moveCvSubmissionDocument(ctx: StaffContext, input: { id: string; direction: "up" | "down" }): Promise<{ submissionId: string }> {
  assertStaff(ctx, "candidates.manage");
  return db.transaction(async (tx) => {
    const [doc] = await tx.select().from(cvSubmissionDocuments).where(eq(cvSubmissionDocuments.id, input.id)).for("update").limit(1);
    if (!doc) throw new ActionError("This document could not be found.");
    const siblings = await tx
      .select()
      .from(cvSubmissionDocuments)
      .where(
        and(
          eq(cvSubmissionDocuments.submissionId, doc.submissionId),
          eq(cvSubmissionDocuments.kind, doc.kind),
          input.direction === "up" ? lt(cvSubmissionDocuments.sortOrder, doc.sortOrder) : gt(cvSubmissionDocuments.sortOrder, doc.sortOrder),
        ),
      )
      .orderBy(input.direction === "up" ? desc(cvSubmissionDocuments.sortOrder) : asc(cvSubmissionDocuments.sortOrder))
      .limit(1);
    const neighbour = siblings[0];
    if (!neighbour) return { submissionId: doc.submissionId };
    await tx.update(cvSubmissionDocuments).set({ sortOrder: neighbour.sortOrder }).where(eq(cvSubmissionDocuments.id, doc.id));
    await tx.update(cvSubmissionDocuments).set({ sortOrder: doc.sortOrder }).where(eq(cvSubmissionDocuments.id, neighbour.id));
    await audit({ action: "cv_submission.documents_reordered", entityType: "cv_submission", entityId: doc.submissionId, actorUserId: ctx.user.id, metadata: { documentId: doc.id, direction: input.direction }, tx });
    return { submissionId: doc.submissionId };
  });
}

/** Remove a document (candidates.manage). The file stops being served at once and is purged later. */
export async function deleteCvSubmissionDocument(ctx: StaffContext, input: { id: string }): Promise<{ submissionId: string }> {
  assertStaff(ctx, "candidates.manage");
  return db.transaction(async (tx) => {
    const [doc] = await tx.select().from(cvSubmissionDocuments).where(eq(cvSubmissionDocuments.id, input.id)).for("update").limit(1);
    if (!doc) throw new ActionError("This document could not be found.");
    await tx.delete(cvSubmissionDocuments).where(eq(cvSubmissionDocuments.id, doc.id));
    await softDeleteFile(doc.fileId, { actorUserId: ctx.user.id, reason: "Removed from a CV submission", tx });
    await audit({ action: "cv_submission.document_removed", entityType: "cv_submission", entityId: doc.submissionId, actorUserId: ctx.user.id, metadata: { kind: doc.kind, fileId: doc.fileId }, tx });
    return { submissionId: doc.submissionId };
  });
}

/** A fresh 7-day upload link for staff to send on WhatsApp (candidates.manage, audited without the token). */
export async function issueCvDocumentUploadLink(ctx: StaffContext, submissionId: string): Promise<{ url: string; expiresAt: Date }> {
  assertStaff(ctx, "candidates.manage");
  const [row] = await db.select({ id: cvSubmissions.id }).from(cvSubmissions).where(eq(cvSubmissions.id, submissionId)).limit(1);
  if (!row) throw new ActionError("This CV submission could not be found.");
  const { token, expiresAt } = issueCvDocumentUploadToken(row.id, "staff_link");
  await audit({ action: "cv_submission.upload_link_issued", entityType: "cv_submission", entityId: row.id, actorUserId: ctx.user.id, metadata: { expiresAt: expiresAt.toISOString() } });
  return { url: absoluteUrl(cvDocumentUploadPath(token)), expiresAt };
}
