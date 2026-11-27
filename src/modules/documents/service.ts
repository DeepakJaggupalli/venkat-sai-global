import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNull, notExists, or, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { batches, candidateProfiles, courses, enrolments, internshipParticipants, internshipProgrammes, issuedDocuments, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { absoluteUrl } from "@/lib/env";
import { currencyMinorUnits, fromMinorUnits } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/modules/audit";
import { getFile, openFileContent } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";
import { generateVerificationCode } from "@/modules/training/certificates";
import { formatVerificationCode, normalizeVerificationCode } from "@/modules/training/rules";

import {
  DEFAULT_SIGNATORY,
  DOCUMENT_KIND_LABELS,
  defaultDocumentContent,
  documentContentSchema,
  parseDocumentContent,
  REQUESTABLE_KINDS,
  type DocumentContent,
  type DocumentFacts,
  type DocumentSignatory,
  type InternStatus,
  type IssuedDocumentKind,
  type IssuedDocumentOrigin,
  type IssuedDocumentStatus,
} from "./content";
import { parseInternLines } from "./intern-lines";
import { renderDocumentPdf } from "./render-pdf";

/**
 * Certificates and letters for trainees and interns (see the schema file for the model).
 *
 *  - Created automatically by `ensureAutoDocuments()`: a completed and passed Venkat Sai course gives a course
 *    certificate; an intern who starts gives an offer letter; an intern who finishes gives an internship
 *    certificate and a letter of recommendation. Runs when staff open the documents pages, when the person opens
 *    their certificates page, after intern changes, and daily as a task. Idempotent (one live document per kind).
 *  - People can also ask for a missing document from the People Portal (`requestDocument`).
 *  - Staff with training.certificates read, edit, approve (one by one or many at once), reject or revoke.
 *  - Only approved documents can be downloaded by the person or checked on /verify-certificate.
 */

export type IssuedDocumentRow = typeof issuedDocuments.$inferSelect;
export type InternRow = typeof internshipParticipants.$inferSelect;
export type InternshipProgrammeRow = typeof internshipProgrammes.$inferSelect;

const PERMISSION = "training.certificates" as const;

function staffOnly(ctx: StaffContext): void {
  if (!staffCan(ctx, PERMISSION)) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

/** Today's calendar date in India (documents are dated where they are signed). */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function isoFrom(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return todayIso(value);
}

export function documentVerifyPath(verificationCode: string): string {
  return `/verify-certificate/${formatVerificationCode(verificationCode)}`;
}

export function documentPdfPath(verificationCode: string): string {
  return `/verify-certificate/${formatVerificationCode(verificationCode)}/pdf`;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getDocumentSignatory(): Promise<DocumentSignatory> {
  const v = (await getSetting("documents.signatory")) as Partial<DocumentSignatory> | null;
  return { name: String(v?.name ?? ""), title: String(v?.title ?? DEFAULT_SIGNATORY.title), place: String(v?.place ?? DEFAULT_SIGNATORY.place) };
}

async function loadSignature(): Promise<{ bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null> {
  const id = String((await getSetting("documents.signature_file_id")) ?? "");
  if (!id) return null;
  try {
    const file = await getFile(id);
    if (!file || (file.mimeType !== "image/png" && file.mimeType !== "image/jpeg")) return null;
    const content = await openFileContent(file, null);
    if (!content) return null;
    const bytes = new Uint8Array(await new Response(content.body).arrayBuffer());
    return { bytes, type: file.mimeType };
  } catch (error) {
    logger.warn("documents: signature image could not be read", { error });
    return null;
  }
}

async function businessAddress(): Promise<string | undefined> {
  const seller = (await getSetting("commercial.seller_details")) as { address?: string } | null;
  return seller?.address?.trim() || undefined;
}

// ---------------------------------------------------------------------------
// Creating documents
// ---------------------------------------------------------------------------

type NewDocument = {
  kind: IssuedDocumentKind;
  origin: IssuedDocumentOrigin;
  candidateId?: string | null;
  enrolmentId?: string | null;
  internshipParticipantId?: string | null;
  holderEmail?: string | null;
  holderPhone?: string | null;
  content: DocumentContent;
  requestNote?: string | null;
  actorUserId?: string | null;
};

/** Inserts one document; returns null when a live one of the same kind already exists for that course / intern. */
async function insertDocument(tx: DbOrTx, input: NewDocument): Promise<IssuedDocumentRow | null> {
  const code = await nextCode("DOC", { tx });
  const [row] = await tx
    .insert(issuedDocuments)
    .values({
      code,
      kind: input.kind,
      origin: input.origin,
      status: "pending",
      candidateId: input.candidateId ?? null,
      enrolmentId: input.enrolmentId ?? null,
      internshipParticipantId: input.internshipParticipantId ?? null,
      holderName: input.content.holderName,
      holderEmail: input.holderEmail ?? null,
      holderPhone: input.holderPhone ?? null,
      content: input.content,
      requestNote: input.requestNote ?? null,
      verificationCode: generateVerificationCode(),
      lastEditedByUserId: input.actorUserId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  await audit({
    action: "document.created",
    entityType: "issued_document",
    entityId: row.id,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? undefined : "system",
    metadata: { code: row.code, kind: row.kind, origin: row.origin },
    tx,
  });
  return row;
}

function stipendSentence(p: Pick<InternshipProgrammeRow, "stipendType" | "stipendMinor" | "stipendCurrency" | "stipendPeriod">): string | null {
  if (p.stipendType === "unpaid") return "This is an unpaid internship.";
  if (p.stipendType !== "fixed" || p.stipendMinor === null || !p.stipendCurrency) return null;
  let amount: string;
  try {
    amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: p.stipendCurrency, currencyDisplay: "code", maximumFractionDigits: currencyMinorUnits(p.stipendCurrency) }).format(
      fromMinorUnits(p.stipendMinor, p.stipendCurrency),
    );
  } catch {
    amount = `${p.stipendCurrency} ${fromMinorUnits(p.stipendMinor, p.stipendCurrency)}`;
  }
  const per = p.stipendPeriod && p.stipendPeriod !== "project" ? ` per ${p.stipendPeriod}` : p.stipendPeriod === "project" ? " for the whole internship" : "";
  return `You will receive a stipend of ${amount}${per}.`;
}

function internFacts(p: InternRow, programme: InternshipProgrammeRow): DocumentFacts {
  return {
    holderName: p.fullName,
    programme: programme.title,
    role: p.track,
    startDate: p.startsOn ?? programme.startsOn ?? null,
    endDate: p.endsOn ?? null,
    durationWeeks: programme.durationWeeks,
    online: programme.workMode === "remote",
    stipendSentence: stipendSentence(programme),
    performanceNote: p.performanceNote,
  };
}

type EnrolmentFactsRow = {
  enrolmentId: string;
  candidateId: string;
  holderName: string;
  email: string | null;
  phone: string | null;
  courseTitle: string;
  courseMode: string;
  durationHours: number | null;
  startsOn: string | null;
  endsOn: string | null;
  completedAt: Date | null;
  resultStatus: string;
  finalScore: number | null;
};

function enrolmentFacts(r: EnrolmentFactsRow): DocumentFacts {
  return {
    holderName: r.holderName,
    programme: r.courseTitle,
    startDate: r.startsOn,
    endDate: r.endsOn ?? isoFrom(r.completedAt),
    durationHours: r.durationHours,
    online: r.courseMode === "online",
    result: r.resultStatus === "passed" ? (r.finalScore !== null ? `Passed (${Number(r.finalScore)}%)` : "Passed") : null,
  };
}

const enrolmentFactsSelect = {
  enrolmentId: enrolments.id,
  candidateId: enrolments.candidateId,
  holderName: sql<string>`coalesce(nullif(trim(${candidateProfiles.legalName}), ''), ${users.displayName})`,
  email: users.email,
  phone: users.phone,
  courseTitle: courses.title,
  courseMode: courses.mode,
  durationHours: courses.durationHours,
  startsOn: batches.startsOn,
  endsOn: batches.endsOn,
  completedAt: enrolments.completedAt,
  resultStatus: enrolments.resultStatus,
  finalScore: enrolments.finalScore,
};

function enrolmentFactsQuery(tx: DbOrTx) {
  return tx
    .select(enrolmentFactsSelect)
    .from(enrolments)
    .innerJoin(batches, eq(batches.id, enrolments.batchId))
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .innerJoin(candidateProfiles, eq(candidateProfiles.id, enrolments.candidateId))
    .innerJoin(users, eq(users.id, candidateProfiles.userId));
}

function noDocument(kind: IssuedDocumentKind, column: typeof issuedDocuments.enrolmentId | typeof issuedDocuments.internshipParticipantId, id: SQL | typeof enrolments.id | typeof internshipParticipants.id) {
  return notExists(db.select({ one: sql`1` }).from(issuedDocuments).where(and(eq(column, id), eq(issuedDocuments.kind, kind))));
}

/**
 * Creates every missing automatic document (pending approval). Documents that were rejected or revoked are not
 * made again automatically (the person can still ask). Returns how many were created.
 */
export async function ensureAutoDocuments(opts: { candidateId?: string; participantIds?: string[]; limit?: number } = {}): Promise<number> {
  const limit = opts.limit ?? 200;
  const signatory = await getDocumentSignatory();
  let created = 0;

  // Venkat Sai courses (institutions issue their own certificates) completed and passed (or with no assessed result).
  const finished = await enrolmentFactsQuery(db)
    .where(
      and(
        eq(enrolments.status, "completed"),
        inArray(enrolments.resultStatus, ["passed", "not_applicable"]),
        isNull(courses.organizationId),
        opts.candidateId ? eq(enrolments.candidateId, opts.candidateId) : undefined,
        noDocument("course_certificate", issuedDocuments.enrolmentId, enrolments.id),
      ),
    )
    .limit(limit);
  for (const r of finished) {
    const row = await db.transaction((tx) =>
      insertDocument(tx, {
        kind: "course_certificate",
        origin: "auto",
        candidateId: r.candidateId,
        enrolmentId: r.enrolmentId,
        holderEmail: r.email,
        holderPhone: r.phone,
        content: defaultDocumentContent("course_certificate", enrolmentFacts(r), signatory),
      }),
    );
    if (row) created++;
  }

  // Interns: an offer letter when they start; a certificate and a letter of recommendation when they finish.
  const wanted: { kind: IssuedDocumentKind; statuses: InternStatus[] }[] = [
    { kind: "internship_offer_letter", statuses: ["active"] },
    { kind: "internship_certificate", statuses: ["completed"] },
    { kind: "recommendation_letter", statuses: ["completed"] },
  ];
  for (const w of wanted) {
    const rows = await db
      .select({ p: internshipParticipants, programme: internshipProgrammes })
      .from(internshipParticipants)
      .innerJoin(internshipProgrammes, eq(internshipProgrammes.id, internshipParticipants.programmeId))
      .where(
        and(
          inArray(internshipParticipants.status, w.statuses),
          opts.candidateId ? eq(internshipParticipants.candidateId, opts.candidateId) : undefined,
          opts.participantIds?.length ? inArray(internshipParticipants.id, opts.participantIds) : undefined,
          noDocument(w.kind, issuedDocuments.internshipParticipantId, internshipParticipants.id),
        ),
      )
      .limit(limit);
    for (const { p, programme } of rows) {
      const row = await db.transaction((tx) =>
        insertDocument(tx, {
          kind: w.kind,
          origin: "auto",
          candidateId: p.candidateId,
          internshipParticipantId: p.id,
          holderEmail: p.email,
          holderPhone: p.phone,
          content: defaultDocumentContent(w.kind, internFacts(p, programme), signatory),
        }),
      );
      if (row) created++;
    }
  }
  if (created) logger.info("documents: automatic documents created", { created });
  return created;
}

/** Safe wrapper for page loads: never breaks a page if the sweep fails. */
export async function ensureAutoDocumentsQuietly(opts: Parameters<typeof ensureAutoDocuments>[0] = {}): Promise<void> {
  try {
    await ensureAutoDocuments(opts);
  } catch (error) {
    logger.warn("documents: automatic creation failed", { error });
  }
}

/** Staff create a document for one intern or one finished course enrolment (any kind), or for someone not listed. */
export async function createDocumentByStaff(
  ctx: StaffContext,
  input:
    | { source: "intern"; participantId: string; kind: IssuedDocumentKind }
    | { source: "enrolment"; enrolmentId: string; kind: IssuedDocumentKind }
    | { source: "other"; kind: IssuedDocumentKind; holderName: string; programme: string; role?: string; holderEmail?: string; holderPhone?: string; startDate?: string; endDate?: string },
): Promise<IssuedDocumentRow> {
  staffOnly(ctx);
  const signatory = await getDocumentSignatory();
  let doc: NewDocument;
  if (input.source === "intern") {
    const [r] = await db
      .select({ p: internshipParticipants, programme: internshipProgrammes })
      .from(internshipParticipants)
      .innerJoin(internshipProgrammes, eq(internshipProgrammes.id, internshipParticipants.programmeId))
      .where(eq(internshipParticipants.id, input.participantId))
      .limit(1);
    if (!r) throw new ActionError("Intern not found.", { code: "not_found" });
    doc = {
      kind: input.kind,
      origin: "staff",
      candidateId: r.p.candidateId,
      internshipParticipantId: r.p.id,
      holderEmail: r.p.email,
      holderPhone: r.p.phone,
      content: defaultDocumentContent(input.kind, internFacts(r.p, r.programme), signatory),
    };
  } else if (input.source === "enrolment") {
    const [r] = await enrolmentFactsQuery(db).where(eq(enrolments.id, input.enrolmentId)).limit(1);
    if (!r) throw new ActionError("Enrolment not found.", { code: "not_found" });
    doc = {
      kind: input.kind,
      origin: "staff",
      candidateId: r.candidateId,
      enrolmentId: r.enrolmentId,
      holderEmail: r.email,
      holderPhone: r.phone,
      content: defaultDocumentContent(input.kind, { ...enrolmentFacts(r), aboutCourse: true }, signatory),
    };
  } else {
    doc = {
      kind: input.kind,
      origin: "staff",
      holderEmail: input.holderEmail?.toLowerCase() ?? null,
      holderPhone: input.holderPhone ?? null,
      content: defaultDocumentContent(input.kind, { holderName: input.holderName, programme: input.programme, role: input.role, startDate: input.startDate, endDate: input.endDate }, signatory),
    };
  }
  const row = await db.transaction((tx) => insertDocument(tx, { ...doc, actorUserId: ctx.user.id }));
  if (!row) throw new ActionError(`A ${DOCUMENT_KIND_LABELS[input.kind].toLowerCase()} already exists for this person. Open it from the list instead.`, { code: "conflict" });
  return row;
}

// ---------------------------------------------------------------------------
// Staff: list, read, edit, decide
// ---------------------------------------------------------------------------

export type DocumentListFilters = { status?: IssuedDocumentStatus; kind?: IssuedDocumentKind; q?: string };
export type DocumentListItem = IssuedDocumentRow & { programme: string };

export async function listDocuments(ctx: StaffContext, filters: DocumentListFilters, page: PageQuery): Promise<Paginated<DocumentListItem>> {
  staffOnly(ctx);
  const q = filters.q?.trim();
  const where = and(
    filters.status ? eq(issuedDocuments.status, filters.status) : undefined,
    filters.kind ? eq(issuedDocuments.kind, filters.kind) : undefined,
    q
      ? or(
          ilike(issuedDocuments.holderName, `%${q}%`),
          ilike(issuedDocuments.code, `%${q}%`),
          ilike(issuedDocuments.holderEmail, `%${q}%`),
          ilike(issuedDocuments.holderPhone, `%${q}%`),
          sql`${issuedDocuments.content}->>'programme' ilike ${`%${q}%`}`,
        )
      : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(issuedDocuments)
      .where(where)
      .orderBy(filters.status === "pending" ? asc(issuedDocuments.createdAt) : desc(issuedDocuments.updatedAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ total: count() }).from(issuedDocuments).where(where),
  ]);
  return paginated(
    rows.map((r) => ({ ...r, programme: parseDocumentContent(r.content, { holderName: r.holderName, kind: r.kind }).programme })),
    total,
    page,
  );
}

export async function countDocumentsByStatus(): Promise<Record<IssuedDocumentStatus, number>> {
  const rows = await db.select({ status: issuedDocuments.status, n: count() }).from(issuedDocuments).groupBy(issuedDocuments.status);
  const out: Record<IssuedDocumentStatus, number> = { pending: 0, approved: 0, rejected: 0, revoked: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export type StaffDocumentView = IssuedDocumentRow & {
  parsed: DocumentContent;
  intern: (InternRow & { programmeTitle: string; programmeId: string }) | null;
  candidateUserId: string | null;
};

export async function getDocumentForStaff(ctx: StaffContext, id: string): Promise<StaffDocumentView | null> {
  staffOnly(ctx);
  const [row] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, id)).limit(1);
  if (!row) return null;
  const [intern] = row.internshipParticipantId
    ? await db
        .select({ p: internshipParticipants, programmeTitle: internshipProgrammes.title })
        .from(internshipParticipants)
        .innerJoin(internshipProgrammes, eq(internshipProgrammes.id, internshipParticipants.programmeId))
        .where(eq(internshipParticipants.id, row.internshipParticipantId))
        .limit(1)
    : [];
  const [cand] = row.candidateId ? await db.select({ userId: candidateProfiles.userId }).from(candidateProfiles).where(eq(candidateProfiles.id, row.candidateId)).limit(1) : [];
  return {
    ...row,
    parsed: parseDocumentContent(row.content, { holderName: row.holderName, kind: row.kind }),
    intern: intern ? { ...intern.p, programmeTitle: intern.programmeTitle, programmeId: intern.p.programmeId } : null,
    candidateUserId: cand?.userId ?? null,
  };
}

async function loadForChange(tx: DbOrTx, id: string): Promise<IssuedDocumentRow> {
  const [row] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.id, id)).for("update").limit(1);
  if (!row) throw new ActionError("Document not found.", { code: "not_found" });
  return row;
}

/** Every printed line can be corrected while the document is waiting or after approval (the PDF is re-made each time). */
export async function saveDocumentContent(
  ctx: StaffContext,
  input: { id: string; content: DocumentContent; holderEmail?: string | null; holderPhone?: string | null },
): Promise<void> {
  staffOnly(ctx);
  await db.transaction(async (tx) => {
    const row = await loadForChange(tx, input.id);
    if (row.status === "rejected" || row.status === "revoked") throw new ActionError("Reopen the document before editing it.", { code: "invalid_state" });
    await tx
      .update(issuedDocuments)
      .set({
        content: input.content,
        holderName: input.content.holderName,
        holderEmail: input.holderEmail === undefined ? row.holderEmail : input.holderEmail || null,
        holderPhone: input.holderPhone === undefined ? row.holderPhone : input.holderPhone || null,
        lastEditedByUserId: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(issuedDocuments.id, row.id));
    await audit({ action: "document.edited", entityType: "issued_document", entityId: row.id, actorUserId: ctx.user.id, metadata: { code: row.code, status: row.status }, tx });
  });
}

/** Approve one or many waiting documents. The issue date is set to today unless staff typed one. */
export async function approveDocuments(ctx: StaffContext, ids: string[], now: Date = new Date()): Promise<{ approved: number; skipped: number }> {
  staffOnly(ctx);
  const unique = [...new Set(ids)].slice(0, 500);
  let approved = 0;
  const toNotify: IssuedDocumentRow[] = [];
  for (const id of unique) {
    const done = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.id, id)).for("update").limit(1);
      if (!row || row.status !== "pending") return null;
      const content = parseDocumentContent(row.content, { holderName: row.holderName, kind: row.kind });
      const checked = documentContentSchema.safeParse({ ...content, issueDate: content.issueDate ?? todayIso(now) });
      if (!checked.success) return null; // incomplete wording: staff must open and fix it first
      const [updated] = await tx
        .update(issuedDocuments)
        .set({ status: "approved", content: checked.data, approvedAt: now, approvedByUserId: ctx.user.id, decidedByUserId: ctx.user.id, rejectedReason: null, rejectedAt: null, updatedAt: now })
        .where(eq(issuedDocuments.id, row.id))
        .returning();
      await audit({ action: "document.approved", entityType: "issued_document", entityId: row.id, actorUserId: ctx.user.id, metadata: { code: row.code, kind: row.kind }, tx });
      return updated;
    });
    if (done) {
      approved++;
      toNotify.push(done);
    }
  }
  await Promise.all(toNotify.map((d) => notifyHolder(d).catch((error) => logger.warn("documents: approval notice failed", { error, id: d.id }))));
  return { approved, skipped: unique.length - approved };
}

async function notifyHolder(d: IssuedDocumentRow): Promise<void> {
  const [cand] = d.candidateId ? await db.select({ userId: candidateProfiles.userId }).from(candidateProfiles).where(eq(candidateProfiles.id, d.candidateId)).limit(1) : [];
  const recipients = cand ? [{ userId: cand.userId }] : d.holderEmail ? [{ email: d.holderEmail, name: d.holderName }] : [];
  const content = parseDocumentContent(d.content, { holderName: d.holderName, kind: d.kind });
  await notify({
    event: "training.certificate_issued",
    recipients,
    data: { certificateTitle: content.title, code: d.code, issuerName: content.organisation, verificationCode: formatVerificationCode(d.verificationCode) },
    link: cand ? "/talent/certificates" : documentVerifyPath(d.verificationCode),
    dedupeKey: `document-approved:${d.id}:${d.approvedAt?.toISOString() ?? ""}`,
  });
}

export async function rejectDocument(ctx: StaffContext, id: string, reason: string, now: Date = new Date()): Promise<void> {
  staffOnly(ctx);
  await db.transaction(async (tx) => {
    const row = await loadForChange(tx, id);
    if (row.status !== "pending") throw new ActionError("Only a document waiting for approval can be rejected.", { code: "invalid_state" });
    await tx.update(issuedDocuments).set({ status: "rejected", rejectedReason: reason, rejectedAt: now, decidedByUserId: ctx.user.id, updatedAt: now }).where(eq(issuedDocuments.id, id));
    await audit({ action: "document.rejected", entityType: "issued_document", entityId: id, actorUserId: ctx.user.id, metadata: { code: row.code }, tx });
  });
}

export async function revokeDocument(ctx: StaffContext, id: string, reason: string, now: Date = new Date()): Promise<void> {
  staffOnly(ctx);
  await db.transaction(async (tx) => {
    const row = await loadForChange(tx, id);
    if (row.status !== "approved") throw new ActionError("Only an approved document can be revoked.", { code: "invalid_state" });
    await tx.update(issuedDocuments).set({ status: "revoked", revokedReason: reason, revokedAt: now, decidedByUserId: ctx.user.id, updatedAt: now }).where(eq(issuedDocuments.id, id));
    await audit({ action: "document.revoked", entityType: "issued_document", entityId: id, actorUserId: ctx.user.id, metadata: { code: row.code }, tx });
  });
}

/** A rejected document goes back to waiting (e.g. after a correction). A revoked one stays revoked: make a new one. */
export async function reopenDocument(ctx: StaffContext, id: string): Promise<void> {
  staffOnly(ctx);
  await db.transaction(async (tx) => {
    const row = await loadForChange(tx, id);
    if (row.status !== "rejected") throw new ActionError("Only a rejected document can be reopened.", { code: "invalid_state" });
    try {
      await tx.update(issuedDocuments).set({ status: "pending", rejectedReason: null, rejectedAt: null, updatedAt: new Date() }).where(eq(issuedDocuments.id, id));
    } catch {
      throw new ActionError("Another document of this kind is already waiting or approved for this person.", { code: "conflict" });
    }
    await audit({ action: "document.reopened", entityType: "issued_document", entityId: id, actorUserId: ctx.user.id, metadata: { code: row.code }, tx });
  });
}

export async function renderDocument(row: IssuedDocumentRow, now: Date = new Date()): Promise<{ bytes: Uint8Array; filename: string }> {
  const content = parseDocumentContent(row.content, { holderName: row.holderName, kind: row.kind });
  const [signature, address] = await Promise.all([loadSignature(), businessAddress()]);
  const bytes = await renderDocumentPdf({
    kind: row.kind,
    code: row.code,
    content,
    verificationCodeDisplay: formatVerificationCode(row.verificationCode),
    verifyUrl: absoluteUrl(documentVerifyPath(row.verificationCode)),
    fallbackIssueDate: isoFrom(row.approvedAt) ?? todayIso(now),
    draft: row.status !== "approved",
    signature,
    address,
  });
  const safeName = content.holderName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
  const kindSlug = { course_certificate: "Certificate", internship_offer_letter: "Offer-Letter", internship_certificate: "Internship-Certificate", recommendation_letter: "LOR" }[row.kind];
  return { bytes, filename: `${kindSlug}-${safeName}-${row.code}.pdf` };
}

/** Staff download / preview (any status; drafts carry a watermark). */
export async function renderDocumentForStaff(ctx: StaffContext, id: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  staffOnly(ctx);
  const [row] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, id)).limit(1);
  if (!row) return null;
  return renderDocument(row);
}

// ---------------------------------------------------------------------------
// Public check and download (by the unguessable verification code)
// ---------------------------------------------------------------------------

export async function findDocumentByVerificationCode(rawCode: string): Promise<IssuedDocumentRow | null> {
  const code = normalizeVerificationCode(rawCode);
  if (!code) return null;
  const [row] = await db
    .select()
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.verificationCode, code), inArray(issuedDocuments.status, ["approved", "revoked"])))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// People Portal: my documents and requests
// ---------------------------------------------------------------------------

export type RequestOption = {
  source: "enrolment" | "intern";
  sourceId: string;
  programme: string;
  kinds: IssuedDocumentKind[];
};

export type CandidateDocument = {
  id: string;
  code: string;
  kind: IssuedDocumentKind;
  status: IssuedDocumentStatus;
  title: string;
  programme: string;
  createdAt: Date;
  approvedAt: Date | null;
  rejectedReason: string | null;
  verificationCode: string;
};

export async function listCandidateDocuments(candidateId: string): Promise<{ documents: CandidateDocument[]; requestOptions: RequestOption[] }> {
  await ensureAutoDocumentsQuietly({ candidateId, limit: 20 });
  const [docs, courseRows, internRows] = await Promise.all([
    db.select().from(issuedDocuments).where(eq(issuedDocuments.candidateId, candidateId)).orderBy(desc(issuedDocuments.createdAt)),
    db
      .select({ id: enrolments.id, programme: courses.title })
      .from(enrolments)
      .innerJoin(batches, eq(batches.id, enrolments.batchId))
      .innerJoin(courses, eq(courses.id, batches.courseId))
      .where(and(eq(enrolments.candidateId, candidateId), eq(enrolments.status, "completed"), inArray(enrolments.resultStatus, ["passed", "not_applicable"]), isNull(courses.organizationId))),
    db
      .select({ id: internshipParticipants.id, status: internshipParticipants.status, programme: internshipProgrammes.title })
      .from(internshipParticipants)
      .innerJoin(internshipProgrammes, eq(internshipProgrammes.id, internshipParticipants.programmeId))
      .where(and(eq(internshipParticipants.candidateId, candidateId), inArray(internshipParticipants.status, ["active", "completed"]))),
  ]);
  const live = (kind: IssuedDocumentKind, col: "enrolmentId" | "internshipParticipantId", id: string) =>
    docs.some((d) => d.kind === kind && d[col] === id && (d.status === "pending" || d.status === "approved"));
  const requestOptions: RequestOption[] = [
    ...courseRows.map((c) => ({ source: "enrolment" as const, sourceId: c.id, programme: c.programme, kinds: REQUESTABLE_KINDS.course.filter((k) => !live(k, "enrolmentId", c.id)) })),
    ...internRows.map((i) => ({
      source: "intern" as const,
      sourceId: i.id,
      programme: i.programme,
      kinds: REQUESTABLE_KINDS.internship.filter((k) => (i.status === "completed" || k === "internship_offer_letter") && !live(k, "internshipParticipantId", i.id)),
    })),
  ].filter((o) => o.kinds.length);
  return {
    documents: docs.map((d) => {
      const c = parseDocumentContent(d.content, { holderName: d.holderName, kind: d.kind });
      return { id: d.id, code: d.code, kind: d.kind, status: d.status, title: c.title, programme: c.programme, createdAt: d.createdAt, approvedAt: d.approvedAt, rejectedReason: d.rejectedReason, verificationCode: d.verificationCode };
    }),
    requestOptions,
  };
}

/** The person asks for a document for a course they finished or an internship they did. Waits for staff approval. */
export async function requestDocument(
  candidate: { userId: string; candidateId: string },
  input: { source: "enrolment" | "intern"; sourceId: string; kind: IssuedDocumentKind; note?: string },
): Promise<IssuedDocumentRow> {
  const { requestOptions } = await listCandidateDocuments(candidate.candidateId);
  const option = requestOptions.find((o) => o.source === input.source && o.sourceId === input.sourceId);
  if (!option || !option.kinds.includes(input.kind)) throw new ActionError("This document cannot be requested, or it was already requested.", { code: "invalid_state" });
  const signatory = await getDocumentSignatory();
  let doc: NewDocument;
  if (input.source === "enrolment") {
    const [r] = await enrolmentFactsQuery(db).where(and(eq(enrolments.id, input.sourceId), eq(enrolments.candidateId, candidate.candidateId))).limit(1);
    if (!r) throw new ActionError("Course not found.", { code: "not_found" });
    doc = {
      kind: input.kind,
      origin: "requested",
      candidateId: r.candidateId,
      enrolmentId: r.enrolmentId,
      holderEmail: r.email,
      holderPhone: r.phone,
      content: defaultDocumentContent(input.kind, { ...enrolmentFacts(r), aboutCourse: true }, signatory),
    };
  } else {
    const [r] = await db
      .select({ p: internshipParticipants, programme: internshipProgrammes })
      .from(internshipParticipants)
      .innerJoin(internshipProgrammes, eq(internshipProgrammes.id, internshipParticipants.programmeId))
      .where(and(eq(internshipParticipants.id, input.sourceId), eq(internshipParticipants.candidateId, candidate.candidateId)))
      .limit(1);
    if (!r) throw new ActionError("Internship not found.", { code: "not_found" });
    doc = {
      kind: input.kind,
      origin: "requested",
      candidateId: r.p.candidateId,
      internshipParticipantId: r.p.id,
      holderEmail: r.p.email,
      holderPhone: r.p.phone,
      content: defaultDocumentContent(input.kind, internFacts(r.p, r.programme), signatory),
    };
  }
  const row = await db.transaction((tx) => insertDocument(tx, { ...doc, requestNote: input.note?.trim() || null, actorUserId: candidate.userId }));
  if (!row) throw new ActionError("This document was already requested.", { code: "conflict" });
  return row;
}

// ---------------------------------------------------------------------------
// Interns (Venkat Sai's own internship programmes)
// ---------------------------------------------------------------------------

export type ProgrammeSummary = InternshipProgrammeRow & { interns: number; applied: number; active: number; completed: number };

export async function listVenkatSaiProgrammes(ctx: StaffContext): Promise<ProgrammeSummary[]> {
  staffOnly(ctx);
  const rows = await db
    .select({
      programme: internshipProgrammes,
      interns: sql<number>`count(${internshipParticipants.id})::int`,
      applied: sql<number>`count(${internshipParticipants.id}) filter (where ${internshipParticipants.status} = 'applied')::int`,
      active: sql<number>`count(${internshipParticipants.id}) filter (where ${internshipParticipants.status} = 'active')::int`,
      completed: sql<number>`count(${internshipParticipants.id}) filter (where ${internshipParticipants.status} = 'completed')::int`,
    })
    .from(internshipProgrammes)
    .leftJoin(internshipParticipants, eq(internshipParticipants.programmeId, internshipProgrammes.id))
    .where(isNull(internshipProgrammes.organizationId))
    .groupBy(internshipProgrammes.id)
    .orderBy(desc(internshipProgrammes.createdAt));
  return rows.map((r) => ({ ...r.programme, interns: r.interns, applied: r.applied, active: r.active, completed: r.completed }));
}

export async function getVenkatSaiProgramme(ctx: StaffContext, id: string): Promise<{ programme: InternshipProgrammeRow; interns: (InternRow & { documents: Pick<IssuedDocumentRow, "id" | "kind" | "status">[] })[] } | null> {
  staffOnly(ctx);
  const [programme] = await db.select().from(internshipProgrammes).where(and(eq(internshipProgrammes.id, id), isNull(internshipProgrammes.organizationId))).limit(1);
  if (!programme) return null;
  const interns = await db.select().from(internshipParticipants).where(eq(internshipParticipants.programmeId, id)).orderBy(asc(internshipParticipants.fullName));
  const docs = interns.length
    ? await db
        .select({ id: issuedDocuments.id, kind: issuedDocuments.kind, status: issuedDocuments.status, participantId: issuedDocuments.internshipParticipantId })
        .from(issuedDocuments)
        .where(inArray(issuedDocuments.internshipParticipantId, interns.map((i) => i.id)))
        .orderBy(desc(issuedDocuments.createdAt))
    : [];
  return { programme, interns: interns.map((i) => ({ ...i, documents: docs.filter((d) => d.participantId === i.id) })) };
}

export type InternInput = {
  fullName: string;
  email?: string;
  phone?: string;
  institutionName?: string;
  track?: string;
  startsOn?: string;
  endsOn?: string;
  performanceNote?: string;
};

/** People Portal profile with this email or phone, if any (links the intern so documents show up in their account). */
async function matchCandidate(tx: DbOrTx, email?: string | null, phone?: string | null): Promise<string | null> {
  const conds = [email ? eq(users.email, email.toLowerCase()) : undefined, phone ? eq(users.phone, phone) : undefined].filter(Boolean) as SQL[];
  if (!conds.length) return null;
  const [row] = await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).innerJoin(users, eq(users.id, candidateProfiles.userId)).where(or(...conds)).limit(1);
  return row?.id ?? null;
}

async function assertProgramme(tx: DbOrTx, programmeId: string): Promise<InternshipProgrammeRow> {
  const [p] = await tx.select().from(internshipProgrammes).where(and(eq(internshipProgrammes.id, programmeId), isNull(internshipProgrammes.organizationId))).limit(1);
  if (!p) throw new ActionError("Internship programme not found.", { code: "not_found" });
  if (p.status === "cancelled") throw new ActionError("This programme was cancelled.", { code: "invalid_state" });
  return p;
}

function datesOk(input: Pick<InternInput, "startsOn" | "endsOn">): void {
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) throw new ActionError("The end date is before the start date.", { fieldErrors: { endsOn: ["The end date is before the start date"] } });
}

export async function addIntern(ctx: StaffContext, programmeId: string, input: InternInput, status: InternStatus = "active"): Promise<InternRow> {
  staffOnly(ctx);
  datesOk(input);
  const row = await db.transaction(async (tx) => {
    const programme = await assertProgramme(tx, programmeId);
    const candidateId = await matchCandidate(tx, input.email, input.phone);
    if (candidateId) {
      const [dup] = await tx.select({ id: internshipParticipants.id }).from(internshipParticipants).where(and(eq(internshipParticipants.programmeId, programmeId), eq(internshipParticipants.candidateId, candidateId))).limit(1);
      if (dup) throw new ActionError("This person is already an intern on this programme.", { code: "conflict" });
    }
    const now = new Date();
    const [created] = await tx
      .insert(internshipParticipants)
      .values({
        programmeId,
        candidateId,
        fullName: input.fullName,
        email: input.email?.toLowerCase() || null,
        phone: input.phone || null,
        institutionName: input.institutionName || null,
        track: input.track || null,
        startsOn: input.startsOn || programme.startsOn || null,
        endsOn: input.endsOn || null,
        performanceNote: input.performanceNote || null,
        status,
        completedAt: status === "completed" ? now : null,
        createdByUserId: ctx.user.id,
      })
      .returning();
    await audit({ action: "internship.intern_added", entityType: "internship_participant", entityId: created.id, actorUserId: ctx.user.id, metadata: { programmeId, status }, tx });
    return created;
  });
  await ensureAutoDocumentsQuietly({ participantIds: [row.id] });
  return row;
}

export async function addInternsBulk(ctx: StaffContext, programmeId: string, text: string, defaults: Pick<InternInput, "track" | "startsOn" | "endsOn">): Promise<{ added: number; skipped: string[] }> {
  staffOnly(ctx);
  datesOk(defaults);
  const { rows, errors } = parseInternLines(text);
  if (!rows.length) throw new ActionError(errors[0] ?? "Enter at least one name.", { fieldErrors: { lines: [errors[0] ?? "Enter at least one name"] } });
  const skipped = [...errors];
  let added = 0;
  for (const r of rows) {
    try {
      await addIntern(ctx, programmeId, { ...r, track: defaults.track, startsOn: defaults.startsOn, endsOn: defaults.endsOn });
      added++;
    } catch (error) {
      skipped.push(`${r.fullName}: ${error instanceof ActionError ? error.message : "could not be added"}`);
    }
  }
  return { added, skipped };
}

export async function updateIntern(ctx: StaffContext, id: string, input: InternInput): Promise<void> {
  staffOnly(ctx);
  datesOk(input);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(internshipParticipants).where(eq(internshipParticipants.id, id)).for("update").limit(1);
    if (!row) throw new ActionError("Intern not found.", { code: "not_found" });
    const candidateId = row.candidateId ?? (await matchCandidate(tx, input.email, input.phone));
    await tx
      .update(internshipParticipants)
      .set({
        candidateId,
        fullName: input.fullName,
        email: input.email?.toLowerCase() || null,
        phone: input.phone || null,
        institutionName: input.institutionName || null,
        track: input.track || null,
        startsOn: input.startsOn || null,
        endsOn: input.endsOn || null,
        performanceNote: input.performanceNote || null,
        updatedAt: new Date(),
      })
      .where(eq(internshipParticipants.id, id));
    await audit({ action: "internship.intern_updated", entityType: "internship_participant", entityId: id, actorUserId: ctx.user.id, tx });
  });
}

/** Start, finish, or stop interns (one or many). Finishing creates the certificate and LOR, waiting for approval. */
export async function setInternStatus(ctx: StaffContext, ids: string[], status: InternStatus, now: Date = new Date()): Promise<number> {
  staffOnly(ctx);
  const unique = [...new Set(ids)].slice(0, 500);
  if (!unique.length) return 0;
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(internshipParticipants)
      .set({
        status,
        completedAt: status === "completed" ? now : null,
        // Finishing today when no end date was typed.
        ...(status === "completed" ? { endsOn: sql`coalesce(${internshipParticipants.endsOn}, ${todayIso(now)}::date)` } : {}),
        updatedAt: now,
      })
      .where(inArray(internshipParticipants.id, unique))
      .returning({ id: internshipParticipants.id });
    for (const r of rows) await audit({ action: "internship.intern_status_changed", entityType: "internship_participant", entityId: r.id, actorUserId: ctx.user.id, metadata: { status }, tx });
    return rows.length;
  });
  await ensureAutoDocumentsQuietly({ participantIds: unique });
  return updated;
}

/** Ids of documents waiting for approval for these interns (for "approve all for this programme"). */
export async function pendingDocumentIdsForProgramme(ctx: StaffContext, programmeId: string): Promise<string[]> {
  staffOnly(ctx);
  const rows = await db
    .select({ id: issuedDocuments.id })
    .from(issuedDocuments)
    .innerJoin(internshipParticipants, eq(internshipParticipants.id, issuedDocuments.internshipParticipantId))
    .where(and(eq(internshipParticipants.programmeId, programmeId), eq(issuedDocuments.status, "pending")));
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Public internships (/internships): open Venkat Sai programmes and applications
// ---------------------------------------------------------------------------

export type PublicProgramme = Pick<
  InternshipProgrammeRow,
  "id" | "title" | "description" | "eligibility" | "durationWeeks" | "startsOn" | "applicationDeadline" | "workMode" | "city" | "stipendType" | "stipendMinor" | "stipendCurrency" | "stipendPeriod"
> & { stipendText: string | null };

function toPublicProgramme(p: InternshipProgrammeRow): PublicProgramme {
  const sentence = stipendSentence(p);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    eligibility: p.eligibility,
    durationWeeks: p.durationWeeks,
    startsOn: p.startsOn,
    applicationDeadline: p.applicationDeadline,
    workMode: p.workMode,
    city: p.city,
    stipendType: p.stipendType,
    stipendMinor: p.stipendMinor,
    stipendCurrency: p.stipendCurrency,
    stipendPeriod: p.stipendPeriod,
    stipendText: p.stipendType === "unpaid" ? "Unpaid" : sentence ? sentence.replace("You will receive a stipend of ", "Stipend: ").replace(/\.$/, "") : null,
  };
}

/** Venkat Sai's own programmes that take applications (status open, deadline not passed). */
export async function listOpenProgrammes(now: Date = new Date()): Promise<PublicProgramme[]> {
  const today = todayIso(now);
  const rows = await db
    .select()
    .from(internshipProgrammes)
    .where(
      and(
        isNull(internshipProgrammes.organizationId),
        eq(internshipProgrammes.status, "open"),
        or(isNull(internshipProgrammes.applicationDeadline), sql`${internshipProgrammes.applicationDeadline} >= ${today}::date`),
      ),
    )
    .orderBy(desc(internshipProgrammes.createdAt))
    .limit(50);
  return rows.map(toPublicProgramme);
}

export async function getOpenProgramme(id: string, now: Date = new Date()): Promise<PublicProgramme | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await listOpenProgrammes(now)).find((p) => p.id === id) ?? null;
}

export type InternshipApplication = {
  programmeId: string;
  fullName: string;
  phone: string;
  email?: string;
  institutionName?: string;
  consentToContact: boolean;
  website?: string;
};

/**
 * Public application to an open programme. Honeypot hits are dropped silently; rate limited per network and phone.
 * Applying twice with the same number to the same programme keeps the first application. Signed-in people (or a
 * People account with the same email / phone) are linked, so their documents later appear in their account.
 */
export async function applyForInternship(input: InternshipApplication, meta: { ipHash: string | null; userId: string | null }): Promise<{ programmeTitle: string }> {
  if (input.website?.trim()) return { programmeTitle: "" };
  if (!input.consentToContact) throw new ActionError("Please check the highlighted fields.", { fieldErrors: { consentToContact: ["Please agree that we may call or WhatsApp you"] } });
  const programme = await getOpenProgramme(input.programmeId);
  if (!programme) throw new ActionError("This internship is not taking applications any more.", { code: "invalid_state" });
  const limits = [
    ...(meta.ipHash ? [{ key: `internship-apply:ip:${meta.ipHash}`, limit: 6, windowSeconds: 3600 }] : []),
    { key: `internship-apply:phone:${input.phone}`, limit: 4, windowSeconds: 24 * 3600 },
  ];
  for (const l of limits) {
    if (!(await rateLimit(l.key, l.limit, l.windowSeconds)).allowed) throw new ActionError("You have sent several applications in a short time. Please wait, or message us on WhatsApp.", { code: "rate_limited" });
  }
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: internshipParticipants.id })
      .from(internshipParticipants)
      .where(and(eq(internshipParticipants.programmeId, programme.id), eq(internshipParticipants.phone, input.phone)))
      .limit(1);
    if (existing) return;
    const own = meta.userId ? (await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, meta.userId)).limit(1))[0]?.id : undefined;
    const candidateId = own ?? (await matchCandidate(tx, input.email, input.phone));
    if (candidateId) {
      const [dup] = await tx.select({ id: internshipParticipants.id }).from(internshipParticipants).where(and(eq(internshipParticipants.programmeId, programme.id), eq(internshipParticipants.candidateId, candidateId))).limit(1);
      if (dup) return;
    }
    const [row] = await tx
      .insert(internshipParticipants)
      .values({
        programmeId: programme.id,
        candidateId: candidateId ?? null,
        fullName: input.fullName,
        email: input.email?.toLowerCase() || null,
        phone: input.phone,
        institutionName: input.institutionName || null,
        status: "applied",
        startsOn: programme.startsOn ?? null,
      })
      .returning({ id: internshipParticipants.id });
    await audit({ action: "internship.applied", entityType: "internship_participant", entityId: row.id, actorType: meta.userId ? undefined : "anonymous", metadata: { programmeId: programme.id }, tx });
  });
  return { programmeTitle: programme.title };
}

/** How many people applied and wait for an answer (Command Centre home). */
export async function countInternshipApplications(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(internshipParticipants).where(eq(internshipParticipants.status, "applied"));
  return r?.n ?? 0;
}
