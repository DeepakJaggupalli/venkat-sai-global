# Privacy module (`src/modules/privacy`)

Data principal requests under India's Digital Personal Data Protection Act, 2023 (access / export s.11,
correction and erasure s.12, consent withdrawal, objection, nomination): intake (signed-in or guest with
email verification), staff processing with identity verification, the JSON export, the account erasure
workflow with documented retention exceptions, and the SLA watch. Server-only except `constants.ts` and
`schemas.ts` (client-safe).

| File | Contents |
|---|---|
| `constants.ts` | Labels, state machine (`DATA_REQUEST_TRANSITIONS`), `computeDataRequestDueAt`, `dataRequestSlaState`, export window (`EXPORT_LINK_DAYS` = 7), `RETENTION_EXCEPTIONS`, `ERASABLE_FILE_PURPOSES`, `parseCloseAccountMarker` |
| `schemas.ts` | Zod schemas for every form / action |
| `service.ts` | Requester + staff writes (`createDataRequest`, `createGuestDataRequest`, `verifyGuestDataRequest`, `cancelMyDataRequest`, `assignDataRequest`, `requestIdentityVerification`, `verifyDataRequestIdentity`, `startDataRequest`, `queueDataExport`, `queueAccountErasure`, `completeDataRequest`, `rejectDataRequest`, `finishDataRequest`) |
| `queries.ts` | `listMyDataRequests(userId)`, `listDataRequests(ctx, filters, page)`, `dataRequestCounts(ctx)`, `getDataRequest(ctx, id)`, `openRequestsNearDeadline()`, `expiredExportFiles()` |
| `export.ts` | `buildPersonalDataBundle(ctx, userId, request)` |
| `erasure.ts` | `eraseAccount(ctx, { userId, requestId, requestCode })` |
| `staff-context.ts` | `loadStaffContextForUser(userId)` — staff context for background tasks |
| `actions.ts` | Server Actions (below) |
| `tasks.ts` | `privacy.export`, `privacy.erase`, `privacy.sla_watch` |

## Rules

- **Deadline** = creation + `privacy.data_request_sla_days` (setting; never hardcoded).
- **Identity.** Signed-in requests count as verified when the account has a verified email or phone; otherwise
  they start in `identity_verification` and staff confirm identity (the method is written to the audit trail).
  Guest requests are not linked to any account until the emailed 6-digit code is confirmed
  (`verifyGuestDataRequest`), so nobody can attach a request to someone else's account.
- **State machine:** received → (identity_verification) → in_progress → completed | rejected; requesters may
  cancel while received / identity_verification. Staff must start a request (identity verified) before
  completing it. A staff member cannot process their own request; staff accounts are not erased through a
  request (offboarding instead).
- **One open request per type** per account; 5 requests per account per day; guests 5 / hour per IP hash and
  3 / day per email, honeypot `website`.
- **Notifications:** `privacy.request_received` (requester; account or email), `privacy.request_completed`
  (completion and decline), staff `work.assigned` on new verified requests (`privacy.requests`), and
  `work.reminder` from the SLA watch. Links: requester `/account/privacy#requests`, staff `/admin/privacy/[id]`.
- **Audit:** `privacy.request_created`, `privacy.identity_verified`, `privacy.identity_requested`,
  `privacy.request_started`, `privacy.request_assigned`, `privacy.export_queued`, `privacy.erasure_queued`,
  `privacy.request_completed`, `privacy.request_rejected`, `privacy.request_cancelled`, `privacy.account_erased`.
  Metadata never contains request details.

## Export (`privacy.export { requestId, staffUserId }`)

Runs as the staff member who queued it (permissions re-checked). Bundle (`format: venkat-sai-global.personal-data`,
version 1): account, candidate profile and sections (candidates `buildCandidateDataExport`, audited there),
candidate-visible applications (no ratings, shortlist flags, knockout flags or rejection reasons),
organisation memberships, consent history, notification preferences, notifications, support requests with
**public** messages only, analytics summary (`summarizeAnalyticsForUser`) and the list of owned files.
Stored as a private `data_export` file owned by the person (files module: owner-only, never shareable);
download `GET /api/v1/files/<id>?download=1` for `EXPORT_LINK_DAYS`; `privacy.sla_watch` soft-deletes it afterwards.
Idempotent: a request that is no longer `in_progress` is skipped.

## Erasure (`privacy.erase { requestId, staffUserId }`)

The `users` row is kept (foreign keys) but closed and anonymised (`Deleted user`, no email / phone / password /
avatar, `statusReason` with the request code); sessions revoked; OAuth links, 2FA and verification tokens
deleted; candidate profile anonymised (`deletedAt`, hidden, identity numbers removed) and its sections deleted
(rows still referenced by retained records are kept — savepoint per table); saved jobs, job alerts,
notifications and notification preferences deleted; memberships disabled; thread participation ended;
contact copies on support tickets removed; files of `ERASABLE_FILE_PURPOSES` soft-deleted (purged by
`files.purge`); analytics erased (`eraseAnalyticsForUser`). Kept (`RETENTION_EXCEPTIONS`, written to
`retentionExceptions`): invoices and payments, placement / mobilisation / emigration records, issued
certificates and assessment results, the grievance register, consent records, audit / security / access logs.
The confirmation goes by email to the address captured on the request (the account has none left).

## Server Actions (`actions.ts`)

Requesters: `createMyDataRequestAction` (form: `type`, `details`, `confirmDeletion`), `cancelMyDataRequestAction({ id })`,
`createGuestDataRequestAction` (form: `name`, `email`, `phone?`, `type`, `details`, `website`),
`verifyGuestDataRequestAction` (form: `code`, `email`, `otp`).
Staff (`privacy.requests`): `assignDataRequestAction`, `requestIdentityVerificationAction`,
`verifyDataRequestIdentityAction`, `startDataRequestAction`, `queueDataExportAction`,
`queueAccountErasureAction` (form, `confirm` = `ERASE`), `completeDataRequestAction`, `rejectDataRequestAction`.

## Pages using this module

`/account/privacy` (every signed-in user), `/admin/privacy`, `/admin/privacy/[id]`. The People Portal's
`/talent/privacy` currently inserts requests through its own route-local helper (same table, code prefix
`DSR`, same close-account marker); it can switch to `createDataRequest`.

## Open items

- No public guest form page yet: `createGuestDataRequestAction` + `verifyGuestDataRequestAction` are ready for
  `/legal/data-rights` (public content owner).
- Guest identity codes reuse the `email_verification` OTP purpose (the code email says "verify your email").
- Erasure does not transfer organisation ownership; a sole owner's organisation keeps no active owner.
- `EXPORT_LINK_DAYS` is a constant; a `privacy.export_link_days` setting would make it configurable.

## Tests

```powershell
npx vitest run src/modules/privacy                     # pure rules (constants.test.ts)
node scripts/test-db.mjs vsg_test_privacy
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_privacy'; npx vitest run src/modules/privacy
```
