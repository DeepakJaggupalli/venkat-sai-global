import "server-only";

import { and, asc, desc, eq, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { cvSubmissionDocuments, cvSubmissions, files, resumeRequests } from "@/db/schema";
import type { CvSubmissionDocumentKind } from "@/db/schema/cv-submissions";
import { ActionError } from "@/lib/actions";
import { slugify } from "@/lib/http";
import { logDataAccess } from "@/modules/audit";
import { checkFileAccess, type FileRow, type FileViewer } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { buildDocumentPack, type PackItem } from "@/server/pdf/pack";

import { CV_DOCUMENT_KIND_LABELS } from "./cv-submission-schemas";
import { assertStaff } from "./internal";

/**
 * "Download CV pack" / "Download visa pack" for a CV submission: one PDF in the business's order — resume (the
 * generated resume when the candidate used the resume service, else the CV they sent), certificates, licences,
 * other documents, passport cover, passport first page, passport last page, photo on white background.
 * Staff need candidates.view plus candidates.view_documents or recruitment.manage; every file is re-checked with the
 * files module and the download is recorded in the data-access log.
 */

export type PackType = "cv" | "visa";

const PACK_ORDER: readonly CvSubmissionDocumentKind[] = ["certificate", "licence", "other", "passport_cover", "passport_first_page", "passport_last_page", "photo"];
const WORD_TYPES = new Set(["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

export function packTitle(type: PackType): string {
  return type === "visa" ? "Visa pack" : "CV pack";
}

export async function buildCvSubmissionPack(ctx: StaffContext, submissionId: string, type: PackType): Promise<{ bytes: Uint8Array; filename: string } | null> {
  assertStaff(ctx, "candidates.view");
  if (!staffCan(ctx, ["candidates.view_documents", "recruitment.manage"], "any")) throw new ActionError("You do not have permission to open candidate documents.", { code: "forbidden" });
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return null;
  const [submission] = await db.select().from(cvSubmissions).where(eq(cvSubmissions.id, submissionId)).limit(1);
  if (!submission) return null;

  const [cvFile] = await db.select().from(files).where(and(eq(files.id, submission.cvFileId), sql`${files.deletedAt} is null`)).limit(1);
  const [generated] = await db
    .select({ file: files })
    .from(resumeRequests)
    .innerJoin(files, and(eq(files.id, resumeRequests.generatedPdfFileId), sql`${files.deletedAt} is null`))
    .where(and(or(eq(resumeRequests.cvSubmissionId, submission.id), eq(resumeRequests.phone, submission.phone)), isNotNull(resumeRequests.generatedPdfFileId)))
    .orderBy(desc(resumeRequests.generatedAt))
    .limit(1);
  const docs = await db
    .select({ d: cvSubmissionDocuments, file: files })
    .from(cvSubmissionDocuments)
    .innerJoin(files, and(eq(files.id, cvSubmissionDocuments.fileId), sql`${files.deletedAt} is null`))
    .where(eq(cvSubmissionDocuments.submissionId, submission.id))
    .orderBy(asc(cvSubmissionDocuments.sortOrder), asc(cvSubmissionDocuments.createdAt));

  // The staff member's own permissions (already checked above): every file still goes through the files rules.
  const viewer: FileViewer = { userId: ctx.user.id, isStaff: true, staffPermissions: ctx.permissions, memberships: [] };
  const allowed = async (file: FileRow | undefined | null): Promise<FileRow | null> => {
    if (!file) return null;
    const decision = await checkFileAccess(viewer, file);
    return decision.allowed ? file : null;
  };

  const items: PackItem[] = [];
  const generatedFile = await allowed(generated?.file);
  const cv = await allowed(cvFile);
  if (generatedFile) items.push({ kind: "file", label: "Resume", file: generatedFile });
  else if (cv) items.push({ kind: "file", label: WORD_TYPES.has(cv.mimeType) ? "Resume (Word document)" : "Resume", file: cv });
  else items.push({ kind: "note", label: "Resume", text: "The CV is waiting for its security check, or you do not have access to it." });

  for (const kind of PACK_ORDER) {
    for (const { d, file } of docs.filter((x) => x.d.kind === kind)) {
      const ok = await allowed(file);
      if (ok) items.push({ kind: "file", label: CV_DOCUMENT_KIND_LABELS[d.kind], file: ok });
    }
  }

  const title = `${packTitle(type)} - ${submission.name} (${submission.code})`;
  const result = await buildDocumentPack({ title, items });
  await logDataAccess({
    actorUserId: ctx.user.id,
    subjectType: "cv_submission",
    subjectId: submission.id,
    dataCategory: "documents",
    accessType: "download",
    reason: `${packTitle(type)} PDF`,
    metadata: { fileIds: items.flatMap((i) => (i.kind === "file" ? [i.file.id] : [])), pages: result.pageCount, skipped: result.skipped },
  });
  return { bytes: result.bytes, filename: `venkat-sai-${type}-pack-${submission.code.toLowerCase()}-${slugify(submission.name, 40) || "candidate"}.pdf` };
}
