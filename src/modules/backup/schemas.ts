/**
 * Business data backup — constants, the settings form schema and small pure helpers (client-safe: the Command Centre
 * page, the service and the tests share them). No server imports here.
 */
import { z } from "zod";

import type { PlatformPermission } from "@/config/permissions";

/**
 * Who may open /admin/system/backup, download the full backup and change the daily email: "Configure security
 * policies", the highest system permission (only the Super Admin role holds it by default). A whole-business export
 * is a security decision, so it is not given to the Administrator role. Full passport numbers in the download also
 * need candidates.view_documents, full phone numbers and emails candidates.view_contact.
 */
export const BACKUP_PERMISSION = "settings.security" satisfies PlatformPermission;

export const BACKUP_ADMIN_PATH = "/admin/system/backup";
export const BACKUP_DOWNLOAD_PATH = "/admin/system/backup/download";

/** Recurring task (src/server/tasks/schedule.ts): once a day, shortly after 05:30 IST (00:00 UTC). */
export const BACKUP_DAILY_TASK = "backup.daily_email";

/** Largest sheet; the sheet's second row says when it was cut short. */
export const BACKUP_MAX_ROWS_PER_SHEET = 20_000;

/**
 * Largest workbook sent as an email attachment. Bigger backups are not attached: the email says so and links to the
 * download page instead (mail servers commonly refuse messages over 20–25 MB, and base64 adds a third).
 */
export const BACKUP_EMAIL_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Audit actions written by the backup module (the full download also uses the shared "export.downloaded"). */
export const BACKUP_AUDIT = {
  emailed: "backup.emailed",
  emailFailed: "backup.email_failed",
  settingsUpdated: "settings.updated",
} as const;

/** list key in export.downloaded / data-access log metadata for the full backup download. */
export const BACKUP_EXPORT_LIST = "full_backup";

export type BackupTrigger = "daily" | "manual";

/** One plain address (zod's email check: no lists, names, quotes or commas), at most 254 characters. */
export function isValidBackupEmail(value: string): boolean {
  return value.length <= 254 && z.email().safeParse(value).success;
}

/**
 * Where the daily backup goes: the address typed on the backup page, else the business inbox. Lower-cased and
 * trimmed; null when neither is a valid address (nothing is sent).
 */
export function resolveBackupRecipient(configured: unknown, businessInbox: unknown): { email: string; source: "backup" | "business_inbox" } | null {
  const own = String(configured ?? "").trim().toLowerCase();
  if (own) return isValidBackupEmail(own) ? { email: own, source: "backup" } : null;
  const inbox = String(businessInbox ?? "").trim().toLowerCase();
  return inbox && isValidBackupEmail(inbox) ? { email: inbox, source: "business_inbox" } : null;
}

/** Calendar date (YYYY-MM-DD) in a time zone (en-CA formats as YYYY-MM-DD). */
export function isoDateInZone(value: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

/**
 * Key of one scheduled daily run: the UTC day of the scheduler bucket (daily buckets start at 00:00 UTC). A retry of
 * the same run, or "Run now" later the same day, finds the key already used and sends nothing twice.
 */
export function dailyRunKey(scheduledFor: unknown, now: Date): string {
  const at = typeof scheduledFor === "string" && !Number.isNaN(Date.parse(scheduledFor)) ? new Date(scheduledFor) : now;
  return at.toISOString().slice(0, 10);
}

/** Settings form on the backup page. Blank address = the business inbox. */
export const backupSettingsSchema = z.object({
  dailyEmail: z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean()),
  emailTo: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Use at most 254 characters")
    .refine((v) => v === "" || isValidBackupEmail(v), "Enter a valid email address, or leave it blank")
    .optional()
    .transform((v) => v ?? ""),
});
export type BackupSettingsInput = z.output<typeof backupSettingsSchema>;
