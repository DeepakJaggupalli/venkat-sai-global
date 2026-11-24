import { BRAND } from "@/config/site";
import { formatFileSize } from "@/lib/format";
import { buildEmail, type BuiltEmail } from "@/modules/notifications/email-layout";
import { renderTemplate } from "@/modules/notifications/render";

import type { BackupTrigger } from "./schemas";
import type { SheetSummary } from "./workbook";

/**
 * The backup email (pure: unit-tested in email.test.ts). Rendered with the notification templates' Markdown-lite and
 * the branded layout, so values are HTML-escaped and links are made absolute. Plain words; it says what is inside, that
 * passport numbers are cut to the last 4 digits, and asks the owner to keep it private.
 */

export type BackupEmailInput = {
  /** "23 Nov 2026" (Asia/Kolkata). */
  dayLabel: string;
  filename: string;
  sizeBytes: number;
  /** False when the file was too big to attach (the email then points at the download page). */
  attached: boolean;
  sheets: readonly SheetSummary[];
  trigger: BackupTrigger;
  /** Absolute URL of /admin/system/backup. */
  pageUrl: string;
  /** Absolute site URL (no trailing slash) for the layout. */
  appUrl: string;
};

const SUBJECT = "{{#manual}}Backup{{/manual}}{{^manual}}Daily backup{{/manual}} of your business data, {{day}}";

const BODY = [
  "{{#attached}}Your backup is attached: **{{filename}}** ({{size}}). Open it in Excel or Google Sheets.{{/attached}}{{^attached}}Your backup is too large to send by email ({{size}}). Open the backup page and tap **Download full backup**.{{/attached}}",
  "What is inside, one sheet each:\n{{sheets}}",
  "Passport numbers show only the last 4 digits. To see full passport numbers, download the backup from the Command Centre (sign-in needed).",
  "Keep this email private. It has the names and phone numbers of workers, companies and agencies. Do not forward it or share it on WhatsApp.",
  "Save the file in a safe place, for example a private folder on Google Drive. If something goes wrong with the website, this file still has your data.",
].join("\n\n");

/** "CV submissions: 1,234 rows" (and "(first 20,000 of 23,456)" when cut short). */
export function sheetLine(sheet: SheetSummary): string {
  const rows = `${sheet.rows.toLocaleString("en-IN")} ${sheet.rows === 1 ? "row" : "rows"}`;
  return sheet.truncated ? `${sheet.sheetName}: ${rows} (first ${sheet.rows.toLocaleString("en-IN")} of ${sheet.total.toLocaleString("en-IN")})` : `${sheet.sheetName}: ${rows}`;
}

export function buildBackupEmail(input: BackupEmailInput): BuiltEmail {
  const values = {
    manual: input.trigger === "manual",
    day: input.dayLabel,
    attached: input.attached,
    filename: input.filename,
    size: formatFileSize(input.sizeBytes),
    sheets: input.sheets.map(sheetLine).join("\n"),
  };
  const rendered = renderTemplate({ subject: SUBJECT, body: BODY }, values, { timeZone: "Asia/Kolkata", locale: "en", appUrl: input.appUrl });
  return buildEmail({
    locale: "en",
    subject: rendered.subject,
    preheader: input.attached ? `Backup file attached (${values.size}). Keep it private.` : "Download the backup from the Command Centre.",
    bodyHtml: rendered.html,
    bodyText: rendered.text,
    cta: { label: "Open the backup page", url: input.pageUrl },
    brand: { name: BRAND.name, legalEntity: BRAND.legalEntity, address: BRAND.headquarters, homeUrl: `${input.appUrl}/` },
    footer: {
      reason:
        input.trigger === "manual"
          ? "You get this email because someone asked for a backup on the Backup page of the Command Centre."
          : "You get this email because the daily backup is switched on in the Command Centre (Backup page). You can switch it off there.",
    },
  });
}
