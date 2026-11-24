import { CircleAlert, CircleCheck, DatabaseBackup, Download, History, Mail } from "lucide-react";
import type { Metadata } from "next";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { formatFileSize } from "@/lib/format";
import { BACKUP_DOWNLOAD_PATH, BACKUP_MAX_ROWS_PER_SHEET, BACKUP_PERMISSION } from "@/modules/backup/schemas";
import { getBackupOverview, type BackupActivity } from "@/modules/backup/service";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { emailBackupNowAction, saveBackupSettingsAction } from "./actions";
import { BackupEmailSettingsForm, EmailBackupNowForm } from "./_components/backup-email-form";
import { DownloadBackupButton } from "./_components/download-backup-button";

export const metadata: Metadata = { title: "Backup" };

const rows = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "row" : "rows"}`;
/** Ends a provider message with a full stop (they come with or without one). */
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

function activityText(a: BackupActivity): string {
  const size = a.sizeBytes !== null ? formatFileSize(a.sizeBytes) : null;
  switch (a.kind) {
    case "emailed":
      return [
        a.trigger === "manual" ? `Emailed on request${a.byName ? ` by ${a.byName}` : ""}` : "Daily email sent",
        a.to ? `to ${a.to}` : null,
        size ? `(${size}${a.attached === false ? ", too large to attach" : ""})` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "email_failed":
      return `${a.trigger === "manual" ? "Email on request" : "Daily email"} failed${a.error ? `: ${a.error}` : ""}`;
    default:
      return `Downloaded${a.byName ? ` by ${a.byName}` : ""}${a.fullPassportNumbers ? " (with full passport numbers)" : ""}${size ? `, ${size}` : ""}`;
  }
}

/**
 * /admin/system/backup — the Super Admin's backup page (settings.security): download the whole business as one Excel
 * file, switch the daily backup email on or off and choose where it goes, and see the latest backups.
 */
export default async function BackupPage() {
  const ctx = await requireStaff(BACKUP_PERMISSION);
  const overview = await getBackupOverview(ctx);
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const fullPassport = staffCan(ctx, "candidates.view_documents");
  const fullContact = staffCan(ctx, "candidates.view_contact");
  const { settings, lastSent, lastFailure } = overview;
  const recipient = settings.recipient;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Backup"
        description="All your business data in one Excel file: CVs and applicants, requirement posters, job applications, manpower requests, bookings, referrals, reviews, leads, enquiries, companies and agencies, and resume requests."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Backup" }]}
        meta={<span className="text-sm text-muted-foreground">Only the Super Admin can see this page.</span>}
      />

      {overview.emailTransport === "dev" ? (
        <Callout tone="warning" title="Backup emails are not sent yet">
          The email service is still in test mode, so backup emails are kept in the development outbox instead of your inbox. Ask your engineer to add
          the Gmail app password (OPERATIONS.md, section 5.1). Download works now.
        </Callout>
      ) : !overview.smtpConfigured ? (
        <Callout tone="danger" title="Backup emails cannot be sent">
          The mail server is not set up. Ask your engineer to finish the email settings (OPERATIONS.md, section 5.1). Download works now.
        </Callout>
      ) : null}

      {lastFailure ? (
        <Callout tone="danger" title="The last backup email did not go out">
          <span className="break-words">{sentence(lastFailure.error ?? "The mail server refused it")}</span> Tried{" "}
          <DateText value={lastFailure.at} mode="datetime" timeZone={timeZone} />. Check the email settings, then tap Email a backup now.
        </Callout>
      ) : null}

      <SectionCard title="Download now" icon={<Download aria-hidden="true" />} description="Save a copy on this phone or computer. It takes a few seconds.">
        <DownloadBackupButton href={BACKUP_DOWNLOAD_PATH} />
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>{fullPassport ? "Passport numbers: full numbers (you are allowed to see them)." : "Passport numbers: last 4 digits only."}</li>
          <li>{fullContact ? "Phone numbers and emails: in full." : "Phone numbers and emails: hidden, because you are not allowed to see contact details."}</li>
          <li>Every download is recorded. Keep the file private and never share it on WhatsApp.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Daily backup email" icon={<Mail aria-hidden="true" />} description="A copy of the same file in your inbox every morning, so your data is safe even if the website has a problem.">
        <div className="space-y-5">
          <div className="space-y-2 rounded-xl bg-surface-subtle p-4 text-sm" data-testid="backup-email-status">
            <p className="flex flex-wrap items-center gap-2">
              {settings.dailyEmail && recipient ? (
                <StatusBadge tone="success" size="sm">On</StatusBadge>
              ) : (
                <StatusBadge tone={settings.dailyEmail ? "warning" : "neutral"} size="sm">{settings.dailyEmail ? "No address" : "Off"}</StatusBadge>
              )}
              <span className="min-w-0 break-words">
                {!settings.dailyEmail
                  ? "No backup emails are sent."
                  : recipient
                    ? `Every morning to ${recipient.email}${recipient.source === "business_inbox" ? " (the business inbox)" : ""}.`
                    : "There is no email address to send it to. Type one below."}
              </span>
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              {lastSent ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              <span>
                {lastSent ? (
                  <>
                    Last sent <DateText value={lastSent.at} mode="datetime" timeZone={timeZone} />
                    {lastSent.to ? ` to ${lastSent.to}` : ""}
                    {lastSent.sizeBytes !== null ? ` (${formatFileSize(lastSent.sizeBytes)})` : ""}.
                  </>
                ) : (
                  "No backup email has been sent yet."
                )}
              </span>
            </p>
          </div>

          <BackupEmailSettingsForm action={saveBackupSettingsAction} dailyEmail={settings.dailyEmail} emailTo={settings.emailTo} businessInbox={settings.businessInbox} />

          <div className="space-y-2 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">Want to check that it arrives? Send today&rsquo;s backup now to the same address.</p>
            <EmailBackupNowForm action={emailBackupNowAction} disabledReason={recipient ? null : "Add an email address above first."} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="What is in the file"
        icon={<DatabaseBackup aria-hidden="true" />}
        description={`One sheet for each area, newest first. A sheet holds up to ${BACKUP_MAX_ROWS_PER_SHEET.toLocaleString("en-IN")} rows; its top line says when there are more.`}
        flush
      >
        <ul className="divide-y divide-border" data-testid="backup-sheets">
          {overview.sheets.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{s.sheetName}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.title}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                {rows(s.rows)}
                {s.rows > BACKUP_MAX_ROWS_PER_SHEET ? <span className="block text-xs">newest {BACKUP_MAX_ROWS_PER_SHEET.toLocaleString("en-IN")} in the file</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Recent backups" icon={<History aria-hidden="true" />} flush={overview.activity.length > 0}>
        {overview.activity.length ? (
          <ul className="divide-y divide-border" data-testid="backup-activity">
            {overview.activity.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className={a.kind === "email_failed" ? "min-w-0 break-words text-danger-strong" : "min-w-0 break-words text-foreground"}>{activityText(a)}</span>
                <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">
                  <DateText value={a.at} mode="datetime" timeZone={timeZone} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState size="sm" variant="plain" title="No backups yet" description="Downloads and backup emails will be listed here." />
        )}
      </SectionCard>
    </div>
  );
}
