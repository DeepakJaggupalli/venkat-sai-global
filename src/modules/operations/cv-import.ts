import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { countries, cvImportBatches, cvSubmissions, cvSubmissionStageEvents, jobCategories } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { encryptField, hmacToken } from "@/lib/crypto";
import { audit } from "@/modules/audit";
import { last4 } from "@/modules/candidates/profile-rules";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import {
  checkCvImportRows,
  classifyCvImportRows,
  countCvImportRows,
  readCvImportWorkbook,
  toRowView,
  type CvImportCandidate,
  type CvImportCheckedRow,
  type CvImportClassifiedRow,
  type CvImportExisting,
  type CvImportLookups,
  type CvImportSheet,
} from "./cv-import-parse";
import {
  CV_IMPORT_FIELD_LABELS,
  CV_IMPORT_LIST_HREF,
  CV_IMPORT_MAX_BYTES,
  CV_IMPORT_PREVIEW_LIMIT,
  CV_IMPORT_PRIVACY_NOTICE_VERSION,
  type CvImportPreview,
  type CvImportResult,
  type CvImportRowStatus,
} from "./cv-import-schemas";
import { buildCvImportTemplate } from "./cv-import-template";
import { assertStaff, enforceRateLimits } from "./internal";

/**
 * Excel import of the CVs the office already has (/admin/cv-submissions/import, candidates.manage).
 *
 *   previewCvImport — read and check the file: ready rows, rows with problems, repeats inside the file, people already
 *                     in the CV list (same phone; same passport number only for staff with candidates.view_documents).
 *                     Nothing is written.
 *   runCvImport     — the same checks again inside one transaction, then insert the ready rows (source "import",
 *                     status "received", no CV file) with a cv_import_batches row, and audit the counts.
 *
 * The workbook lives only in memory for the request: it is never stored. No notifications are sent for imported
 * rows (they show in the CV list, CV matching and the daily passport-expiry digest like any other CV).
 */

export type CvImportUpload = { data: Uint8Array; name: string };

const INSERT_CHUNK = 250;
/** pg_advisory_xact_lock key: one import at a time, so two staff importing the same file cannot both add it. */
const IMPORT_LOCK_KEY = 72_310_401;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** File name for display (no path, no control characters, at most 200 characters). */
function displayFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "import.xlsx").slice(0, 200);
}

/** YYYY-MM-DD today in India (passport "expired" notes). */
function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Active trades and countries for matching the file's text. */
export async function loadCvImportLookups(tx: DbOrTx = db): Promise<CvImportLookups> {
  const [trades, countryRows] = await Promise.all([
    tx
      .select({ id: jobCategories.id, name: jobCategories.name, slug: jobCategories.slug })
      .from(jobCategories)
      .where(eq(jobCategories.isActive, true))
      .orderBy(asc(jobCategories.sortOrder), asc(jobCategories.name)),
    tx.select({ code: countries.code, name: countries.name }).from(countries).where(eq(countries.isActive, true)),
  ]);
  return { trades, countries: countryRows, today: todayInIndia() };
}

/**
 * People already in the CV list with one of these phones or passport numbers (oldest reference wins). Passport numbers
 * are compared only with `comparePassports` (staff who may see them: like the CV list search, a match would otherwise
 * confirm a number the viewer cannot see).
 */
export async function findExistingCvSubmissions(candidates: readonly CvImportCandidate[], opts: { comparePassports: boolean }, tx: DbOrTx = db): Promise<CvImportExisting> {
  const phones = [...new Set(candidates.map((c) => c.phone))];
  const passportByHash = new Map<string, string>();
  if (opts.comparePassports) for (const c of candidates) if (c.passportNumber) passportByHash.set(hmacToken(c.passportNumber, "passport"), c.passportNumber);
  const byPhone = new Map<string, string>();
  const byPassport = new Map<string, string>();
  const conditions: SQL[] = [];
  if (phones.length) conditions.push(inArray(cvSubmissions.phone, phones));
  if (passportByHash.size) conditions.push(inArray(cvSubmissions.passportNumberHash, [...passportByHash.keys()]));
  if (!conditions.length) return { byPhone, byPassport };
  const rows = await tx
    .select({ code: cvSubmissions.code, phone: cvSubmissions.phone, hash: cvSubmissions.passportNumberHash })
    .from(cvSubmissions)
    .where(conditions.length > 1 ? or(...conditions) : conditions[0])
    .orderBy(asc(cvSubmissions.createdAt));
  const wanted = new Set(phones);
  for (const r of rows) {
    if (wanted.has(r.phone) && !byPhone.has(r.phone)) byPhone.set(r.phone, r.code);
    const passport = r.hash ? passportByHash.get(r.hash) : undefined;
    if (passport && !byPassport.has(passport)) byPassport.set(passport, r.code);
  }
  return { byPhone, byPassport };
}

function assertUpload(upload: CvImportUpload): void {
  if (!upload.data.byteLength) throw new ActionError("Choose your Excel file.", { code: "invalid_file", fieldErrors: { file: ["Choose your Excel file"] } });
  if (upload.data.byteLength > CV_IMPORT_MAX_BYTES) {
    throw new ActionError("The file is larger than 4 MB. Split it into smaller files of up to 2,000 people.", { code: "invalid_file", fieldErrors: { file: ["The file is larger than 4 MB"] } });
  }
}

function candidatesOf(rows: readonly CvImportCheckedRow[]): CvImportCandidate[] {
  return rows.flatMap((r) => (r.candidate ? [r.candidate] : []));
}

/** Staff who may see passport numbers also have them compared with the CV list (see findExistingCvSubmissions). */
function comparesPassports(ctx: StaffContext): boolean {
  return staffCan(ctx, "candidates.view_documents");
}

function buildPreview(upload: CvImportUpload, fileHash: string, sheet: CvImportSheet, rows: readonly CvImportClassifiedRow[], passportsCompared: boolean): CvImportPreview {
  const lists: CvImportPreview["rows"] = { ready: [], problem: [], duplicate: [], exists: [] };
  for (const r of rows) if (lists[r.status].length < CV_IMPORT_PREVIEW_LIMIT) lists[r.status].push(toRowView(r));
  return {
    fileName: displayFileName(upload.name),
    fileHash,
    sheetName: sheet.sheetName,
    headerRow: sheet.headerRow,
    otherSheets: sheet.otherSheets,
    columnsUsed: sheet.columns.map((c) => ({ header: c.header, field: c.field, label: CV_IMPORT_FIELD_LABELS[c.field] })),
    columnsNotUsed: sheet.columnsNotUsed,
    passportsCompared,
    totalRows: rows.length,
    counts: countCvImportRows(rows),
    withNotes: rows.filter((r) => r.status === "ready" && r.view.notes.length > 0).length,
    rows: lists,
    previewLimit: CV_IMPORT_PREVIEW_LIMIT,
  };
}

/** Step 3: read and check the file (candidates.manage). Nothing is written. */
export async function previewCvImport(ctx: StaffContext, upload: CvImportUpload): Promise<CvImportPreview> {
  assertStaff(ctx, "candidates.manage");
  assertUpload(upload);
  await enforceRateLimits([{ key: `cv-import:check:${ctx.user.id}`, limit: 40, windowSeconds: 60 * 60 }], "You have checked many files in a short time. Please wait a few minutes and try again.");
  const sheet = await readCvImportWorkbook(upload.data);
  const checked = checkCvImportRows(sheet, await loadCvImportLookups());
  const comparePassports = comparesPassports(ctx);
  const existing = await findExistingCvSubmissions(candidatesOf(checked), { comparePassports });
  return buildPreview(upload, sha256(upload.data), sheet, classifyCvImportRows(checked, existing), comparePassports);
}

/**
 * Step 4: import the ready rows (candidates.manage). Staff must confirm that these people agreed to be contacted;
 * `expectedFileHash` (from the check) makes sure the file imported is the file that was checked. All or nothing:
 * the rows, their stage history, the batch and the audit entry are written in one transaction.
 */
export async function runCvImport(ctx: StaffContext, upload: CvImportUpload, opts: { consent: boolean; expectedFileHash?: string | null }): Promise<CvImportResult> {
  assertStaff(ctx, "candidates.manage");
  if (!opts.consent) {
    throw new ActionError("Tick the box to confirm these people agreed that we contact them.", { code: "consent_required", fieldErrors: { consent: ["Tick this box to import"] } });
  }
  assertUpload(upload);
  const fileHash = sha256(upload.data);
  if (opts.expectedFileHash && opts.expectedFileHash !== fileHash) {
    throw new ActionError("This file changed after you checked it. Choose it again and press Check file.", { code: "file_changed" });
  }
  await enforceRateLimits([{ key: `cv-import:run:${ctx.user.id}`, limit: 15, windowSeconds: 60 * 60 }], "You have imported many files in a short time. Please wait a few minutes and try again.");
  const sheet = await readCvImportWorkbook(upload.data);
  const checked = checkCvImportRows(sheet, await loadCvImportLookups());
  const fileName = displayFileName(upload.name);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${IMPORT_LOCK_KEY})`);
    const rows = classifyCvImportRows(checked, await findExistingCvSubmissions(candidatesOf(checked), { comparePassports: comparesPassports(ctx) }, tx));
    const counts = countCvImportRows(rows);
    const ready = rows.filter((r): r is CvImportClassifiedRow & { candidate: CvImportCandidate } => r.status === "ready" && r.candidate !== null);
    const skipped = rows.length - ready.length;

    const [batch] = await tx
      .insert(cvImportBatches)
      .values({ fileName, totalRows: rows.length, createdCount: ready.length, skippedCount: skipped, createdByUserId: ctx.user.id })
      .returning({ id: cvImportBatches.id });

    // Distinct, descending timestamps keep the file's order on the newest-first CV list (and stable pagination).
    const base = Date.now();
    const values: (typeof cvSubmissions.$inferInsert)[] = [];
    for (const [i, r] of ready.entries()) {
      const c = r.candidate;
      const at = new Date(base - i);
      values.push({
        code: await nextCode("CV", { tx }),
        name: c.name,
        phone: c.phone,
        jobCategoryId: c.jobCategoryId,
        tradeOther: c.tradeOther,
        tradeLabel: c.tradeLabel,
        experienceYears: c.experienceYears,
        experienceAbroadYears: c.experienceAbroadYears,
        experienceIndiaYears: c.experienceIndiaYears,
        email: c.email,
        preferredCountryCode: c.preferredCountryCode,
        hasPassport: c.hasPassport,
        passportNumberEncrypted: c.passportNumber ? encryptField(c.passportNumber) : null,
        passportNumberLast4: c.passportNumber ? last4(c.passportNumber) : null,
        passportNumberHash: c.passportNumber ? hmacToken(c.passportNumber, "passport") : null,
        passportExpiry: c.passportExpiry,
        candidateNotes: c.candidateNotes,
        staffRemarks: c.staffRemarks,
        remarksUpdatedAt: c.staffRemarks ? at : null,
        remarksUpdatedByUserId: c.staffRemarks ? ctx.user.id : null,
        cvFileId: null,
        source: "import",
        importBatchId: batch!.id,
        status: "received",
        consentToContact: true,
        privacyNoticeVersion: CV_IMPORT_PRIVACY_NOTICE_VERSION,
        createdAt: at,
        updatedAt: at,
      });
    }

    for (let i = 0; i < values.length; i += INSERT_CHUNK) {
      const part = values.slice(i, i + INSERT_CHUNK);
      const inserted = await tx.insert(cvSubmissions).values(part).returning({ id: cvSubmissions.id, createdAt: cvSubmissions.createdAt });
      await tx.insert(cvSubmissionStageEvents).values(inserted.map((row) => ({ submissionId: row.id, fromStatus: null, toStatus: "received" as const, changedByUserId: ctx.user.id, createdAt: row.createdAt })));
    }

    const summary: Record<CvImportRowStatus, number> = counts;
    // Counts only: no names, phones or file name in the audit trail.
    await audit({
      action: "cv_submission.imported",
      entityType: "cv_import_batch",
      entityId: batch!.id,
      actorUserId: ctx.user.id,
      metadata: { totalRows: rows.length, created: ready.length, skipped, problems: summary.problem, repeated: summary.duplicate, alreadyInList: summary.exists },
      tx,
    });

    return { batchId: batch!.id, fileName, totalRows: rows.length, created: ready.length, skipped, counts, listHref: CV_IMPORT_LIST_HREF };
  });
}

/** Step 1: the blank template with today's trades and destination countries (candidates.manage). */
export async function cvImportTemplate(ctx: StaffContext): Promise<Uint8Array> {
  assertStaff(ctx, "candidates.manage");
  const [trades, destinations] = await Promise.all([
    db.select({ name: jobCategories.name }).from(jobCategories).where(eq(jobCategories.isActive, true)).orderBy(asc(jobCategories.sortOrder), asc(jobCategories.name)),
    db
      .select({ name: countries.name })
      .from(countries)
      .where(and(eq(countries.isActive, true), eq(countries.isDestination, true)))
      .orderBy(asc(countries.sortOrder), asc(countries.name)),
  ]);
  return buildCvImportTemplate({ trades: trades.map((t) => t.name), countries: destinations.map((c) => c.name) });
}
