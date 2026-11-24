import "server-only";

import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { SETTINGS } from "@/config/settings";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { absoluteUrl, env } from "@/lib/env";
import { maskEmail } from "@/lib/format";
import { logger } from "@/lib/logger";
import { EXPORT_TIME_ZONE, exportFilename, formatExportDate, XLSX_MIME, type XlsxColumn } from "@/lib/xlsx-export";
import { audit, logDataAccess } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { sendEmail } from "@/modules/messaging";
import { getSettings, setSetting } from "@/modules/settings";

import {
  applicationBackupColumns,
  bookingBackupColumns,
  cvBackupColumns,
  enquiryBackupColumns,
  leadBackupColumns,
  manpowerRequestBackupColumns,
  organisationBackupColumns,
  payoutBackupColumns,
  posterBackupColumns,
  referrerBackupColumns,
  resumeRequestBackupColumns,
  reviewBackupColumns,
  slotBackupColumns,
  type BackupVisibility,
} from "./columns";
import { buildBackupEmail } from "./email";
import * as q from "./queries";
import {
  BACKUP_ADMIN_PATH,
  BACKUP_AUDIT,
  BACKUP_EMAIL_MAX_ATTACHMENT_BYTES,
  BACKUP_EXPORT_LIST,
  BACKUP_MAX_ROWS_PER_SHEET,
  BACKUP_PERMISSION,
  dailyRunKey,
  resolveBackupRecipient,
  type BackupSettingsInput,
  type BackupTrigger,
} from "./schemas";
import { prepareSheet, writeBackupWorkbook, type SheetSource, type SheetSummary } from "./workbook";

/**
 * Business data backup: one Excel workbook with a sheet per area, downloaded by the Super Admin
 * (/admin/system/backup) and emailed every day to the business inbox (task "backup.daily_email").
 *
 * Why an attachment and not a link: a backup has to exist OUTSIDE the platform. A sign-in link would be useless on
 * the day the website or its database is down, which is exactly when a backup is needed. The emailed copy is the
 * safer one for the business, and it holds no more than the business inbox already receives with every new CV
 * (names, phone numbers, emails), except that passport numbers are cut to the last 4 digits. Full passport numbers
 * are only in the on-demand download, for staff allowed to see them, and that download is logged.
 */

export type BackupSheetKey =
  | "cv_submissions"
  | "posters"
  | "applications"
  | "manpower_requests"
  | "booking_slots"
  | "bookings"
  | "referrers"
  | "referral_payouts"
  | "worker_reviews"
  | "leads"
  | "enquiries"
  | "organisations"
  | "resume_requests";

type SheetDef<T> = {
  key: BackupSheetKey;
  sheetName: string;
  title: string;
  load: (opts: q.LoadOptions) => Promise<q.Loaded<T>>;
  columns: (v: BackupVisibility) => XlsxColumn<T>[];
};

const def = <T>(d: SheetDef<T>): SheetDef<unknown> => d as unknown as SheetDef<unknown>;

/** Sheets in the order they appear in the workbook. */
export const BACKUP_SHEETS: readonly SheetDef<unknown>[] = [
  def({ key: "cv_submissions", sheetName: "CV submissions", title: "CV submissions and applicants", load: q.loadCvSubmissions, columns: cvBackupColumns }),
  def({ key: "posters", sheetName: "Requirement posters", title: "Requirement posters", load: q.loadPosters, columns: posterBackupColumns }),
  def({ key: "applications", sheetName: "Job applications", title: "Job applications from website accounts", load: q.loadApplications, columns: applicationBackupColumns }),
  def({ key: "manpower_requests", sheetName: "Manpower requests", title: "Manpower requests from companies and agencies", load: q.loadManpowerRequests, columns: manpowerRequestBackupColumns }),
  def({ key: "booking_slots", sheetName: "Booking dates", title: "Trade test and training dates", load: q.loadSlots, columns: slotBackupColumns }),
  def({ key: "bookings", sheetName: "Bookings", title: "Trade test and training bookings", load: q.loadBookings, columns: bookingBackupColumns }),
  def({ key: "referrers", sheetName: "Referrers", title: "Referrers (Refer a friend)", load: q.loadReferrers, columns: referrerBackupColumns }),
  def({ key: "referral_payouts", sheetName: "Referral payouts", title: "Referral rewards paid", load: q.loadPayouts, columns: payoutBackupColumns }),
  def({ key: "worker_reviews", sheetName: "Worker reviews", title: "Reviews from placed workers", load: q.loadReviews, columns: reviewBackupColumns }),
  def({ key: "leads", sheetName: "Leads", title: "Leads", load: q.loadLeads, columns: leadBackupColumns }),
  def({ key: "enquiries", sheetName: "Enquiries", title: "Enquiries from the website", load: q.loadEnquiries, columns: enquiryBackupColumns }),
  def({ key: "organisations", sheetName: "Organisations", title: "Companies, travel agencies, partners and institutions", load: q.loadOrganisations, columns: organisationBackupColumns }),
  def({ key: "resume_requests", sheetName: "Resume requests", title: "Resume requests", load: q.loadResumeRequests, columns: resumeRequestBackupColumns }),
];

export type BackupOptions = {
  /** Full passport numbers (only for staff with candidates.view_documents). The daily email always passes false. */
  fullPassport: boolean;
  /** People's phone numbers and emails in full (default true; false masks them). */
  fullContact?: boolean;
  now?: Date;
  maxRowsPerSheet?: number;
};

export type BackupWorkbook = {
  bytes: Uint8Array;
  filename: string;
  generatedAt: Date;
  sheets: SheetSummary[];
  fullPassport: boolean;
  fullContact: boolean;
};

/** Build the backup workbook: one sheet per area, newest rows first, capped per sheet. */
export async function buildBackupWorkbook(opts: BackupOptions): Promise<BackupWorkbook> {
  const generatedAt = opts.now ?? new Date();
  const limit = opts.maxRowsPerSheet ?? BACKUP_MAX_ROWS_PER_SHEET;
  const visibility: BackupVisibility = { fullPassport: opts.fullPassport, fullContact: opts.fullContact ?? true };
  const sources: SheetSource[] = BACKUP_SHEETS.map((sheet) => async () => {
    // One more row than the cap is never needed: the total comes from a count.
    const { rows, total } = await sheet.load({ limit, fullPassport: visibility.fullPassport });
    return prepareSheet({ sheetName: sheet.sheetName, title: sheet.title, rows, total, columns: sheet.columns(visibility) }, { maxRows: limit, timeZone: EXPORT_TIME_ZONE });
  });
  const { bytes, sheets } = await writeBackupWorkbook({ sheets: sources, generatedAt, timeZone: EXPORT_TIME_ZONE });
  return { bytes, filename: exportFilename("full-backup", generatedAt), generatedAt, sheets, fullPassport: visibility.fullPassport, fullContact: visibility.fullContact };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type BackupSettings = {
  dailyEmail: boolean;
  /** Address typed on the backup page ("" = the business inbox). */
  emailTo: string;
  businessInbox: string;
  /** Where the email goes now (null = no valid address, nothing is sent). */
  recipient: { email: string; source: "backup" | "business_inbox" } | null;
};

export async function getBackupSettings(): Promise<BackupSettings> {
  const s = await getSettings(["backup.daily_email_enabled", "backup.daily_email_to", "notifications.business_inbox_email"]);
  const emailTo = String(s["backup.daily_email_to"] ?? "").trim().toLowerCase();
  const businessInbox = String(s["notifications.business_inbox_email"] ?? "").trim().toLowerCase();
  return { dailyEmail: s["backup.daily_email_enabled"] !== false, emailTo, businessInbox, recipient: resolveBackupRecipient(emailTo, businessInbox) };
}

function assertBackupStaff(ctx: StaffContext): void {
  if (!staffCan(ctx, BACKUP_PERMISSION)) throw new ActionError("Only the Super Admin can change backups.", { code: "forbidden" });
}

/** Save the daily email switch and address (Super Admin). Each real change is audited like other settings. */
export async function saveBackupSettings(ctx: StaffContext, input: BackupSettingsInput): Promise<{ changed: number }> {
  assertBackupStaff(ctx);
  const current = await getBackupSettings();
  let changed = 0;
  if (current.dailyEmail !== input.dailyEmail) {
    await setSetting("backup.daily_email_enabled", input.dailyEmail, ctx.user.id);
    await audit({
      action: BACKUP_AUDIT.settingsUpdated,
      entityType: "platform_setting",
      entityId: "backup.daily_email_enabled",
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { group: "Backup", label: SETTINGS["backup.daily_email_enabled"].label, from: current.dailyEmail ? "Yes" : "No", to: input.dailyEmail ? "Yes" : "No" },
    });
    changed += 1;
  }
  if (current.emailTo !== input.emailTo) {
    await setSetting("backup.daily_email_to", input.emailTo, ctx.user.id);
    await audit({
      action: BACKUP_AUDIT.settingsUpdated,
      entityType: "platform_setting",
      entityId: "backup.daily_email_to",
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { group: "Backup", label: SETTINGS["backup.daily_email_to"].label, from: current.emailTo || "(business inbox)", to: input.emailTo || "(business inbox)" },
    });
    changed += 1;
  }
  return { changed };
}

// ---------------------------------------------------------------------------
// Email (daily task and "Email a backup now")
// ---------------------------------------------------------------------------

export type BackupEmailOutcome =
  | { status: "disabled" | "no_recipient" | "already_sent"; runKey?: string }
  | { status: "sent"; to: string; attached: boolean; sizeBytes: number; provider: string; runKey?: string };

/** Short provider error for the audit log and the page (no secrets: transports never echo credentials). */
function shortError(error: string): string {
  return error.replace(/\s+/g, " ").slice(0, 200);
}

async function alreadySent(runKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, BACKUP_AUDIT.emailed),
        gte(auditLogs.occurredAt, sql`now() - interval '3 days'`),
        sql`${auditLogs.metadata}->>'runKey' = ${runKey}`,
        sql`${auditLogs.metadata}->>'trigger' = 'daily'`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function emailBackup(opts: { to: string; trigger: BackupTrigger; now: Date; actorUserId: string | null; runKey?: string; maxRowsPerSheet?: number }): Promise<BackupEmailOutcome & { status: "sent" }> {
  // Passport numbers are never decrypted for an email.
  const backup = await buildBackupWorkbook({ fullPassport: false, fullContact: true, now: opts.now, maxRowsPerSheet: opts.maxRowsPerSheet });
  const attached = backup.bytes.byteLength <= BACKUP_EMAIL_MAX_ATTACHMENT_BYTES;
  const appUrl = absoluteUrl("/").replace(/\/+$/, "");
  const email = buildBackupEmail({
    dayLabel: formatExportDate(opts.now),
    filename: backup.filename,
    sizeBytes: backup.bytes.byteLength,
    attached,
    sheets: backup.sheets,
    trigger: opts.trigger,
    pageUrl: absoluteUrl(BACKUP_ADMIN_PATH),
    appUrl,
  });
  const result = await sendEmail({
    to: opts.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: ["backup"],
    ...(attached ? { attachments: [{ filename: backup.filename, content: backup.bytes, contentType: XLSX_MIME }] } : {}),
  });
  const base = {
    trigger: opts.trigger,
    ...(opts.runKey ? { runKey: opts.runKey } : {}),
    to: maskEmail(opts.to),
    transport: env().EMAIL_TRANSPORT,
    sizeBytes: backup.bytes.byteLength,
    attached,
    sheets: Object.fromEntries(backup.sheets.map((s) => [s.sheetName, s.rows])),
    truncated: backup.sheets.filter((s) => s.truncated).map((s) => s.sheetName),
  };
  if (!result.ok) {
    await audit({ action: BACKUP_AUDIT.emailFailed, entityType: "backup", entityId: null, actorUserId: opts.actorUserId, actorType: opts.actorUserId ? "staff" : "system", metadata: { ...base, provider: result.provider, error: shortError(result.error) } });
    throw new ActionError(`The backup email could not be sent: ${shortError(result.error)}`);
  }
  await audit({ action: BACKUP_AUDIT.emailed, entityType: "backup", entityId: null, actorUserId: opts.actorUserId, actorType: opts.actorUserId ? "staff" : "system", metadata: { ...base, provider: result.provider } });
  return { status: "sent", to: opts.to, attached, sizeBytes: backup.bytes.byteLength, provider: result.provider, ...(opts.runKey ? { runKey: opts.runKey } : {}) };
}

/**
 * backup.daily_email (daily, src/server/tasks/schedule.ts): when switched on, email the backup (passport numbers
 * cut to the last 4 digits) to the backup address or the business inbox. Sends at most once per scheduled day
 * (a retry or a "Run now" later the same day sends nothing). A failed send is audited and thrown, so the task queue
 * retries it and the backup page shows the error.
 */
export async function runDailyBackupEmail(opts: { now?: Date; scheduledFor?: unknown; maxRowsPerSheet?: number } = {}): Promise<BackupEmailOutcome> {
  const now = opts.now ?? new Date();
  const settings = await getBackupSettings();
  if (!settings.dailyEmail) return { status: "disabled" };
  if (!settings.recipient) {
    logger.warn("Daily backup not sent: no valid backup address or business inbox");
    return { status: "no_recipient" };
  }
  const runKey = dailyRunKey(opts.scheduledFor, now);
  if (await alreadySent(runKey)) return { status: "already_sent", runKey };
  try {
    return await emailBackup({ to: settings.recipient.email, trigger: "daily", now, actorUserId: null, runKey, maxRowsPerSheet: opts.maxRowsPerSheet });
  } catch (error) {
    // Plain Error for the task queue (it records the message and retries).
    throw new Error(error instanceof Error ? error.message : "The backup email could not be sent");
  }
}

/** "Email a backup now" on the backup page (Super Admin): same email, to the same address, right away. */
export async function emailBackupNow(ctx: StaffContext, opts: { now?: Date; maxRowsPerSheet?: number } = {}): Promise<BackupEmailOutcome & { status: "sent" }> {
  assertBackupStaff(ctx);
  const settings = await getBackupSettings();
  if (!settings.recipient) throw new ActionError("There is no email address to send the backup to. Type one below, or set the business inbox in Settings.");
  return emailBackup({ to: settings.recipient.email, trigger: "manual", now: opts.now ?? new Date(), actorUserId: ctx.user.id, maxRowsPerSheet: opts.maxRowsPerSheet });
}

// ---------------------------------------------------------------------------
// Download (route handler) and the page overview
// ---------------------------------------------------------------------------

/** Who may see what in the full download: phone numbers / emails need candidates.view_contact, passports candidates.view_documents. */
export function downloadVisibility(ctx: StaffContext): BackupVisibility {
  return { fullPassport: staffCan(ctx, "candidates.view_documents"), fullContact: staffCan(ctx, "candidates.view_contact") };
}

/**
 * "Download full backup now" (Super Admin). Logged like every other staff export: the data-access log (who, which
 * sheets, how many rows, whether full phone and passport numbers were included) and the audit trail
 * ("export.downloaded", list "full_backup"). If the log cannot be written the file is not handed out.
 */
export async function downloadFullBackup(ctx: StaffContext, opts: { now?: Date; maxRowsPerSheet?: number } = {}): Promise<BackupWorkbook> {
  assertBackupStaff(ctx);
  const visibility = downloadVisibility(ctx);
  const backup = await buildBackupWorkbook({ ...visibility, now: opts.now, maxRowsPerSheet: opts.maxRowsPerSheet });
  const metadata = {
    list: BACKUP_EXPORT_LIST,
    title: "Full backup",
    sheets: Object.fromEntries(backup.sheets.map((s) => [s.sheetName, s.rows])),
    truncated: backup.sheets.filter((s) => s.truncated).map((s) => s.sheetName),
    sizeBytes: backup.bytes.byteLength,
    fullPhoneNumbers: visibility.fullContact,
    fullPassportNumbers: visibility.fullPassport,
    format: "xlsx",
  };
  await logDataAccess({
    actorUserId: ctx.user.id,
    subjectType: "export",
    subjectId: BACKUP_EXPORT_LIST,
    dataCategory: visibility.fullPassport ? "identity" : "contact",
    accessType: "export",
    reason: "Full backup download (every area of the business in one Excel file)",
    metadata,
  });
  await audit({ action: "export.downloaded", entityType: "export", entityId: null, actorUserId: ctx.user.id, actorType: "staff", metadata });
  return backup;
}

export type BackupActivity = {
  id: number;
  kind: "emailed" | "email_failed" | "downloaded";
  at: Date;
  trigger: BackupTrigger | null;
  /** Masked address for emails. */
  to: string | null;
  sizeBytes: number | null;
  attached: boolean | null;
  error: string | null;
  byName: string | null;
  fullPassportNumbers: boolean;
};

/** Latest backup emails, failures and downloads (newest first). */
export async function listBackupActivity(limit = 10): Promise<BackupActivity[]> {
  const rows = await db
    .select({ id: auditLogs.id, action: auditLogs.action, at: auditLogs.occurredAt, actorUserId: auditLogs.actorUserId, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      or(
        inArray(auditLogs.action, [BACKUP_AUDIT.emailed, BACKUP_AUDIT.emailFailed]),
        and(eq(auditLogs.action, "export.downloaded"), sql`${auditLogs.metadata}->>'list' = ${BACKUP_EXPORT_LIST}`),
      ),
    )
    .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
    .limit(limit);
  const names = await q.userNames(rows.map((r) => r.actorUserId).filter((v): v is string => Boolean(v)));
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const kind = r.action === BACKUP_AUDIT.emailed ? "emailed" : r.action === BACKUP_AUDIT.emailFailed ? "email_failed" : "downloaded";
    return {
      id: r.id,
      kind,
      at: r.at,
      trigger: m.trigger === "daily" || m.trigger === "manual" ? m.trigger : null,
      to: typeof m.to === "string" ? m.to : null,
      sizeBytes: typeof m.sizeBytes === "number" ? m.sizeBytes : null,
      attached: typeof m.attached === "boolean" ? m.attached : null,
      error: typeof m.error === "string" ? m.error : null,
      byName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
      fullPassportNumbers: m.fullPassportNumbers === true,
    };
  });
}

export type BackupOverview = {
  settings: BackupSettings;
  /** "dev" = emails are kept in the development outbox, not sent. */
  emailTransport: "dev" | "smtp";
  smtpConfigured: boolean;
  sheets: { key: BackupSheetKey; sheetName: string; title: string; rows: number }[];
  activity: BackupActivity[];
  lastSent: BackupActivity | null;
  /** The latest failure, when it is newer than the latest success. */
  lastFailure: BackupActivity | null;
};

export async function getBackupOverview(ctx: StaffContext): Promise<BackupOverview> {
  assertBackupStaff(ctx);
  const [settings, counts, activity] = await Promise.all([getBackupSettings(), q.countBackupRows(), listBackupActivity(10)]);
  const e = env();
  const lastSent = activity.find((a) => a.kind === "emailed") ?? null;
  const failure = activity.find((a) => a.kind === "email_failed") ?? null;
  return {
    settings,
    emailTransport: e.EMAIL_TRANSPORT,
    smtpConfigured: Boolean(e.SMTP_HOST),
    sheets: BACKUP_SHEETS.map((s) => ({ key: s.key, sheetName: s.sheetName, title: s.title, rows: counts[s.key] ?? 0 })),
    activity,
    lastSent,
    lastFailure: failure && (!lastSent || failure.at > lastSent.at) ? failure : null,
  };
}
