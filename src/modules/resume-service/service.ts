import "server-only";

import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import sharp from "sharp";

import { db, type DbOrTx } from "@/db";
import { cvSubmissions, resumeRequests, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { encryptField, tryDecryptField } from "@/lib/crypto";
import { nextCode } from "@/lib/codes";
import { absoluteUrl } from "@/lib/env";
import { slugify, paginated, type PageQuery, type Paginated } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { signToken, verifyToken } from "@/lib/signed-token";
import { audit, logDataAccess, logSecurityEvent } from "@/modules/audit";
import { FileValidationError, fileUrl, getFile, openFileContent, softDeleteFile, storeFile, thumbnailUrl, type FileContent, type FileRow } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";
import { notifyBusinessInbox } from "@/modules/operations/business-inbox";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import { getResumePaymentMode } from "./payment";
import { hasFixedPrice, requestPriceLabel, resumePriceLabel } from "./price";
import { renderResumeDocx } from "./render/docx";
import { renderResumePdf } from "./render/pdf";
import {
  RESUME_PHOTO_MAX_BYTES,
  RESUME_REQUEST_STATUS_LABELS,
  resumeDetailsSchema,
  type ResumeDetails,
  type ResumeRequestFilters,
  type ResumeRequestInput,
  type ResumeRequestResult,
  type ResumeRequestStatus,
  type ResumeServicePrice,
} from "./schemas";

/**
 * "Prepare my resume" — a paid resume-writing service (never a placement fee). Candidates submit their details on
 * /resume-service; staff with candidates.manage work the list at /admin/resume-requests: collect the payment offline
 * (or waive it), which generates the DOCX and PDF in the business's own layout, then share a private download link.
 * Every staff read of the details and every candidate download is recorded in the data-access log.
 */

export const RESUME_ADMIN_PATH = "/admin/resume-requests";
export const RESUME_DOWNLOAD_PURPOSE = "resume_download";
export const RESUME_DOWNLOAD_LINK_DAYS = 30;

export type ResumeUpload = { data: Uint8Array; name: string; type: string | null };

const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);

function staffOnly(ctx: StaffContext): void {
  if (!staffCan(ctx, "candidates.manage")) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

/** The passport number never sits in the JSON: it is stored encrypted (+ last 4) like on candidate profiles. */
function splitPassport(details: ResumeDetails): { stored: ResumeDetails; passportNumberEncrypted: string | null; passportNumberLast4: string | null } {
  const number = details.passport.number?.trim() || null;
  const { number: _omit, ...passport } = details.passport;
  void _omit;
  return { stored: { ...details, passport }, passportNumberEncrypted: number ? encryptField(number) : null, passportNumberLast4: number ? number.slice(-4) : null };
}

/** Stored details with the decrypted passport number merged back (only to render or edit). */
function withPassport(row: { details: unknown; passportNumberEncrypted: string | null }): unknown {
  const details = (row.details ?? {}) as Record<string, unknown>;
  const number = tryDecryptField(row.passportNumberEncrypted);
  if (!number) return details;
  return { ...details, passport: { ...((details.passport as Record<string, unknown> | undefined) ?? {}), number } };
}

function parseDetails(value: unknown): ResumeDetails {
  const parsed = resumeDetailsSchema.safeParse(value);
  if (!parsed.success) throw new ActionError("The saved resume details are incomplete. Edit the details and save them again.");
  return parsed.data;
}

export async function getResumeServicePrice(): Promise<ResumeServicePrice> {
  const value = (await getSetting("resume_service.price")) as Partial<ResumeServicePrice> | null;
  return { amountMinor: Math.max(0, Math.round(Number(value?.amountMinor ?? 0)) || 0), currency: String(value?.currency ?? "").toUpperCase() };
}

/** Public request from /resume-service. Honeypot hits are dropped silently; rate limited per IP and phone. */
export async function createResumeRequest(input: ResumeRequestInput, photo: ResumeUpload | null, meta: { ipHash: string | null }): Promise<ResumeRequestResult> {
  const price = await getResumeServicePrice();
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "resume_service" } });
    return { code: null, name: input.details.name, status: null, priceLabel: resumePriceLabel(price) };
  }
  if (!(await isFeatureEnabled("services.resume_writing"))) throw new ActionError("The resume service is not available at the moment. Please contact us on WhatsApp.");
  if (!input.consentToContact) throw new ActionError("Please check the highlighted fields.", { fieldErrors: { consentToContact: ["Please agree that we may call or WhatsApp you about your resume"] } });
  if (photo && photo.data.byteLength > RESUME_PHOTO_MAX_BYTES) throw new ActionError("The photo is larger than 4 MB.", { fieldErrors: { photo: ["The photo is larger than 4 MB"] } });
  if (photo && photo.type && !PHOTO_TYPES.has(photo.type)) throw new ActionError("The photo must be a JPG or PNG image.", { fieldErrors: { photo: ["Choose a JPG or PNG photo"] } });

  const details = input.details;
  const split = splitPassport(details);
  const limits = [
    ...(meta.ipHash ? [{ key: `resume:ip:${meta.ipHash}`, limit: 5, windowSeconds: 3600 }] : []),
    { key: `resume:phone:${details.contactPhone}`, limit: 3, windowSeconds: 24 * 3600 },
  ];
  for (const l of limits) {
    if (!(await rateLimit(l.key, l.limit, l.windowSeconds)).allowed) throw new ActionError("You have sent several requests in a short time. Please wait, or message us on WhatsApp.", { code: "rate_limited" });
  }

  const [mode, policyVersion, [submission]] = await Promise.all([
    getResumePaymentMode(),
    getSetting("privacy.policy_version"),
    db.select({ id: cvSubmissions.id }).from(cvSubmissions).where(eq(cvSubmissions.phone, details.contactPhone)).orderBy(desc(cvSubmissions.createdAt)).limit(1),
  ]);
  // Online checkout is not switched on yet: every request waits for an offline payment (see ./payment.ts).
  const status: ResumeRequestStatus = "awaiting_payment";

  try {
    return await db.transaction(async (tx) => {
      const code = await nextCode("RES", { tx });
      const stored = photo && photo.data.byteLength
        ? await storeFile({ data: photo.data, originalName: photo.name || "photo.jpg", declaredMimeType: photo.type, purpose: "resume_service", ownerUserId: null, visibility: "private", metadata: { source: "resume_service", reference: code, role: "photo" }, tx })
        : null;
      const fixed = hasFixedPrice(price);
      const [row] = await tx
        .insert(resumeRequests)
        .values({
          code,
          status,
          name: details.name,
          phone: details.contactPhone,
          email: details.email ?? null,
          details: split.stored,
          passportNumberEncrypted: split.passportNumberEncrypted,
          passportNumberLast4: split.passportNumberLast4,
          candidateNotes: input.candidateNotes || null,
          photoFileId: stored?.id ?? null,
          priceAmountMinor: fixed ? price.amountMinor : null,
          priceCurrency: fixed ? price.currency : null,
          cvSubmissionId: submission?.id ?? null,
          consentToContact: true,
          privacyNoticeVersion: policyVersion,
          ipHash: meta.ipHash,
        })
        .returning({ id: resumeRequests.id });
      await audit({ action: "resume_request.received", entityType: "resume_request", entityId: row!.id, metadata: { code, paymentMode: mode, priced: fixed, photo: Boolean(stored) }, tx });
      const priceLabel = requestPriceLabel(fixed ? price.amountMinor : null, fixed ? price.currency : null);
      const data = { code, name: details.name, post: details.postAppliedFor, price: priceLabel, statusLabel: RESUME_REQUEST_STATUS_LABELS[status] };
      await notifyStaff({ event: "resume.requested", permission: "candidates.manage", data: { ...data, forStaff: true }, link: `${RESUME_ADMIN_PATH}/${row!.id}`, channels: ["in_app"] }, { tx });
      await notifyBusinessInbox({ event: "resume.requested", data: { ...data, phone: details.contactPhone }, link: `${RESUME_ADMIN_PATH}/${row!.id}` }, tx);
      return { code, name: details.name, status, priceLabel };
    });
  } catch (error) {
    if (error instanceof FileValidationError) throw new ActionError(error.message, { fieldErrors: { photo: [error.message] } });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type ResumeRequestListItem = {
  id: string;
  code: string;
  status: ResumeRequestStatus;
  name: string;
  phone: string;
  postAppliedFor: string;
  priceLabel: string;
  paymentReference: string | null;
  candidateNotes: string | null;
  staffNotes: string | null;
  createdAt: Date;
  generatedAt: Date | null;
};

function listConditions(filters: ResumeRequestFilters): SQL | undefined {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(resumeRequests.status, filters.status));
  if (filters.q) {
    const p = `%${filters.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(resumeRequests.name, p), ilike(resumeRequests.code, p), ilike(resumeRequests.phone, p))!);
  }
  return where.length ? and(...where) : undefined;
}

export async function listResumeRequests(ctx: StaffContext, filters: ResumeRequestFilters, page: PageQuery): Promise<Paginated<ResumeRequestListItem>> {
  staffOnly(ctx);
  const condition = listConditions(filters);
  const [rows, totals] = await Promise.all([
    db.select().from(resumeRequests).where(condition).orderBy(desc(resumeRequests.createdAt)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(resumeRequests).where(condition),
  ]);
  const items = rows.map(
    (r): ResumeRequestListItem => ({
      id: r.id,
      code: r.code,
      status: r.status,
      name: r.name,
      phone: r.phone,
      postAppliedFor: String((r.details as { postAppliedFor?: unknown })?.postAppliedFor ?? ""),
      priceLabel: requestPriceLabel(r.priceAmountMinor, r.priceCurrency),
      paymentReference: r.paymentReference,
      candidateNotes: r.candidateNotes,
      staffNotes: r.staffNotes,
      createdAt: r.createdAt,
      generatedAt: r.generatedAt,
    }),
  );
  if (items.length) {
    await logDataAccess({ actorUserId: ctx.user.id, subjectType: "resume_request", subjectId: "list", dataCategory: "contact", accessType: "view", reason: "Resume requests list", metadata: { codes: items.map((i) => i.code) } });
  }
  return paginated(items, totals[0]?.value ?? 0, page);
}

export async function resumeRequestCounts(ctx: StaffContext): Promise<Record<ResumeRequestStatus, number>> {
  staffOnly(ctx);
  const rows = await db.select({ status: resumeRequests.status, value: count() }).from(resumeRequests).groupBy(resumeRequests.status);
  const out = Object.fromEntries(Object.keys(RESUME_REQUEST_STATUS_LABELS).map((k) => [k, 0])) as Record<ResumeRequestStatus, number>;
  for (const r of rows) out[r.status] = r.value;
  return out;
}

type FileLink = { name: string; url: string; thumbnailUrl: string | null } | null;

export type ResumeRequestDetail = ResumeRequestListItem & {
  details: ResumeDetails | null;
  rawDetails: unknown;
  email: string | null;
  priceAmountMinor: number | null;
  priceCurrency: string | null;
  paymentMethod: string | null;
  paidAt: Date | null;
  paymentRecordedByName: string | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  notesUpdatedAt: Date | null;
  cvSubmissionId: string | null;
  photo: FileLink;
  docx: FileLink;
  pdf: FileLink;
};

function link(file: FileRow | null | undefined): FileLink {
  if (!file || file.deletedAt) return null;
  return { name: file.originalName, url: fileUrl(file), thumbnailUrl: thumbnailUrl(file) };
}

/** One request with its details (candidates.manage; the read is logged). */
export async function getResumeRequest(ctx: StaffContext, id: string): Promise<ResumeRequestDetail | null> {
  staffOnly(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ r: resumeRequests, recordedBy: users.displayName })
    .from(resumeRequests)
    .leftJoin(users, eq(users.id, resumeRequests.paymentRecordedByUserId))
    .where(eq(resumeRequests.id, id))
    .limit(1);
  if (!row) return null;
  const r = row.r;
  const [photo, docx, pdf] = await Promise.all([r.photoFileId ? getFile(r.photoFileId) : null, r.generatedDocxFileId ? getFile(r.generatedDocxFileId) : null, r.generatedPdfFileId ? getFile(r.generatedPdfFileId) : null]);
  const parsed = resumeDetailsSchema.safeParse(withPassport(r));
  await logDataAccess({ actorUserId: ctx.user.id, subjectType: "resume_request", subjectId: r.id, dataCategory: "identity", accessType: "view", reason: "Resume request details" });
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    name: r.name,
    phone: r.phone,
    postAppliedFor: parsed.success ? parsed.data.postAppliedFor : "",
    priceLabel: requestPriceLabel(r.priceAmountMinor, r.priceCurrency),
    paymentReference: r.paymentReference,
    candidateNotes: r.candidateNotes,
    staffNotes: r.staffNotes,
    createdAt: r.createdAt,
    generatedAt: r.generatedAt,
    details: parsed.success ? parsed.data : null,
    rawDetails: withPassport(r),
    email: r.email,
    priceAmountMinor: r.priceAmountMinor,
    priceCurrency: r.priceCurrency,
    paymentMethod: r.paymentMethod,
    paidAt: r.paidAt,
    paymentRecordedByName: row.recordedBy ?? null,
    deliveredAt: r.deliveredAt,
    cancelledAt: r.cancelledAt,
    notesUpdatedAt: r.notesUpdatedAt,
    cvSubmissionId: r.cvSubmissionId,
    photo: link(photo),
    docx: link(docx),
    pdf: link(pdf),
  };
}

async function lockRequest(id: string, tx: DbOrTx) {
  const [row] = await tx.select().from(resumeRequests).where(eq(resumeRequests.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("This resume request could not be found.");
  return row;
}

async function readBytes(content: FileContent): Promise<Uint8Array> {
  return new Uint8Array(await new Response(content.body).arrayBuffer());
}

async function photoJpeg(fileId: string | null): Promise<Uint8Array | null> {
  if (!fileId) return null;
  const file = await getFile(fileId);
  if (!file || file.scanStatus === "infected") return null;
  const content = await openFileContent(file, null);
  if (!content) return null;
  try {
    const jpeg = await sharp(await readBytes(content), { failOn: "none" }).rotate().resize({ width: 420, height: 540, fit: "cover" }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    return new Uint8Array(jpeg);
  } catch {
    return null;
  }
}

/**
 * Generate (or regenerate) the DOCX and PDF for a paid or waived request. Older generated files are retired.
 * `actorUserId` null = system (future payment webhook).
 */
export async function generateResumeDocuments(ctx: StaffContext | null, id: string): Promise<void> {
  if (ctx) staffOnly(ctx);
  const [current] = await db.select().from(resumeRequests).where(eq(resumeRequests.id, id)).limit(1);
  if (!current) throw new ActionError("This resume request could not be found.");
  if (!["paid", "waived", "generated", "delivered"].includes(current.status)) throw new ActionError("Mark the request as paid (or waive the fee) before generating the resume.");
  const details = parseDetails(withPassport(current));
  const photo = await photoJpeg(current.photoFileId);
  const [docxBytes, pdfBytes] = await Promise.all([renderResumeDocx(details, { photoJpeg: photo }), renderResumePdf(details, { photoJpeg: photo })]);
  const base = `Resume - ${slugify(details.name, 60) || "candidate"}`;
  const actorUserId = ctx?.user.id ?? null;
  await db.transaction(async (tx) => {
    const row = await lockRequest(id, tx);
    const meta = { source: "resume_service", reference: row.code, role: "generated" };
    const docx = await storeFile({ data: docxBytes, originalName: `${base}.docx`, declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", purpose: "resume_service", ownerUserId: null, visibility: "private", metadata: meta, tx });
    const pdf = await storeFile({ data: pdfBytes, originalName: `${base}.pdf`, declaredMimeType: "application/pdf", purpose: "resume_service", ownerUserId: null, visibility: "private", metadata: meta, tx });
    for (const old of [row.generatedDocxFileId, row.generatedPdfFileId]) {
      if (old) await softDeleteFile(old, { actorUserId, reason: "Replaced by a regenerated resume", tx });
    }
    const stamp = new Date();
    await tx
      .update(resumeRequests)
      .set({
        generatedDocxFileId: docx.id,
        generatedPdfFileId: pdf.id,
        generatedAt: stamp,
        status: row.status === "delivered" ? "delivered" : "generated",
        statusChangedAt: row.status === "delivered" ? row.statusChangedAt : stamp,
        statusChangedByUserId: row.status === "delivered" ? row.statusChangedByUserId : actorUserId,
      })
      .where(eq(resumeRequests.id, row.id));
    await audit({ action: "resume_request.generated", entityType: "resume_request", entityId: row.id, actorUserId, metadata: { docxFileId: docx.id, pdfFileId: pdf.id, regenerated: Boolean(row.generatedPdfFileId) }, tx });
  });
}

/**
 * Record the payment (offline: UPI / bank / cash reference typed by staff; later Razorpay with ctx null) or waive it,
 * then generate the documents.
 */
export async function markResumeRequestPaid(ctx: StaffContext | null, input: { id: string; method: "offline" | "razorpay" | "waived"; reference?: string | null }): Promise<void> {
  if (ctx) staffOnly(ctx);
  const actorUserId = ctx?.user.id ?? null;
  await db.transaction(async (tx) => {
    const row = await lockRequest(input.id, tx);
    if (!["submitted", "awaiting_payment"].includes(row.status)) throw new ActionError(`This request is already ${RESUME_REQUEST_STATUS_LABELS[row.status].toLowerCase()}.`);
    const stamp = new Date();
    const status: ResumeRequestStatus = input.method === "waived" ? "waived" : "paid";
    await tx
      .update(resumeRequests)
      .set({ status, paymentMethod: input.method, paymentReference: input.reference?.trim() || null, paidAt: stamp, paymentRecordedByUserId: actorUserId, statusChangedAt: stamp, statusChangedByUserId: actorUserId })
      .where(eq(resumeRequests.id, row.id));
    await audit({ action: status === "waived" ? "resume_request.fee_waived" : "resume_request.paid", entityType: "resume_request", entityId: row.id, actorUserId, metadata: { method: input.method, hasReference: Boolean(input.reference?.trim()), priceAmountMinor: row.priceAmountMinor, priceCurrency: row.priceCurrency }, tx });
  });
  await generateResumeDocuments(ctx, input.id);
}

/** Cancel, reopen (back to awaiting payment) or mark delivered. Cancelling revokes every download link. */
export async function setResumeRequestStatus(ctx: StaffContext, input: { id: string; status: "cancelled" | "delivered" | "awaiting_payment" }): Promise<void> {
  staffOnly(ctx);
  await db.transaction(async (tx) => {
    const row = await lockRequest(input.id, tx);
    if (row.status === input.status) return;
    const stamp = new Date();
    if (input.status === "delivered" && !["generated", "delivered"].includes(row.status)) throw new ActionError("Generate the resume before marking it delivered.");
    if (input.status === "awaiting_payment" && row.status !== "cancelled") throw new ActionError("Only a cancelled request can be reopened.");
    if (input.status === "cancelled" && row.status === "delivered") throw new ActionError("A delivered resume cannot be cancelled.");
    await tx
      .update(resumeRequests)
      .set({
        status: input.status,
        statusChangedAt: stamp,
        statusChangedByUserId: ctx.user.id,
        ...(input.status === "cancelled" ? { cancelledAt: stamp, downloadTokenVersion: sql`${resumeRequests.downloadTokenVersion} + 1` } : {}),
        ...(input.status === "delivered" ? { deliveredAt: row.deliveredAt ?? stamp } : {}),
        ...(input.status === "awaiting_payment" ? { cancelledAt: null } : {}),
      })
      .where(eq(resumeRequests.id, row.id));
    await audit({ action: "resume_request.status_changed", entityType: "resume_request", entityId: row.id, actorUserId: ctx.user.id, metadata: { from: row.status, to: input.status }, tx });
  });
}

export async function setResumeRequestNotes(ctx: StaffContext, input: { id: string; notes?: string | null }): Promise<void> {
  staffOnly(ctx);
  const notes = input.notes?.trim() || null;
  await db.transaction(async (tx) => {
    const row = await lockRequest(input.id, tx);
    if ((row.staffNotes ?? null) === notes) return;
    await tx.update(resumeRequests).set({ staffNotes: notes, notesUpdatedAt: new Date(), notesUpdatedByUserId: ctx.user.id }).where(eq(resumeRequests.id, row.id));
    await audit({ action: "resume_request.notes_updated", entityType: "resume_request", entityId: row.id, actorUserId: ctx.user.id, metadata: { cleared: notes === null, length: notes?.length ?? 0 }, tx });
  });
}

/** Staff corrections to the details (regenerate afterwards to update the documents). */
export async function updateResumeRequestDetails(ctx: StaffContext, input: { id: string; details: ResumeDetails }): Promise<void> {
  staffOnly(ctx);
  await db.transaction(async (tx) => {
    const row = await lockRequest(input.id, tx);
    if (row.status === "cancelled") throw new ActionError("Reopen the request before editing it.");
    const split = splitPassport(input.details);
    await tx
      .update(resumeRequests)
      .set({ details: split.stored, passportNumberEncrypted: split.passportNumberEncrypted, passportNumberLast4: split.passportNumberLast4, name: input.details.name, phone: input.details.contactPhone, email: input.details.email ?? null })
      .where(eq(resumeRequests.id, row.id));
    await audit({ action: "resume_request.details_updated", entityType: "resume_request", entityId: row.id, actorUserId: ctx.user.id, metadata: {}, tx });
  });
}

// ---------------------------------------------------------------------------
// Candidate download link
// ---------------------------------------------------------------------------

/** A private download link for the candidate (valid 30 days; staff share it on WhatsApp). Audited without the token. */
export async function issueResumeDownloadLink(ctx: StaffContext, id: string): Promise<{ url: string; expiresAt: Date }> {
  staffOnly(ctx);
  const [row] = await db.select().from(resumeRequests).where(eq(resumeRequests.id, id)).limit(1);
  if (!row) throw new ActionError("This resume request could not be found.");
  if (!row.generatedPdfFileId || !row.generatedDocxFileId || !["generated", "delivered"].includes(row.status)) throw new ActionError("Generate the resume first.");
  const { token, expiresAt } = signToken(RESUME_DOWNLOAD_PURPOSE, row.id, RESUME_DOWNLOAD_LINK_DAYS * 24 * 3600, row.downloadTokenVersion);
  await audit({ action: "resume_request.download_link_issued", entityType: "resume_request", entityId: row.id, actorUserId: ctx.user.id, metadata: { expiresAt: expiresAt.toISOString() } });
  return { url: absoluteUrl(`/resume-service/download?t=${encodeURIComponent(token)}`), expiresAt };
}

export type ResumeDownloadView = { id: string; code: string; firstName: string; docxName: string; pdfName: string; expiresAt: Date };

async function resolveToken(token: string | null | undefined) {
  const claims = verifyToken(token, RESUME_DOWNLOAD_PURPOSE);
  if (!claims || !/^[0-9a-f-]{36}$/i.test(claims.subject)) return null;
  const [row] = await db.select().from(resumeRequests).where(eq(resumeRequests.id, claims.subject)).limit(1);
  if (!row || row.downloadTokenVersion !== claims.version || !["generated", "delivered"].includes(row.status)) return null;
  return { row, claims };
}

/** What the download page shows (no personal data beyond the first name). Null = invalid, expired or revoked. */
export async function resolveResumeDownload(token: string | null | undefined): Promise<ResumeDownloadView | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { row, claims } = resolved;
  const [docx, pdf] = await Promise.all([row.generatedDocxFileId ? getFile(row.generatedDocxFileId) : null, row.generatedPdfFileId ? getFile(row.generatedPdfFileId) : null]);
  if (!docx || !pdf) return null;
  return { id: row.id, code: row.code, firstName: row.name.trim().split(/\s+/)[0] ?? "", docxName: docx.originalName, pdfName: pdf.originalName, expiresAt: claims.expiresAt };
}

/**
 * Open a generated document for the holder of a valid link. The read is logged (data-access log) and the first
 * download marks the request delivered.
 */
export async function openResumeDownload(token: string | null | undefined, format: "docx" | "pdf", meta: { ipHash: string | null }): Promise<{ file: FileRow; content: FileContent } | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { row } = resolved;
  const limit = await rateLimit(`resume-download:${row.id}`, 60, 3600);
  if (!limit.allowed) throw new ActionError("Too many downloads. Please try again later.", { code: "rate_limited" });
  const file = await getFile((format === "docx" ? row.generatedDocxFileId : row.generatedPdfFileId) ?? "");
  if (!file || file.scanStatus === "infected") return null;
  const content = await openFileContent(file, null);
  if (!content) return null;
  await logDataAccess({ actorUserId: null, subjectType: "resume_request", subjectId: row.id, dataCategory: "documents", accessType: "download", reason: "Candidate downloaded their resume through the private link", metadata: { format, fileId: file.id, ipHash: meta.ipHash } });
  if (row.status === "generated") {
    const stamp = new Date();
    await db.update(resumeRequests).set({ status: "delivered", deliveredAt: stamp, statusChangedAt: stamp }).where(and(eq(resumeRequests.id, row.id), eq(resumeRequests.status, "generated")));
    await audit({ action: "resume_request.delivered", entityType: "resume_request", entityId: row.id, metadata: { via: "download_link", format } });
  }
  return { file, content };
}

/** Blank template (no personal data) for staff: candidates.manage. */
export async function renderBlankResumeTemplate(ctx: StaffContext, format: "docx" | "pdf"): Promise<Uint8Array> {
  staffOnly(ctx);
  return format === "docx" ? renderResumeDocx(null) : renderResumePdf(null);
}

export type ResumeRequestExportRow = ResumeRequestListItem & { passportNumber: string | null; passportLast4: string | null; alternatePhone: string | null };

/**
 * Rows for the staff Excel download (candidates.manage, up to `limit`), with the passport number and second phone
 * from the details. The caller masks the passport number for viewers without candidates.view_documents and logs.
 */
export async function listResumeRequestsWithPassport(ctx: StaffContext, filters: ResumeRequestFilters, limit: number): Promise<{ rows: ResumeRequestExportRow[]; total: number }> {
  staffOnly(ctx);
  const condition = listConditions(filters);
  const [rows, totals] = await Promise.all([
    db.select().from(resumeRequests).where(condition).orderBy(desc(resumeRequests.createdAt)).limit(limit),
    db.select({ value: count() }).from(resumeRequests).where(condition),
  ]);
  return {
    total: totals[0]?.value ?? 0,
    rows: rows.map((r) => {
      const d = (r.details ?? {}) as { postAppliedFor?: unknown; alternatePhone?: unknown };
      return {
        id: r.id,
        code: r.code,
        status: r.status,
        name: r.name,
        phone: r.phone,
        postAppliedFor: typeof d.postAppliedFor === "string" ? d.postAppliedFor : "",
        priceLabel: requestPriceLabel(r.priceAmountMinor, r.priceCurrency),
        paymentReference: r.paymentReference,
        candidateNotes: r.candidateNotes,
        staffNotes: r.staffNotes,
        createdAt: r.createdAt,
        generatedAt: r.generatedAt,
        passportNumber: tryDecryptField(r.passportNumberEncrypted),
        passportLast4: r.passportNumberLast4,
        alternatePhone: typeof d.alternatePhone === "string" && d.alternatePhone ? d.alternatePhone : null,
      };
    }),
  };
}

