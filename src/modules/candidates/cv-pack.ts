import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { candidateCredentials, candidateDocuments, candidateProfiles, files, resumeRequests, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { slugify } from "@/lib/http";
import { logDataAccess } from "@/modules/audit";
import { checkFileAccess, type FileRow, type FileViewer } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { buildDocumentPack, type PackItem } from "@/server/pdf/pack";

/**
 * CV pack / visa pack for a candidate profile (admin candidate page), from the candidate's own documents in the
 * business's order: resume (a generated resume from the resume service for the same phone number when present, else
 * the profile resume, else a "resume" document), certificates (credentials and education / experience documents),
 * licences, passport documents, photo. Staff need candidates.view_documents; every file is re-checked with the files
 * module and the download is logged against the candidate.
 */

export type CandidatePackType = "cv" | "visa";

const CERTIFICATE_CREDENTIALS = ["certificate", "qualification", "training_completion", "skill_test"] as const;
const CERTIFICATE_DOCUMENTS = ["education_certificate", "experience_letter"] as const;

export async function buildCandidatePack(ctx: StaffContext, candidateId: string, type: CandidatePackType): Promise<{ bytes: Uint8Array; filename: string } | null> {
  if (!staffCan(ctx, ["candidates.view", "candidates.view_documents"])) throw new ActionError("You do not have permission to open candidate documents.", { code: "forbidden" });
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return null;
  const [profile] = await db
    .select({ id: candidateProfiles.id, userId: candidateProfiles.userId, resumeFileId: candidateProfiles.resumeFileId, photoFileId: candidateProfiles.photoFileId, name: users.displayName, legalName: candidateProfiles.legalName, phone: users.phone })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!profile) return null;

  const [documents, credentials, generated] = await Promise.all([
    db
      .select({ type: candidateDocuments.documentType, title: candidateDocuments.title, file: files })
      .from(candidateDocuments)
      .innerJoin(files, and(eq(files.id, candidateDocuments.fileId), sql`${files.deletedAt} is null`))
      .where(and(eq(candidateDocuments.candidateId, profile.id), isNull(candidateDocuments.deletedAt)))
      .orderBy(asc(candidateDocuments.createdAt)),
    db
      .select({ type: candidateCredentials.credentialType, name: candidateCredentials.name, file: files })
      .from(candidateCredentials)
      .innerJoin(files, and(eq(files.id, candidateCredentials.fileId), sql`${files.deletedAt} is null`))
      .where(and(eq(candidateCredentials.candidateId, profile.id), isNull(candidateCredentials.deletedAt)))
      .orderBy(asc(candidateCredentials.issuedAt), asc(candidateCredentials.createdAt)),
    profile.phone
      ? db
          .select({ file: files })
          .from(resumeRequests)
          .innerJoin(files, and(eq(files.id, resumeRequests.generatedPdfFileId), sql`${files.deletedAt} is null`))
          .where(and(eq(resumeRequests.phone, profile.phone), isNotNull(resumeRequests.generatedPdfFileId)))
          .orderBy(desc(resumeRequests.generatedAt))
          .limit(1)
      : Promise.resolve([] as { file: FileRow }[]),
  ]);
  const profileFiles = await db
    .select()
    .from(files)
    .where(and(inArray(files.id, [profile.resumeFileId, profile.photoFileId].filter((v): v is string => Boolean(v)).concat(["00000000-0000-0000-0000-000000000000"])), sql`${files.deletedAt} is null`));
  const byId = new Map(profileFiles.map((f) => [f.id, f]));

  // The staff member's own permissions (already checked above): every file still goes through the files rules.
  const viewer: FileViewer = { userId: ctx.user.id, isStaff: true, staffPermissions: ctx.permissions, memberships: [] };
  const allowed = async (file: FileRow | undefined | null): Promise<FileRow | null> => {
    if (!file) return null;
    return (await checkFileAccess(viewer, file)).allowed ? file : null;
  };

  const items: PackItem[] = [];
  const resume =
    (await allowed(generated[0]?.file)) ??
    (await allowed(profile.resumeFileId ? byId.get(profile.resumeFileId) : null)) ??
    (await allowed(documents.find((d) => d.type === "resume")?.file));
  items.push(resume ? { kind: "file", label: "Resume", file: resume } : { kind: "note", label: "Resume", text: "No resume has been uploaded for this candidate yet." });

  const push = async (label: string, file: FileRow) => {
    const ok = await allowed(file);
    if (ok) items.push({ kind: "file", label, file: ok });
  };
  for (const c of credentials.filter((c) => (CERTIFICATE_CREDENTIALS as readonly string[]).includes(c.type))) await push(c.name || "Certificate", c.file);
  for (const d of documents.filter((d) => (CERTIFICATE_DOCUMENTS as readonly string[]).includes(d.type))) await push(d.title || "Certificate", d.file);
  for (const c of credentials.filter((c) => c.type === "licence")) await push(c.name || "Licence", c.file);
  for (const d of documents.filter((d) => d.type === "passport")) await push(d.title || "Passport", d.file);
  const photo = (profile.photoFileId ? byId.get(profile.photoFileId) : undefined) ?? documents.find((d) => d.type === "photo")?.file;
  if (photo) await push("Photo", photo);

  const name = profile.legalName || profile.name;
  const result = await buildDocumentPack({ title: `${type === "visa" ? "Visa pack" : "CV pack"} - ${name}`, items });
  await logDataAccess({
    actorUserId: ctx.user.id,
    subjectType: "candidate",
    subjectId: profile.id,
    subjectUserId: profile.userId,
    dataCategory: "documents",
    accessType: "download",
    reason: `${type === "visa" ? "Visa pack" : "CV pack"} PDF`,
    metadata: { fileIds: items.flatMap((i) => (i.kind === "file" ? [i.file.id] : [])), pages: result.pageCount, skipped: result.skipped },
  });
  return { bytes: result.bytes, filename: `venkat-sai-${type}-pack-${slugify(name, 50) || "candidate"}.pdf` };
}
