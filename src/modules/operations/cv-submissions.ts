import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { cmsEntries, countries, cvSubmissions, cvSubmissionStageEvents, files, jobCategories, organizations, users } from "@/db/schema";
import type { CvSubmissionSource, CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { ActionError } from "@/lib/actions";
import { nextCode } from "@/lib/codes";
import { encryptField, hmacToken, tryDecryptField } from "@/lib/crypto";
import { maskEmail, maskPhone } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit, logDataAccess, logSecurityEvent } from "@/modules/audit";
import { last4, normaliseIdentityNumber } from "@/modules/candidates/profile-rules";
import { getPublishedEntryBySlug } from "@/modules/content/queries";
import { FileValidationError, fileUrl, softDeleteFile, storeFile } from "@/modules/files";
import { claimSharedUpload } from "@/modules/files/shared-uploads";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";

import { notifyBusinessInbox } from "./business-inbox";
import { issueCvDocumentUploadToken } from "./cv-document-tokens";
import {
  CV_MAX_BYTES,
  CV_SUBMISSION_JOURNEY,
  CV_SUBMISSION_STATUS_VALUES,
  maskPassportLast4,
  OTHER_TRADE,
  totalExperienceYears,
  type CvStatusView,
  type CvSubmissionFilters,
  type CvSubmissionInput,
  type CvSubmissionResult,
} from "./cv-submission-schemas";
import type { PublicSubmissionMeta } from "./enquiries";
import { assertStaff, enforceRateLimits, likePattern } from "./internal";

/**
 * "Send your CV" / quick apply — the main candidate funnel. Visitors send name, phone and trade (email, experience
 * abroad and in India, passport, notes and a CV file are optional) without an account; staff work the list at
 * /admin/cv-submissions (and per requirement poster at /admin/requirements/posters/<id>/applicants) through the
 * placement journey (received → contacted → trade test → selected → medical → visa → ticket → departed, or not
 * suitable / on hold) and call or WhatsApp the candidate. Each stage change is kept in cv_submission_stage_events; the
 * candidate follows it on the public /status page (mobile number + reference) with an optional note written for them.
 *
 * Authorisation: list = candidates.view (phone numbers and emails only with candidates.view_contact, full passport
 * numbers only with candidates.view_documents, both logged); status, notes and attaching a CV = candidates.manage; the
 * CV file follows the `cv_submission` file policy (candidates.view_documents or recruitment.manage, every read logged
 * by the files module).
 */

export const CV_SUBMISSIONS_ADMIN_PATH = "/admin/cv-submissions";

/** Staff page listing everyone who applied from one requirement poster. */
export function posterApplicantsPath(posterId: string): string {
  return `/admin/requirements/posters/${posterId}/applicants`;
}

export type CvUpload = { data: Uint8Array; name: string; type: string | null };
/** A file already shared to the site (Web Share Target / /share/choose): its signed token, spent once. */
export type CvSharedFile = { sharedToken: string };

type FieldErrors = Record<string, string[]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** "1 year" / "5 years" for notifications (strings, so 0 years still shows). */
function yearsText(value: number | null | undefined): string | null {
  return value == null ? null : `${value} ${value === 1 ? "year" : "years"}`;
}

/** The CV part of a submission: a real upload, a shared file token, or nothing (sent later on WhatsApp). */
function usableUpload(upload: CvUpload | CvSharedFile | null): CvUpload | CvSharedFile | null {
  if (!upload) return null;
  if ("data" in upload) return upload.data.byteLength > 0 ? upload : null;
  return upload.sharedToken ? upload : null;
}

/**
 * Record a public CV submission / job application. Honeypot hits are dropped silently (security event only, code
 * null). Rate limited per IP hash and phone. The CV file is optional (the candidate may send it later on WhatsApp);
 * when given it goes through the files module (type sniffing, size limit, malware scan status) as a private,
 * ownerless `cv_submission` file in the same transaction as the row. Instead of a new upload, the CV may be a shared
 * file (token from /share): it is re-linked to the `cv_submission` purpose in the same transaction (once). Staff with
 * candidates.manage get an in-app alert and the business inbox an email copy.
 */
export async function submitCvSubmission(input: CvSubmissionInput, upload: CvUpload | CvSharedFile | null, meta: PublicSubmissionMeta & { sourcePage?: string | null }): Promise<CvSubmissionResult> {
  if (input.website?.trim()) {
    await logSecurityEvent({ type: "form_honeypot_triggered", severity: "info", metadata: { form: "send_cv" } });
    return { code: null, name: input.name, trade: "", requirementTitle: null, hasCv: false, uploadToken: null };
  }
  if (!input.consentToContact) invalid({ consentToContact: ["Please agree that we may call or WhatsApp you about jobs"] });
  const cv = usableUpload(upload);
  if (cv && "data" in cv && cv.data.byteLength > CV_MAX_BYTES) invalid({ cv: ["The CV is larger than 4 MB. Send a smaller file, or a photo of the first page."] });

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
    "You have sent several applications in a short time. Please wait a little, or send your CV on WhatsApp.",
  );

  const passportNumber = input.passportNumber ? normaliseIdentityNumber(input.passportNumber) : null;
  const abroad = input.experienceAbroadYears ?? null;
  const india = input.experienceIndiaYears ?? null;
  const experienceYears = totalExperienceYears(abroad, india, input.experienceYears ?? null);
  const email = input.email?.trim().toLowerCase() || null;
  const referralCode = input.referralCode ?? null;
  const [trade, country, requirement, policyVersion] = await Promise.all([
    resolveTrade(input),
    resolveCountry(input.preferredCountryCode),
    findRequirementPoster(input.requirement),
    getSetting("privacy.policy_version"),
  ]);

  try {
    return await db.transaction(async (tx) => {
      const code = await nextCode("CV", { tx });
      const file = !cv
        ? null
        : "data" in cv
          ? await storeFile({
              data: cv.data,
              originalName: cv.name || "cv",
              declaredMimeType: cv.type,
              purpose: "cv_submission",
              ownerUserId: null,
              visibility: "private",
              metadata: { source: "send_cv", reference: code },
              tx,
            })
          : await claimSharedUpload(cv.sharedToken, { purpose: "cv_submission", ownerUserId: null, metadata: { source: "send_cv_shared", reference: code } }, tx);
      const [row] = await tx
        .insert(cvSubmissions)
        .values({
          code,
          name: input.name,
          phone: input.phone,
          jobCategoryId: trade.jobCategoryId,
          tradeOther: input.trade === OTHER_TRADE ? trade.label : null,
          tradeLabel: trade.label,
          experienceYears,
          experienceAbroadYears: abroad,
          experienceIndiaYears: india,
          email,
          preferredCountryCode: country?.code ?? null,
          // A passport number implies a passport even when the yes/no question was skipped.
          hasPassport: passportNumber ? true : input.hasPassport,
          passportNumberEncrypted: passportNumber ? encryptField(passportNumber) : null,
          passportNumberLast4: passportNumber ? last4(passportNumber) : null,
          passportNumberHash: passportNumber ? hmacToken(passportNumber, "passport") : null,
          passportExpiry: input.passportExpiry ?? null,
          candidateNotes: input.candidateNotes || null,
          cvFileId: file?.id ?? null,
          source: "website",
          referralCode,
          requirementEntryId: requirement?.id ?? null,
          requirementTitle: requirement?.title ?? null,
          consentToContact: true,
          privacyNoticeVersion: policyVersion,
          sourcePage: meta.sourcePage ?? null,
          ipHash: meta.ipHash,
        })
        .returning({ id: cvSubmissions.id });
      await tx.insert(cvSubmissionStageEvents).values({ submissionId: row!.id, fromStatus: null, toStatus: "received" });

      await audit({
        action: "cv_submission.received",
        entityType: "cv_submission",
        entityId: row!.id,
        metadata: {
          code,
          jobCategoryId: trade.jobCategoryId,
          requirementEntryId: requirement?.id ?? null,
          fileId: file?.id ?? null,
          scanStatus: file?.scanStatus ?? null,
          hasCv: Boolean(file),
          referralCode,
        },
        tx,
      });

      const data = {
        code,
        name: input.name,
        trade: trade.label,
        abroad: yearsText(abroad),
        india: yearsText(india),
        // The older single figure, only when the split was not given.
        experienceYears: abroad === null && india === null ? experienceYears : null,
        countryName: country?.name ?? null,
        passport: passportNumber || input.hasPassport ? "Yes" : input.hasPassport === false ? "No" : null,
        requirementTitle: requirement?.title ?? null,
        referralCode,
        cvMissing: !file,
      };
      // In-app alert without the phone number or email (privacy by default); the business inbox copy includes them so
      // the owner can call or reply straight from the email.
      await notifyStaff({ event: "cv.received", permission: "candidates.manage", data: { ...data, forStaff: true }, link: CV_SUBMISSIONS_ADMIN_PATH, channels: ["in_app"] }, { tx });
      await notifyBusinessInbox({ event: "cv.received", data: { ...data, phone: input.phone, email }, link: CV_SUBMISSIONS_ADMIN_PATH }, tx);

      return {
        code,
        name: input.name,
        trade: trade.label,
        requirementTitle: requirement?.title ?? null,
        hasCv: Boolean(file),
        uploadToken: issueCvDocumentUploadToken(row!.id, "candidate").token,
      };
    });
  } catch (error) {
    if (error instanceof FileValidationError) invalid({ cv: [error.message] }, error.message);
    if (error instanceof ActionError && error.code === "shared_file_expired") {
      invalid({ cv: ["The shared file has expired or was already sent. Choose your CV again, or apply without it."] }, "The shared file has expired or was already sent. Choose your CV again, or apply without it.");
    }
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
  /** Full email when the viewer may see contact details, else null (see `emailMasked`). */
  email: string | null;
  /** r***@gmail.com, or null when no email was given. */
  emailMasked: string | null;
  tradeLabel: string;
  /** Total years (abroad + India, or the older single figure). */
  experienceYears: number | null;
  experienceAbroadYears: number | null;
  experienceIndiaYears: number | null;
  countryCode: string | null;
  countryName: string | null;
  hasPassport: boolean | null;
  /**
   * Passport number to show: the full number for staff with candidates.view_documents (the list view is logged),
   * else XXXX1234; null when no number was given.
   */
  passportDisplay: string | null;
  /** passportDisplay is the full number. */
  passportFull: boolean;
  /** YYYY-MM-DD as the candidate gave it. */
  passportExpiry: string | null;
  /** The passport expires within 6 months (or has expired). */
  passportExpiringSoon: boolean;
  requirementEntryId: string | null;
  requirementTitle: string | null;
  status: CvSubmissionStatus;
  passportLast4: string | null;
  candidateNotes: string | null;
  staffRemarks: string | null;
  source: CvSubmissionSource;
  /** "Refer a friend" code the candidate came with. */
  referralCode: string | null;
  createdAt: Date;
  statusChangedAt: Date | null;
  statusChangedByName: string | null;
  /** A CV file is attached (false: the candidate applied without one; ask on WhatsApp). */
  hasCv: boolean;
  /** Authorised, logged download URL (null when there is no CV, the viewer may not open CVs or the file is gone). */
  cvUrl: string | null;
  cvName: string | null;
  cvMimeType: string | null;
  cvSizeBytes: number | null;
  /** The attached file is waiting for (or failed) its malware scan, was quarantined or removed. */
  cvBlocked: boolean;
};

const CV_FILE_VIEW = ["candidates.view_documents", "recruitment.manage"] as const;

/** Passports expiring within this many months are flagged ("Expiring soon") and alerted (documents.expiry_alerts). */
export const PASSPORT_EXPIRY_WARNING_MONTHS = 6;

/** Largest "Copy all phone numbers" (same cap as the Excel download). */
export const CV_PHONE_COPY_LIMIT = 5000;

/** YYYY-MM-DD today + n months (UTC calendar), for comparing with date columns. */
export function isoDatePlusMonths(months: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/**
 * Free-text search: name, reference, trade, requirement, email and phone (also typed with spaces, "98765 43210").
 * Four letters/digits also match the passport's last 4. A full passport number matches through the blind index, but
 * only for staff who may see passport numbers (otherwise the search would confirm a number they cannot see).
 */
function searchCondition(q: string, opts: { passportHash: boolean }): SQL {
  const p = likePattern(q);
  const any: SQL[] = [
    ilike(cvSubmissions.name, p),
    ilike(cvSubmissions.code, p),
    ilike(cvSubmissions.tradeLabel, p),
    ilike(cvSubmissions.phone, p),
    ilike(cvSubmissions.requirementTitle, p),
    ilike(cvSubmissions.email, p),
  ];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) any.push(ilike(cvSubmissions.phone, `%${digits}%`));
  const compact = normaliseIdentityNumber(q.trim());
  if (/^[A-Z0-9]{4}$/.test(compact)) any.push(eq(cvSubmissions.passportNumberLast4, compact));
  if (opts.passportHash && /^[A-Z0-9]{6,12}$/.test(compact) && /\d/.test(compact)) any.push(eq(cvSubmissions.passportNumberHash, hmacToken(compact, "passport")));
  return or(...any)!;
}

function filterConditions(ctx: StaffContext, filters: CvSubmissionFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(cvSubmissions.status, filters.status));
  if (filters.trade) where.push(eq(cvSubmissions.jobCategoryId, filters.trade));
  if (filters.country) where.push(eq(cvSubmissions.preferredCountryCode, filters.country));
  if (filters.requirement) where.push(eq(cvSubmissions.requirementEntryId, filters.requirement));
  if (filters.source) where.push(eq(cvSubmissions.source, filters.source));
  if (filters.cv === "yes") where.push(isNotNull(cvSubmissions.cvFileId));
  if (filters.cv === "no") where.push(isNull(cvSubmissions.cvFileId));
  if (filters.expiring) where.push(isNotNull(cvSubmissions.passportExpiry), sql`${cvSubmissions.passportExpiry} <= ${isoDatePlusMonths(PASSPORT_EXPIRY_WARNING_MONTHS)}`);
  if (filters.q) where.push(searchCondition(filters.q, { passportHash: staffCan(ctx, "candidates.view_documents") }));
  return where;
}

function whereOf(ctx: StaffContext, filters: CvSubmissionFilters): SQL | undefined {
  const where = filterConditions(ctx, filters);
  return where.length ? and(...where) : undefined;
}

async function listCvSubmissionsWhere(
  ctx: StaffContext,
  condition: SQL | undefined,
  page: PageQuery,
  opts: { log: boolean; fullPassports: boolean },
): Promise<CvSubmissionListItem[]> {
  const canContact = staffCan(ctx, "candidates.view_contact");
  const canOpenCv = staffCan(ctx, [...CV_FILE_VIEW], "any");
  const showPassports = opts.fullPassports && staffCan(ctx, "candidates.view_documents");
  const warnBefore = isoDatePlusMonths(PASSPORT_EXPIRY_WARNING_MONTHS);
  const rows = await db
    .select({ s: cvSubmissions, countryName: countries.name, file: files, changedBy: users.displayName })
    .from(cvSubmissions)
    .leftJoin(countries, eq(countries.code, cvSubmissions.preferredCountryCode))
    .leftJoin(files, and(eq(files.id, cvSubmissions.cvFileId), sql`${files.deletedAt} is null`))
    .leftJoin(users, eq(users.id, cvSubmissions.statusChangedByUserId))
    .where(condition)
    .orderBy(desc(cvSubmissions.createdAt), desc(cvSubmissions.id))
    .limit(page.pageSize)
    .offset(page.offset);

  const passportsShown: string[] = [];
  const items = rows.map(({ s, countryName, file, changedBy }): CvSubmissionListItem => {
    const hasCv = s.cvFileId !== null;
    const blocked = hasCv && (!file || file.scanStatus === "infected" || file.scanStatus === "pending" || file.scanStatus === "error");
    const full = showPassports && s.passportNumberEncrypted ? tryDecryptField(s.passportNumberEncrypted) : null;
    if (full) passportsShown.push(s.code);
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      phone: canContact ? s.phone : null,
      phoneMasked: maskPhone(s.phone),
      email: canContact ? s.email : null,
      emailMasked: s.email ? maskEmail(s.email) : null,
      tradeLabel: s.tradeLabel,
      experienceYears: s.experienceYears,
      experienceAbroadYears: s.experienceAbroadYears,
      experienceIndiaYears: s.experienceIndiaYears,
      countryCode: s.preferredCountryCode,
      countryName: countryName ?? null,
      hasPassport: s.hasPassport,
      passportDisplay: full ?? (maskPassportLast4(s.passportNumberLast4) || null),
      passportFull: Boolean(full),
      passportExpiry: s.passportExpiry,
      passportExpiringSoon: Boolean(s.passportExpiry && s.passportExpiry <= warnBefore),
      passportLast4: s.passportNumberLast4,
      requirementEntryId: s.requirementEntryId,
      requirementTitle: s.requirementTitle,
      status: s.status,
      candidateNotes: s.candidateNotes,
      staffRemarks: s.staffRemarks,
      source: s.source,
      referralCode: s.referralCode,
      createdAt: s.createdAt,
      statusChangedAt: s.statusChangedAt,
      statusChangedByName: changedBy ?? null,
      hasCv,
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
      reason: "CV submissions list (phone numbers and emails shown to contact candidates)",
      metadata: { codes: items.map((i) => i.code) },
    });
  }
  if (opts.log && passportsShown.length) {
    await logDataAccess({
      actorUserId: ctx.user.id,
      subjectType: "cv_submission",
      subjectId: "list",
      dataCategory: "identity",
      accessType: "view",
      reason: "CV submissions list (full passport numbers shown)",
      metadata: { field: "passportNumber", codes: passportsShown },
    });
  }
  return items;
}

/**
 * Staff list, newest first (candidates.view), with the list filters (requirement poster, source, has CV…). Phone
 * numbers and emails only with candidates.view_contact, full passport numbers only with candidates.view_documents
 * (both logged).
 */
export async function listCvSubmissions(ctx: StaffContext, filters: CvSubmissionFilters, page: PageQuery): Promise<Paginated<CvSubmissionListItem>> {
  assertStaff(ctx, "candidates.view");
  const condition = whereOf(ctx, filters);
  const [items, totals] = await Promise.all([
    listCvSubmissionsWhere(ctx, condition, page, { log: true, fullPassports: true }),
    db.select({ value: count() }).from(cvSubmissions).where(condition),
  ]);
  return paginated(items, totals[0]?.value ?? 0, page);
}

export async function cvSubmissionCounts(ctx: StaffContext, filters: Pick<CvSubmissionFilters, "requirement"> = {}): Promise<Record<CvSubmissionStatus, number>> {
  assertStaff(ctx, "candidates.view");
  const rows = await db
    .select({ status: cvSubmissions.status, value: count() })
    .from(cvSubmissions)
    .where(filters.requirement ? eq(cvSubmissions.requirementEntryId, filters.requirement) : undefined)
    .groupBy(cvSubmissions.status);
  const out = Object.fromEntries(CV_SUBMISSION_STATUS_VALUES.map((v) => [v, 0])) as Record<CvSubmissionStatus, number>;
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

/** Requirement posters people applied for (list filter options), most recent applications first. */
export async function listCvSubmissionRequirements(ctx: StaffContext): Promise<{ value: string; label: string }[]> {
  assertStaff(ctx, "candidates.view");
  const latest = sql<Date>`max(${cvSubmissions.createdAt})`;
  const rows = await db
    .select({ id: cvSubmissions.requirementEntryId, saved: sql<string | null>`max(${cvSubmissions.requirementTitle})`, current: cmsEntries.title, latest })
    .from(cvSubmissions)
    .leftJoin(cmsEntries, and(eq(cmsEntries.id, cvSubmissions.requirementEntryId), isNull(cmsEntries.deletedAt)))
    .where(isNotNull(cvSubmissions.requirementEntryId))
    .groupBy(cvSubmissions.requirementEntryId, cmsEntries.title)
    .orderBy(desc(latest))
    .limit(300);
  return rows.flatMap((r) => (r.id ? [{ value: r.id, label: r.current ?? r.saved ?? "Requirement" }] : []));
}

/** Title of a requirement poster for headings and Excel title rows (poster title, else the title saved with an application). */
export async function getCvRequirementTitle(ctx: StaffContext, posterId: string): Promise<string | null> {
  assertStaff(ctx, "candidates.view");
  if (!UUID.test(posterId)) return null;
  const [entry] = await db
    .select({ title: cmsEntries.title })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.id, posterId), eq(cmsEntries.collection, "requirement_posts")))
    .limit(1);
  if (entry) return entry.title;
  const [saved] = await db
    .select({ title: cvSubmissions.requirementTitle })
    .from(cvSubmissions)
    .where(and(eq(cvSubmissions.requirementEntryId, posterId), isNotNull(cvSubmissions.requirementTitle)))
    .orderBy(desc(cvSubmissions.createdAt))
    .limit(1);
  return saved?.title ?? null;
}

/** Applicants per requirement poster (posters list "Applicants (N)"). candidates.view. */
export async function countApplicantsByPoster(ctx: StaffContext, posterIds: readonly string[]): Promise<Map<string, number>> {
  assertStaff(ctx, "candidates.view");
  const ids = [...new Set(posterIds.filter((id) => UUID.test(id)))];
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: cvSubmissions.requirementEntryId, value: count() })
    .from(cvSubmissions)
    .where(inArray(cvSubmissions.requirementEntryId, ids))
    .groupBy(cvSubmissions.requirementEntryId);
  return new Map(rows.flatMap((r) => (r.id ? [[r.id, r.value] as const] : [])));
}

/**
 * Every mobile number in a filtered list (e.g. all applicants of one poster), newest first, without duplicates:
 * "Copy all phone numbers". candidates.view + candidates.view_contact; one data-access log row with the filters, the
 * count and the references.
 */
export async function listCvSubmissionPhones(ctx: StaffContext, filters: CvSubmissionFilters, opts: { reason: string }): Promise<{ phones: string[]; people: number }> {
  assertStaff(ctx, ["candidates.view", "candidates.view_contact"]);
  const rows = await db
    .select({ code: cvSubmissions.code, phone: cvSubmissions.phone })
    .from(cvSubmissions)
    .where(whereOf(ctx, filters))
    .orderBy(desc(cvSubmissions.createdAt), desc(cvSubmissions.id))
    .limit(CV_PHONE_COPY_LIMIT);
  const phones = [...new Set(rows.map((r) => r.phone))];
  if (rows.length) {
    await logDataAccess({
      actorUserId: ctx.user.id,
      subjectType: "cv_submission",
      subjectId: "list",
      dataCategory: "contact",
      accessType: "export",
      reason: opts.reason,
      metadata: { filters, people: rows.length, numbers: phones.length, codes: rows.slice(0, 1000).map((r) => r.code) },
    });
  }
  return { phones, people: rows.length };
}

async function lockSubmission(id: string, tx: DbOrTx) {
  const [current] = await tx.select().from(cvSubmissions).where(eq(cvSubmissions.id, id)).for("update").limit(1);
  if (!current) throw new ActionError("This CV submission could not be found.");
  return current;
}

/**
 * Move a submission to another stage (any order: staff correct mistakes) and/or set the note shown to the candidate on
 * /status (`candidateNote` undefined = unchanged, blank = cleared). Every stage change is kept in the stage history;
 * both are audited (the note without its text).
 */
export async function setCvSubmissionStatus(ctx: StaffContext, input: { id: string; status: CvSubmissionStatus; candidateNote?: string | null }): Promise<void> {
  assertStaff(ctx, "candidates.manage");
  const note = input.candidateNote === undefined ? undefined : input.candidateNote?.trim() || null;
  await db.transaction(async (tx) => {
    const current = await lockSubmission(input.id, tx);
    const statusChanged = current.status !== input.status;
    const noteChanged = note !== undefined && (current.candidateNote ?? null) !== note;
    if (!statusChanged && !noteChanged) return;
    const stamp = new Date();
    await tx
      .update(cvSubmissions)
      .set({
        ...(statusChanged
          ? {
              status: input.status,
              statusChangedAt: stamp,
              statusChangedByUserId: ctx.user.id,
              contactedAt: current.contactedAt ?? (input.status !== "received" ? stamp : null),
            }
          : {}),
        ...(noteChanged ? { candidateNote: note, candidateNoteUpdatedAt: stamp } : {}),
      })
      .where(eq(cvSubmissions.id, current.id));
    if (statusChanged) {
      await tx.insert(cvSubmissionStageEvents).values({
        submissionId: current.id,
        fromStatus: current.status,
        toStatus: input.status,
        candidateNote: note === undefined ? current.candidateNote : note,
        changedByUserId: ctx.user.id,
        createdAt: stamp,
      });
      await audit({
        action: "cv_submission.status_changed",
        entityType: "cv_submission",
        entityId: current.id,
        actorUserId: ctx.user.id,
        metadata: { from: current.status, to: input.status },
        tx,
      });
    }
    if (noteChanged) {
      await audit({
        action: "cv_submission.candidate_note_updated",
        entityType: "cv_submission",
        entityId: current.id,
        actorUserId: ctx.user.id,
        metadata: { cleared: note === null, length: note?.length ?? 0 },
        tx,
      });
    }
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

/**
 * Staff attach the CV the candidate sent later (usually on WhatsApp) to a submission, or replace the attached one
 * (candidates.manage). Same file rules as the public form (purpose cv_submission, 4 MB, type sniffing, scan status);
 * a replaced file is soft-deleted. Audited with the file id only.
 */
export async function attachCvSubmissionFile(ctx: StaffContext, input: { id: string; upload: CvUpload | null }): Promise<{ replaced: boolean }> {
  assertStaff(ctx, "candidates.manage");
  if (!UUID.test(input.id)) throw new ActionError("This CV submission could not be found.");
  const upload = input.upload && input.upload.data.byteLength > 0 ? input.upload : null;
  if (!upload) invalid({ cv: ["Choose the CV file"] }, "Choose the CV file.");
  if (upload.data.byteLength > CV_MAX_BYTES) invalid({ cv: ["The CV is larger than 4 MB. Send a smaller file, or a photo of the first page."] }, "The CV is larger than 4 MB.");
  try {
    return await db.transaction(async (tx) => {
      const current = await lockSubmission(input.id, tx);
      const file = await storeFile({
        data: upload.data,
        originalName: upload.name || "cv",
        declaredMimeType: upload.type,
        purpose: "cv_submission",
        ownerUserId: null,
        visibility: "private",
        metadata: { source: "staff", reference: current.code },
        tx,
      });
      await tx.update(cvSubmissions).set({ cvFileId: file.id, updatedAt: new Date() }).where(eq(cvSubmissions.id, current.id));
      if (current.cvFileId) await softDeleteFile(current.cvFileId, { actorUserId: ctx.user.id, reason: "CV replaced by staff", tx });
      await audit({
        action: "cv_submission.cv_attached",
        entityType: "cv_submission",
        entityId: current.id,
        actorUserId: ctx.user.id,
        metadata: { fileId: file.id, replacedFileId: current.cvFileId, scanStatus: file.scanStatus },
        tx,
      });
      return { replaced: current.cvFileId !== null };
    });
  } catch (error) {
    if (error instanceof FileValidationError) invalid({ cv: [error.message] }, error.message);
    throw error;
  }
}

export type CvSubmissionStageEvent = { status: CvSubmissionStatus; from: CvSubmissionStatus | null; at: Date; byName: string | null; candidateNote: string | null };

export type CvSubmissionDetail = CvSubmissionListItem & {
  /** Note shown to the candidate on /status (separate from staffRemarks). */
  candidateNote: string | null;
  candidateNoteUpdatedAt: Date | null;
  /** Stage history, oldest first. */
  stageHistory: CvSubmissionStageEvent[];
  tradeOther: string | null;
  jobCategoryId: string | null;
  requirementSlug: string | null;
  sourcePage: string | null;
  privacyNoticeVersion: string | null;
  contactedAt: Date | null;
  remarksUpdatedAt: Date | null;
  remarksUpdatedByName: string | null;
  /** Travel agency / company the worker was supplied to (set by staff for per-worker invoices). */
  placedOrganizationName: string | null;
  /** May the viewer reveal the full passport number (candidates.view_documents)? */
  canRevealPassport: boolean;
  /** Full passport number: only when asked for and allowed (the reveal is logged). */
  passportNumber: string | null;
};

/**
 * One submission for the staff detail view (candidates.view). The phone number and email need
 * candidates.view_contact (logged view); the full passport number needs candidates.view_documents and an explicit
 * reveal (logged), as for candidate profiles. Follow-up features (more documents, exports, invoices) build on this id.
 */
export async function getCvSubmission(ctx: StaffContext, id: string, opts: { revealPassport?: boolean } = {}): Promise<CvSubmissionDetail | null> {
  assertStaff(ctx, "candidates.view");
  if (!UUID.test(id)) return null;
  const page = await listCvSubmissionsWhere(ctx, eq(cvSubmissions.id, id), { page: 1, pageSize: 1, offset: 0 }, { log: false, fullPassports: false });
  const item = page[0];
  if (!item) return null;
  const [row] = await db
    .select({ s: cvSubmissions, remarksBy: users.displayName, requirementSlug: cmsEntries.slug, placedOrganizationName: organizations.name })
    .from(cvSubmissions)
    .leftJoin(users, eq(users.id, cvSubmissions.remarksUpdatedByUserId))
    .leftJoin(cmsEntries, and(eq(cmsEntries.id, cvSubmissions.requirementEntryId), isNull(cmsEntries.deletedAt)))
    .leftJoin(organizations, eq(organizations.id, cvSubmissions.placedOrganizationId))
    .where(eq(cvSubmissions.id, id))
    .limit(1);
  const s = row!.s;
  const canRevealPassport = staffCan(ctx, "candidates.view_documents");
  const reveal = Boolean(opts.revealPassport && canRevealPassport && s.passportNumberEncrypted);
  const passportNumber = reveal ? tryDecryptField(s.passportNumberEncrypted) : null;
  const history = await db
    .select({ e: cvSubmissionStageEvents, byName: users.displayName })
    .from(cvSubmissionStageEvents)
    .leftJoin(users, eq(users.id, cvSubmissionStageEvents.changedByUserId))
    .where(eq(cvSubmissionStageEvents.submissionId, s.id))
    .orderBy(asc(cvSubmissionStageEvents.createdAt));
  const base = { actorUserId: ctx.user.id, subjectType: "cv_submission", subjectId: s.id } as const;
  if (item.phone) await logDataAccess({ ...base, dataCategory: "contact", accessType: "view", reason: "CV submission detail" });
  if (reveal) await logDataAccess({ ...base, dataCategory: "identity", accessType: "reveal", reason: "Passport number on a CV submission", metadata: { field: "passportNumber" } });
  return {
    ...item,
    ...(passportNumber ? { passportDisplay: passportNumber, passportFull: true } : {}),
    tradeOther: s.tradeOther,
    jobCategoryId: s.jobCategoryId,
    requirementSlug: row!.requirementSlug ?? null,
    sourcePage: s.sourcePage,
    privacyNoticeVersion: s.privacyNoticeVersion,
    contactedAt: s.contactedAt,
    remarksUpdatedAt: s.remarksUpdatedAt,
    remarksUpdatedByName: row!.remarksBy ?? null,
    placedOrganizationName: row!.placedOrganizationName ?? null,
    canRevealPassport,
    passportNumber,
    candidateNote: s.candidateNote,
    candidateNoteUpdatedAt: s.candidateNoteUpdatedAt,
    stageHistory: history.map(({ e, byName }) => ({ status: e.toStatus, from: e.fromStatus, at: e.createdAt, byName: byName ?? null, candidateNote: e.candidateNote })),
  };
}

export type CvSubmissionExportRow = {
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  tradeLabel: string;
  experienceYears: number | null;
  experienceAbroadYears: number | null;
  experienceIndiaYears: number | null;
  countryName: string | null;
  requirementTitle: string | null;
  status: CvSubmissionStatus;
  passportEncrypted: string | null;
  passportLast4: string | null;
  hasPassport: boolean | null;
  passportExpiry: string | null;
  candidateNotes: string | null;
  staffRemarks: string | null;
  source: CvSubmissionSource;
  hasCv: boolean;
  createdAt: Date;
};

/**
 * Rows for the staff Excel download (candidates.view), newest first, with the list's filters (including one
 * requirement poster). The caller masks phone, email and passport numbers per permission and logs the export.
 * Returns the total so the sheet can say it was capped.
 */
export async function listCvSubmissionsForExport(ctx: StaffContext, filters: CvSubmissionFilters, limit: number): Promise<{ rows: CvSubmissionExportRow[]; total: number }> {
  assertStaff(ctx, "candidates.view");
  const condition = whereOf(ctx, filters);
  const [rows, totals] = await Promise.all([
    db
      .select({ s: cvSubmissions, countryName: countries.name })
      .from(cvSubmissions)
      .leftJoin(countries, eq(countries.code, cvSubmissions.preferredCountryCode))
      .where(condition)
      .orderBy(desc(cvSubmissions.createdAt), desc(cvSubmissions.id))
      .limit(limit),
    db.select({ value: count() }).from(cvSubmissions).where(condition),
  ]);
  return {
    total: totals[0]?.value ?? 0,
    rows: rows.map(({ s, countryName }) => ({
      code: s.code,
      name: s.name,
      phone: s.phone,
      email: s.email,
      tradeLabel: s.tradeLabel,
      experienceYears: s.experienceYears,
      experienceAbroadYears: s.experienceAbroadYears,
      experienceIndiaYears: s.experienceIndiaYears,
      countryName: countryName ?? null,
      requirementTitle: s.requirementTitle,
      status: s.status,
      passportEncrypted: s.passportNumberEncrypted,
      passportLast4: s.passportNumberLast4,
      hasPassport: s.hasPassport,
      passportExpiry: s.passportExpiry,
      candidateNotes: s.candidateNotes,
      staffRemarks: s.staffRemarks,
      source: s.source,
      hasCv: s.cvFileId !== null,
      createdAt: s.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Public status check (/status)
// ---------------------------------------------------------------------------

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** "Ravi Kumar" → "R. K." (at most three initials). */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => `${w[0]!.toUpperCase()}.`)
    .join(" ");
}

export const CV_STATUS_LOOKUP_ERROR = "We could not find a CV with this mobile number and reference. Check both and try again, or call or WhatsApp us.";

/**
 * Public status check: the candidate gives their mobile number (E.164) and reference. Rate limited per network and
 * per reference; the phone is compared in constant time (also when the reference does not exist) and every mismatch
 * gets the same generic error. Returns only initials, trade, stage, stage dates, the note written for the candidate and
 * whether we hold a CV file: never the phone, passport, staff remarks or files.
 */
export async function lookupCvStatus(input: { phone: string; reference: string }, meta: { ipHash: string | null }): Promise<CvStatusView> {
  const reference = input.reference.trim().toUpperCase();
  await enforceRateLimits(
    [
      ...(meta.ipHash
        ? [
            { key: `cv-status:ip:${meta.ipHash}`, limit: 10, windowSeconds: 10 * 60 },
            { key: `cv-status:ip-day:${meta.ipHash}`, limit: 50, windowSeconds: 24 * 60 * 60 },
          ]
        : []),
      { key: `cv-status:ref:${reference}`, limit: 5, windowSeconds: 60 * 60 },
    ],
    "Too many checks in a short time. Please wait a little and try again, or call or WhatsApp us.",
  );
  const [row] = await db
    .select({
      id: cvSubmissions.id,
      phone: cvSubmissions.phone,
      name: cvSubmissions.name,
      trade: cvSubmissions.tradeLabel,
      status: cvSubmissions.status,
      note: cvSubmissions.candidateNote,
      cvFileId: cvSubmissions.cvFileId,
      updatedAt: cvSubmissions.updatedAt,
    })
    .from(cvSubmissions)
    .where(eq(cvSubmissions.code, reference))
    .limit(1);
  // Compare even when the reference is unknown, so both failures take the same time.
  const matches = timingSafeEqual(digest(row?.phone ?? "\u0000no-such-reference"), digest(input.phone));
  if (!row || !matches) {
    await logSecurityEvent({ type: "cv_status_lookup_failed", severity: "info", metadata: { ipHash: meta.ipHash } });
    throw new ActionError(CV_STATUS_LOOKUP_ERROR, { code: "not_found" });
  }
  const events = await db
    .select({ status: cvSubmissionStageEvents.toStatus, at: cvSubmissionStageEvents.createdAt })
    .from(cvSubmissionStageEvents)
    .where(eq(cvSubmissionStageEvents.submissionId, row.id))
    .orderBy(asc(cvSubmissionStageEvents.createdAt));
  const journey: readonly CvSubmissionStatus[] = CV_SUBMISSION_JOURNEY;
  // The journey stage the candidate is at: the current status, or (on hold / not suitable) the last one reached.
  const lastJourney = [...events].reverse().find((e) => journey.includes(e.status))?.status ?? "received";
  const journeyStage = journey.includes(row.status) ? row.status : lastJourney;
  const reachedIndex = journey.indexOf(journeyStage);
  const stageDates: CvStatusView["stageDates"] = {};
  for (const e of events) {
    const i = journey.indexOf(e.status);
    if (i >= 0 && i <= reachedIndex) stageDates[e.status] = e.at.toISOString();
  }
  return {
    initials: initialsOf(row.name),
    trade: row.trade,
    status: row.status,
    journeyStage,
    stageDates,
    note: row.note,
    hasCv: row.cvFileId !== null,
    reference,
    updatedAt: row.updatedAt.toISOString(),
  };
}
