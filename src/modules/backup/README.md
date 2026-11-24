# Backup module (`src/modules/backup`)

A copy of the business data in one Excel workbook: downloaded on demand by the Super Admin at
`/admin/system/backup`, and emailed every day (task `backup.daily_email`) to the business inbox or another address.

## Why the email carries the file (and not a link)

A backup has to exist **outside** the platform. A sign-in link would be useless on the day the website or its
database is down, which is exactly when a backup is needed. The emailed workbook holds no more than the business inbox
already receives with every new CV (names, phone numbers, emails), and passport numbers are cut to the last 4 digits
(`XXXX1234`; never decrypted for an email). Full passport numbers are only in the on-demand download, for staff with
`candidates.view_documents`, and every download is logged. Workbooks larger than 10 MB are not attached: the email
says so and links to the download page.

## Sheets (one per area, newest first, at most 20,000 rows each)

CV submissions (S.No, Name, Trade, Passport No, Exp Abroad, Exp India, Email, Phone, Applied for, Status, Source,
Applied on, Preferred country, Passport expiry, Candidate notes, Staff remarks, Code, then Total exp, CV file, Referral
code, Placed with) · Requirement posters (title, country, trades, status, published on, applicants, web link) · Job
applications · Manpower requests · Booking dates · Bookings · Referrers · Referral payouts (amount with its own
currency) · Worker reviews · Leads · Enquiries · Organisations · Resume requests. Every sheet has the company row, a
title row (generated time, row count or "Showing the first 20,000 of N rows") and the header row, like the other staff
downloads; text cells are neutralised against formula injection. Soft-deleted posters and organisations are left out.
Files (CVs, photos) are not in the workbook; see `docs/OPERATIONS.md` §8 for full database and file backups.

## Public API

| File | API |
|---|---|
| `schemas.ts` (client-safe) | `BACKUP_PERMISSION` (`settings.security`), `BACKUP_ADMIN_PATH`, `BACKUP_DOWNLOAD_PATH`, `BACKUP_DAILY_TASK`, `BACKUP_MAX_ROWS_PER_SHEET`, `BACKUP_EMAIL_MAX_ATTACHMENT_BYTES`, `resolveBackupRecipient(configured, businessInbox)`, `dailyRunKey(scheduledFor, now)`, `backupSettingsSchema` |
| `service.ts` | `buildBackupWorkbook({ fullPassport, fullContact?, now?, maxRowsPerSheet? })` → `{ bytes, filename, sheets, … }` · `downloadFullBackup(ctx)` (Super Admin; data-access log + `export.downloaded` with list `full_backup`) · `runDailyBackupEmail({ scheduledFor?, now? })` (the task; once per scheduled day, audited `backup.emailed` / `backup.email_failed`, throws on a failed send so the queue retries) · `emailBackupNow(ctx)` · `getBackupSettings()` · `saveBackupSettings(ctx, input)` (audited `settings.updated`) · `listBackupActivity()` · `getBackupOverview(ctx)` · `BACKUP_SHEETS` |
| `workbook.ts` | `writeBackupWorkbook({ sheets, generatedAt })` (ExcelJS streaming writer, sheets built one at a time), `prepareSheet(sheet, { maxRows })`, `backupCellValue`, `cleanSheetName` |
| `columns.ts` | Row types and columns per sheet; `passportCell(visibility, row)`, `organisationTypeLabel` |
| `email.ts` | `buildBackupEmail(input)` (branded layout, escaped values) |
| `tasks.ts` | `backup.daily_email` handler (registered in `src/server/tasks/registry.ts`, daily in `schedule.ts`) |

## Settings

`backup.daily_email_enabled` (default on) and `backup.daily_email_to` (blank = `notifications.business_inbox_email`),
group "Backup", edited only on the backup page; the generic settings form needs `settings.security` for this group too.

## Tests

`backup.test.ts` (workbook layout, caps, formula neutralising, masking, email, settings helpers, task registration) and
`backup.integration.test.ts` (every sheet against PostgreSQL, full vs masked passports, caps, daily email with the
attachment, once per day, failure and retry, download logging, permissions, settings).
