import "server-only";

import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { cmsEntries, countries, cvSubmissions, files, jobCategories, users } from "@/db/schema";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { encryptField, hmacToken, tryDecryptField } from "@/lib/crypto";
import { maskPhone } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit, logDataAccess, logSecurityEvent } from "@/modules/audit";
import { last4, normaliseIdentityNumber } from "@/modules/candidates/profile-rules";
import { getPublishedEntryBySlug } from "@/modules/content/queries";
import { FileValidationError, fileUrl, storeFile } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";

import { notifyBusinessInbox } from "./business-inbox";
import { CV_MAX_BYTES, OTHER_TRADE, type CvSubmissionFilters, type CvSubmissionInput, type CvSubmissionResult } from "./cv-submission-schemas";
import type { PublicSubmissionMeta } from "./enquiries";
import { assertStaff, enforceRateLimits, likePattern } from "./internal";

/**
 * "Send your CV" — the main candidate funnel. Visitors send name, phone, trade and a CV without an account;
 * staff work the list at /admin/cv-submissions (status new → contacted → shortlisted / not suitable) and call or
 * WhatsApp the candidate.
 *
 * Authorisation: list = candidates.view (phone numbers only with candidates.view_contact, logged); status and
 * notes = candidates.manage; the CV file follows the `cv_submission` file policy (candidates.view_documents or
 * recruitment.manage, every read logged by the files module).
 */

export const CV_SUBMISSIONS_ADMIN_PATH = "/admin/cv-submissions";

export type CvUpload = { data: Uint8Array; name: string; type: string | null };

type FieldErrors = Record<string, string[]>;

function invalid(fieldErrors: FieldErrors, message = "Please check the highlighted fields."): never {
  throw new ActionError(message, { fieldErrors });
}

async function resolveTrade(input: CvSubmissionInput): Promise<{ jobCategoryId: string | null; label: string }> {
  if (input.trade === OTHER_TRADE) return { jobCategoryId: null, label: input.tradeOther!.trim() };
  const [category] = await db
    .select({ id: jobCategories.id, name: jobCategories.name })
    .from(jobCategories)
    .where(and(eq(jobCategories.id, input.trade), eq(jobCategories.isActive, true)))
    .limit(1);
  if (!category) invalid({ trade: ["Choose your trade from the list, or choose Other and type it"] });
  return { jobCategoryId: category.id, label: category.name };
}

async function resolveCountry(code: string | undefined): Promise<{ code: string; name: string } | null> {
  if (!code) return null;
  const [country] = await db.select({ code: countries.code, name: countries.name }).from(countries).where(eq(countries.code, code)).limit(1);
  if (!country) invalid({ preferredCountryCode: ["Choose a country from the list"] });
  return country;
}

/** The published requirement poster a candidate applied from (silently ignored when it is no longer live). */
export async function findRequirementPoster(slug: string | undefined | null): Promise<{ id: string; slug: string; title: string } | null> {
  if (!slug) return null;
  const detail = await getPublishedEntryBySlug("requirement_posts", slug).catch(() => null);
  return detail ? { id: detail.entry.id, slug: detail.entry.slug, title: detail.entry.title } : null;
}

/**
 * Record a public CV submission. Honeypot hits are dropped silently (security event only, code null). Rate
 * limited per IP hash and phone. The CV goes through the files module (type sniffing, size limit, malware scan
 * status) as a private, ownerless `cv_submission` file in the same transaction as the row. Staff with
 * candidates.manage get an in-app alert and the business inbox an email copy.
 */
export async function submitCvSubmission(input: CvSubmissionInput, upload: CvUpload | null, meta: PublicSubmissionMeta & { sourcePage?: string | null }): Promise<CvSubmissionResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "send_cv" } });
    return { code: null, name: input.name, trade: "", requirementTitle: null };
  }
  if (!input.consentToContact) invalid({ consentToContact: ["Please agree that we may call or WhatsApp you about jobs"] });
  if (!upload || upload.data.byteLength === 0) invalid({ cv: ["Attach your CV"] });
  if (upload.data.byteLength > CV_MAX_BYTES) invalid({ cv: ["The CV is larger than 4 MB. Send a smaller file, or a photo of the first page."] });

  await enforceRateLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `cv:ip:${meta.ipHash}`, limit: 5, windowSeconds: 10 * 60 },
            { key: `cv:ip-day:${meta.ipHash}`, limit: 20, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      { key: `cv:phone:${input.phone}`, limit: 3, windowSeconds: 60 * 60 },
    ],
    "You have sent several CVs in a short time. Please wait a little, or send your CV on WhatsApp.",
  );

  const passportNumber = input.passportNumber ? normaliseIdentityNumber(input.passportNumber) : null;
  const [trade, country, requirement, policyVersion] = await Promise.all([
    resolveTrade(input),
    resolveCountry(input.preferredCountryCode),
    findRequirementPoster(input.requirement),
    getSetting("privacy.policy_version"),
  ]);

  try {
    return await db.transaction(async (tx) => {
      const code = await nextCode("CV", { tx });
      const file = await storeFile({
        data: upload.data,
        originalName: upload.name || "cv",
        declaredMimeType: upload.type,
        purpose: "cv_submission",
        ownerUserId: null,
        visibility: "private",
        metadata: { source: "send_cv", reference: code },
        tx,
      });
      const [row] = await tx
        .insert(cvSubmissions)
        .values({
          code,
          name: input.name,
          phone: input.phone,
          jobCategoryId: trade.jobCategoryId,
          tradeOther: input.trade === OTHER_TRADE ? trade.label : null,
          tradeLabel: trade.label,
          experienceYears: input.experienceYears ?? null,
          preferredCountryCode: country?.code ?? null,
          // A passport number implies a passport even when the yes/no question was skipped.
          hasPassport: passportNumber ? true : input.hasPassport,
          passportNumberEncrypted: passportNumber ? encryptField(passportNumber) : null,
          passportNumberLast4: passportNumber ? last4(passportNumber) : null,
          passportNumberHash: passportNumber ? hmacToken(passportNumber, "passport") : null,
          candidateNotes: input.candidateNotes || null,
          cvFileId: file.id,
          requirementEntryId: requirement?.id ?? null,
          requirementTitle: requirement?.title ?? null,
          consentToContact: true,
          privacyNoticeVersion: policyVersion,
          sourcePage: meta.sourcePage ?? null,
          ipHash: meta.ipHash,
        })
        .returning({ id: cvSubmissions.id });

      await audit({
        action: "cv_submission.received",
        entityType: "cv_submission",
        entityId: row!.id,
        metadata: { code, jobCategoryId: trade.jobCategoryId, requirementEntryId: requirement?.id ?? null, fileId: file.id, scanStatus: file.scanStatus },
        tx,
      });

      const data = {
        code,
        name: input.name,
        trade: trade.label,
        experienceYears: input.experienceYears ?? null,
        countryName: country?.name ?? null,
        passport: input.hasPassport === null ? null : input.hasPassport ? "Yes" : "No",
        requirementTitle: requirement?.title ?? null,
      };
      // In-app alert without the phone number (privacy by default); the business inbox copy includes it so the
      // owner can call straight from the email.
      await notifyStaff({ event: "cv.received", permission: "candidates.manage", data: { ...data, forStaff: true }, link: CV_SUBMISSIONS_ADMIN_PATH, channels: ["in_app"] }, { tx });
      await notifyBusinessInbox({ event: "cv.received", data: { ...data, phone: input.phone }, link: CV_SUBMISSIONS_ADMIN_PATH }, tx);

      return { code, name: input.name, trade: trade.label, requirementTitle: requirement?.title ?? null };
    });
  } catch (error) {
    if (error instanceof FileValidationError) invalid({ cv: [error.message] }, error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff (Command Centre)
// ---------------------------------------------------------------------------

export type CvSubmissionListItem = {
  id: string;
  code: string;
  name: string;
  /** E.164 when the viewer may see contact details, else null (see `phoneMasked`). */
  phone: string | null;
  phoneMasked: string;
  tradeLabel: string;
  experienceYears: number | null;
  countryCode: string | null;
  countryName: string | null;
  hasPassport: boolean | null;
  requirementEntryId: string | null;
  requirementTitle: string | null;
  status: CvSubmissionStatus;
  passportLast4: string | null;
  candidateNotes: string | null;
  staffRemarks: string | null;
  createdAt: Date;
  statusChangedAt: Date | null;
  statusChangedByName: string | null;
  /** Authorised, logged download URL (null when the viewer may not open CVs or the file is gone). */
  cvUrl: string | null;
  cvName: string | null;
  cvMimeType: string | null;
  cvSizeBytes: number | null;
  /** The file is waiting for (or failed) its malware scan, or was quarantined. */
  cvBlocked: boolean;
};

const CV_FILE_VIEW = ["candidates.view_documents", "recruitment.manage"] as const;

function filterConditions(filters: CvSubmissionFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(cvSubmissions.status, filters.status));
  if (filters.trade) where.push(eq(cvSubmissions.jobCategoryId, filters.trade));
  if (filters.country) where.push(eq(cvSubmissions.preferredCountryCode, filters.country));
  if (filters.q) {
    const p = likePattern(filters.q);
    where.push(or(ilike(cvSubmissions.name, p), ilike(cvSubmissions.code, p), ilike(cvSubmissions.tradeLabel, p), ilike(cvSubmissions.phone, p), ilike(cvSubmissions.requirementTitle, p))!);
  }
  return where;
}

async function listCvSubmissionsWhere(ctx: StaffContext, condition: SQL | undefined, page: PageQuery, opts: { log: boolean }): Promise<CvSubmissionListItem[]> {
  const canContact = staffCan(ctx, "candidates.view_contact");
  const canOpenCv = staffCan(ctx, [...CV_FILE_VIEW], "any");
  const rows = await db
    .select({ s: cvSubmissions, countryName: countries.name, file: files, changedBy: users.displayName })
    .from(cvSubmissions)
    .leftJoin(countries, eq(countries.code, cvSubmissions.preferredCountryCode))
    .leftJoin(files, and(eq(files.id, cvSubmissions.cvFileId), sql`${files.deletedAt} is null`))
    .leftJoin(users, eq(users.id, cvSubmissions.statusChangedByUserId))
    .where(condition)
    .orderBy(desc(cvSubmissions.createdAt))
    .limit(page.pageSize)
    .offset(page.offset);

  const items = rows.map(({ s, countryName, file, changedBy }): CvSubmissionListItem => {
    const blocked = !file || file.scanStatus === "infected" || file.scanStatus === "pending" || file.scanStatus === "error";
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      phone: canContact ? s.phone : null,
      phoneMasked: maskPhone(s.phone),
      tradeLabel: s.tradeLabel,
      experienceYears: s.experienceYears,
      countryCode: s.preferredCountryCode,
      countryName: countryName ?? null,
      hasPassport: s.hasPassport,
      passportLast4: s.passportNumberLast4,
      requirementEntryId: s.requirementEntryId,
      requirementTitle: s.requirementTitle,
      status: s.status,
      candidateNotes: s.candidateNotes,
      staffRemarks: s.staffRemarks,
      createdAt: s.createdAt,
      statusChangedAt: s.statusChangedAt,
      statusChangedByName: changedBy ?? null,
      cvUrl: canOpenCv && file && !blocked ? fileUrl(file, { download: true }) : null,
      cvName: file?.originalName ?? null,
      cvMimeType: file?.mimeType ?? null,
      cvSizeBytes: file?.sizeBytes ?? null,
      cvBlocked: blocked,
    };
  });

  if (opts.log && canContact && items.length) {
    await logDataAccess({
      actorUserId: ctx.user.id,
      subjectType: "cv_submission",
      subjectId: "list",
      dataCategory: "contact",
      accessType: "view",
      reason: "CV submissions list (phone numbers shown to call candidates back)",
      metadata: { codes: items.map((i) => i.code) },
    });
  }
  return items;
}

/** Staff list, newest first (candidates.view). Phone numbers only with candidates.view_contact (logged). */
export async function listCvSubmissions(ctx: StaffContext, filters: CvSubmissionFilters, page: PageQuery): Promise<Paginated<CvSubmissionListItem>> {
  assertStaff(ctx, "candidates.view");
  const where = filterConditions(filters);
  const condition = where.length ? and(...where) : undefined;
  const [items, totals] = await Promise.all([listCvSubmissionsWhere(ctx, condition, page, { log: true }), db.select({ value: count() }).from(cvSubmissions).where(condition)]);
  return paginated(items, totals[0]?.value ?? 0, page);
}

export async function cvSubmissionCounts(ctx: StaffContext): Promise<Record<CvSubmissionStatus, number>> {
  assertStaff(ctx, "candidates.view");
  const rows = await db.select({ status: cvSubmissions.status, value: count() }).from(cvSubmissions).groupBy(cvSubmissions.status);
  const out: Record<CvSubmissionStatus, number> = { new: 0, contacted: 0, shortlisted: 0, not_suitable: 0 };
  for (const r of rows) out[r.status] = r.value;
  return out;
}

/** Trades that appear in submissions (filter options). */
export async function listCvSubmissionTrades(ctx: StaffContext): Promise<{ value: string; label: string }[]> {
  assertStaff(ctx, "candidates.view");
  const rows = await db
    .selectDistinct({ id: jobCategories.id, name: jobCategories.name })
    .from(cvSubmissions)
    .innerJoin(jobCategories, eq(jobCategories.id, cvSubmissions.jobCategoryId))
    .orderBy(jobCategories.name);
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function lockSubmission(id: string, tx: DbOrTx) {
  const [current] = await tx.select().from(cvSubmissions).where(eq(cvSubmissions.id, id)).for("update").limit(1);
  if (!current) throw new ActionError("This CV submission could not be found.");
  return current;
}

/** Move a submission to another status (any order: staff correct mistakes). */
export async function setCvSubmissionStatus(ctx: StaffContext, input: { id: string; status: CvSubmissionStatus }): Promise<void> {
  assertStaff(ctx, "candidates.manage");
  await db.transaction(async (tx) => {
    const current = await lockSubmission(input.id, tx);
    if (current.status === input.status) return;
    const stamp = new Date();
    await tx
      .update(cvSubmissions)
      .set({
        status: input.status,
        statusChangedAt: stamp,
        statusChangedByUserId: ctx.user.id,
        contactedAt: current.contactedAt ?? (input.status !== "new" ? stamp : null),
      })
      .where(eq(cvSubmissions.id, current.id));
    await audit({
      action: "cv_submission.status_changed",
      entityType: "cv_submission",
      entityId: current.id,
      actorUserId: ctx.user.id,
      metadata: { from: current.status, to: input.status },
      tx,
    });
  });
}

/** Staff-only remarks (whole text replaced; blank clears). Audited without the text itself. */
export async function setCvSubmissionRemarks(ctx: StaffContext, input: { id: string; remarks?: string | null }): Promise<void> {
  assertStaff(ctx, "candidates.manage");
  const remarks = input.remarks?.trim() || null;
  await db.transaction(async (tx) => {
    const current = await lockSubmission(input.id, tx);
    if ((current.staffRemarks ?? null) === remarks) return;
    await tx
      .update(cvSubmissions)
      .set({ staffRemarks: remarks, remarksUpdatedAt: new Date(), remarksUpdatedByUserId: ctx.user.id })
      .where(eq(cvSubmissions.id, current.id));
    await audit({
      action: "cv_submission.remarks_updated",
      entityType: "cv_submission",
      entityId: current.id,
      actorUserId: ctx.user.id,
      metadata: { cleared: remarks === null, length: remarks?.length ?? 0 },
      tx,
    });
  });
}

export type CvSubmissionDetail = CvSubmissionListItem & {
  tradeOther: string | null;
  jobCategoryId: string | null;
  requirementSlug: string | null;
  sourcePage: string | null;
  privacyNoticeVersion: string | null;
  contactedAt: Date | null;
  remarksUpdatedAt: Date | null;
  remarksUpdatedByName: string | null;
  /** May the viewer reveal the full passport number (candidates.view_documents)? */
  canRevealPassport: boolean;
  /** Full passport number: only when asked for and allowed (the reveal is logged). */
  passportNumber: string | null;
};

/**
 * One submission for the staff detail view (candidates.view). The phone number needs candidates.view_contact
 * (logged view); the full passport number needs candidates.view_documents and an explicit reveal (logged), as for
 * candidate profiles. Follow-up features (more documents, exports) build on this id.
 */
export async function getCvSubmission(ctx: StaffContext, id: string, opts: { revealPassport?: boolean } = {}): Promise<CvSubmissionDetail | null> {
  assertStaff(ctx, "candidates.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const page = await listCvSubmissionsWhere(ctx, eq(cvSubmissions.id, id), { page: 1, pageSize: 1, offset: 0 }, { log: false });
  const item = page[0];
  if (!item) return null;
  const [row] = await db
    .select({ s: cvSubmissions, remarksBy: users.displayName, requirementSlug: cmsEntries.slug })
    .from(cvSubmissions)
    .leftJoin(users, eq(users.id, cvSubmissions.remarksUpdatedByUserId))
    .leftJoin(cmsEntries, and(eq(cmsEntries.id, cvSubmissions.requirementEntryId), isNull(cmsEntries.deletedAt)))
    .where(eq(cvSubmissions.id, id))
    .limit(1);
  const s = row!.s;
  const canRevealPassport = staffCan(ctx, "candidates.view_documents");
  const reveal = Boolean(opts.revealPassport && canRevealPassport && s.passportNumberEncrypted);
  const passportNumber = reveal ? tryDecryptField(s.passportNumberEncrypted) : null;
  const base = { actorUserId: ctx.user.id, subjectType: "cv_submission", subjectId: s.id } as const;
  if (item.phone) await logDataAccess({ ...base, dataCategory: "contact", accessType: "view", reason: "CV submission detail" });
  if (reveal) await logDataAccess({ ...base, dataCategory: "identity", accessType: "reveal", reason: "Passport number on a CV submission", metadata: { field: "passportNumber" } });
  return {
    ...item,
    tradeOther: s.tradeOther,
    jobCategoryId: s.jobCategoryId,
    requirementSlug: row!.requirementSlug ?? null,
    sourcePage: s.sourcePage,
    privacyNoticeVersion: s.privacyNoticeVersion,
    contactedAt: s.contactedAt,
    remarksUpdatedAt: s.remarksUpdatedAt,
    remarksUpdatedByName: row!.remarksBy ?? null,
    canRevealPassport,
    passportNumber,
  };
}
