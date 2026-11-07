# Notifications module (`src/modules/notifications`)

Everything that tells people something: the event catalogue, default templates, the dispatch engine
(in-app, email, SMS, WhatsApp), the delivery log, preferences, one-click unsubscribe, the template admin and
the notification centre UI. Business modules only ever call `notify()` / `notifyStaff()` /
`notifyOrganization()`; this module decides channels, renders, records and sends.

```
notify({ event, recipients, data, link }, { tx })  ──► background task "notifications.dispatch"
notifyStaff({ event, permission, … })              ──► "notifications.dispatch_staff"  (active staff whose roles grant it; super admins included)
notifyOrganization({ event, organizationId, permission? }) ──► "notifications.dispatch_org" (active members whose role grants it, or all)
        │
        ▼ dispatch.ts — per recipient × channel
  resolve recipient (user → locale, time zone, email/phone + verification, status, category preferences,
  WhatsApp consent; raw { email } / { phone } recipients) → decide channel (channels.ts) → render
  (templates.ts code default ◄ active DB override for event+channel+locale ◄ English override) →
  phase 1 (one transaction): notifications row (in-app) + one notification_deliveries row per channel
  (skipped rows carry the reason) → phase 2: send via sendEmail / sendSms / sendWhatsApp →
  failures: status failed + "notifications.retry_delivery" with backoff (1 m, 5 m, 25 m, ~2 h; max 5 attempts)
```

## Public API

### Sending (`import { notify, notifyStaff, notifyOrganization } from "@/modules/notifications"`)

Unchanged contract (see `index.ts`):

```ts
notify(input: NotifyInput, opts?: { tx?: DbOrTx; runAt?: Date }): Promise<void>
notifyStaff(input: Omit<NotifyInput, "recipients"> & { permission: PlatformPermission }, opts?: { tx?: DbOrTx }): Promise<void>
notifyOrganization(input: Omit<NotifyInput, "recipients"> & { organizationId: string; permission?: string }, opts?: { tx?: DbOrTx }): Promise<void>
type NotifyInput = { event: NotificationEvent; recipients: NotificationRecipient[]; data?: Record<string, unknown>;
                     link?: string | null; channels?: NotificationChannel[]; organizationId?: string | null; dedupeKey?: string };
type NotificationRecipient = { userId } | { email, name?, locale? } | { phone, locale? };
```

- **Always pass `{ tx }`** when you notify about a change made in a transaction (the task only exists if it commits).
- `link` must be a relative app path (`/talent/applications/…`); anything else is dropped.
- `data` holds only template values (names, codes, titles, ISO dates, preformatted amounts) — never secrets,
  OTPs, document contents or internal notes. ISO timestamps are formatted in the recipient's time zone;
  `YYYY-MM-DD` dates as calendar dates; snake_case values also get a humanised `<key>Label`.
- `dedupeKey` makes a logical notification happen once (e.g. `interview-reminder:<id>:24h`): the task is
  enqueued once, and in-app rows / deliveries are unique per key.
- `channels` overrides the event's default channels strictly (preferences and flags still apply).
- One call handles up to 20,000 recipients (processed in chunks of 200); split larger audiences into several calls.
- `forStaff: true` in `data` switches the audience-aware templates (`requirement.received`,
  `requirement.status_changed`, `enquiry.received`, `support.ticket_created`, `support.ticket_reply`) to staff wording.

### Channel rules (`channels.ts`, unit-tested)

| Channel | Sent when | Skip reasons |
|---|---|---|
| in_app | whenever the event's channels (or the caller's `channels`) include it: always for user recipients, unless the category is opted out and the event is not mandatory | `opted_out`, `recipient_inactive` |
| email | flag `notifications.email`; an address; user recipients need a **verified** email except mandatory account / verification events (`allowsUnverifiedContact`); opt-outs apply unless mandatory | `channel_disabled`, `no_address`, `opted_out`, `recipient_inactive` |
| sms | flag `notifications.sms`; a verified phone (or a raw phone recipient); opt-outs always apply | `channel_disabled`, `no_address`, `opted_out`, `recipient_inactive` |
| whatsapp | flag `notifications.whatsapp`; verified phone; latest `whatsapp_updates` consent granted; an active WhatsApp template with a pre-approved name; never to raw phone numbers | `channel_disabled`, `no_address`, `no_consent`, `no_template`, `opted_out`, `recipient_inactive` |

Suspended / closed accounts only receive mandatory **account** messages, by email / SMS. Preferences: no row =
the event's defaults; an explicit `false` row opts out; an explicit `true` row opts a category into an extra
channel (rows equal to the default are deleted, so opt-in rows only exist where they extend the defaults).

### Templates (`templates.ts`, `render.ts`, `email-layout.ts` — client-safe)

- `DEFAULT_TEMPLATES` — a default (subject, Markdown-lite body, button label, optional SMS text, sample data)
  for **every** event in `events.ts`; `templates.test.ts` fails when an event is missing one, and
  `getDefaultTemplate(event)` falls back to a generic template so dispatch never breaks.
- Syntax: `{{key}}`, `{{#key}}…{{/key}}` (only when present), `{{^key}}…{{/key}}` (only when absent);
  Markdown-lite (paragraphs, line breaks, `**bold**`, `- ` lists, `[label](url)` with http(s) / mailto / app
  paths). Template text and values are HTML-escaped; values are inserted after Markdown, so they cannot inject
  markup or links. Values always available: `recipientName`, `appName`, `link`, `<key>Label`.
- WhatsApp templates: `body` lists the approved template's parameters, one `{{placeholder}}` per line, in order.
- SMS (India DLT): set `smsTemplateId` on the SMS override; the provider then receives the primitive template
  values as `variables`.
- Email layout: branded, table-based, inline CSS, `lang`, preheader, AA-contrast button + plain link fallback,
  footer with the reason, preference link (`/account/notifications/preferences`) and — for non-mandatory
  events sent to accounts — a signed one-click unsubscribe link.

```ts
renderTemplate({ subject, body }, values, { timeZone, locale, appUrl }): { subject, text, html }
renderSubject(template, values, ctx), renderPlainText(template, values, ctx), extractPlaceholders(template)
buildEmail(input: EmailLayoutInput): { subject, html, text }
```

### Unsubscribe (`unsubscribe.ts`, server-only)

`createUnsubscribeToken({ userId, category, channel? = "email" }, now?)` / `verifyUnsubscribeToken(token, now?)`
— `<base64url payload>.<HMAC>` via `hmacToken(…, "notification-unsubscribe")`, bound to user + category +
channel, valid for a year, no table. `unsubscribeWithToken(token)` stores an explicit opt-out with source
`unsubscribe_link` (idempotent, audited).

Non-mandatory emails to accounts carry `List-Unsubscribe: <APP_URL/api/v1/notifications/unsubscribe?token=…>` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (passed to `sendEmail({ headers })`; the transports sanitise
them). A GET of that URL (clients without one-click support) redirects to the confirmation page.

### Reads (`queries.ts`, server-only)

```ts
listNotifications(userId, filters: { filter?: "all" | "unread" | "archived"; category?; organizationId? }, page: PageQuery): Promise<Paginated<NotificationItem>>
unreadCount(userId, { organizationId? }?): Promise<number>
getNotificationSummary(userId, limit = 8): Promise<NotificationSummaryResponse>     // bell contract
toNotificationListItem(item): NotificationListItem                                    // serialisable DTO
getPreferenceMatrix(userId): Promise<PreferenceMatrix>                               // categories × visible channels, locked mandatory events
relevantCategories({ isStaff, hasMemberships }): NotificationCategory[]
// Command Centre
listNotificationTemplates(ctx: StaffContext, { category?, q? }?): Promise<TemplateCatalogItem[]>   // notifications.templates
getNotificationTemplate(ctx, id): Promise<NotificationTemplateRow | null>                         // notifications.templates
listNotificationDeliveries(ctx, filters: DeliveryFilters, page): Promise<Paginated<DeliveryLogItem>> // notifications.logs
getNotificationDeliveryStats(ctx, { days? }?): Promise<DeliveryStats>                               // notifications.logs
listDeliveriesForNotification(ctx, notificationId), countStuckDeliveries(ctx, minutes = 30)
```

User reads are scoped to the `userId` you pass — always the signed-in user's id. The delivery log shows masked
recipients only; the `recipient` filter matches an exact address by hash.

### Writes (`service.ts`, server-only)

```ts
markRead(userId, ids): Promise<number>          markAllRead(userId, { organizationId? }?): Promise<number>
archive(userId, ids): Promise<number>           unarchive(userId, ids): Promise<number>
setPreferences(userId, changes: PreferenceChange[], { source?, actorUserId? }?): Promise<{ updated }>   // audited
unsubscribeWithToken(token): Promise<UnsubscribeResult>
describeUnsubscribeToken(token)                 // read-only check for the unsubscribe page
upsertNotificationTemplate(ctx, input: TemplateFormInput): Promise<{ id, version, created }>          // version++ on edit, audited
setNotificationTemplateActive(ctx, id, isActive): Promise<void>                                       // audited
previewNotificationTemplate(ctx, input: TemplatePreviewInput): Promise<TemplatePreview>               // sample data, full email HTML
```

### Server Actions (`actions.ts`)

`markNotificationsReadAction({ ids })`, `markAllNotificationsReadAction({ organizationId? })`,
`archiveNotificationsAction({ ids })`, `unarchiveNotificationsAction({ ids })`,
`saveNotificationPreferencesAction` (form, `preferences:json`), `unsubscribeAction` (form, `token`),
`saveNotificationTemplateAction` (form), `setNotificationTemplateActiveAction({ id, isActive })`,
`previewNotificationTemplateAction({ eventKey, channel, locale?, subject?, body?, data? })`.

### Route handlers

| Route | Contract |
|---|---|
| `GET /api/v1/notifications/summary` | `{ unreadCount, items: [{ id, title, body, link, createdAt, readAt }] }` (latest 8, not archived) · 401 signed out · `Cache-Control: private, no-store` |
| `POST /api/v1/notifications/read` | JSON `{ ids: uuid[] }` (≤ 100) or `{ all: true, organizationId? }` → `{ updated, unreadCount }` · same-origin only (403) · 401 signed out |
| `POST /api/v1/notifications/unsubscribe?token=…` | RFC 8058 one-click endpoint (token-authenticated, rate limited per IP) → `{ ok, category }` · 400 invalid / expired |

### Components (`src/components/notifications`, client)

- `NotificationList({ items, filter, hrefs: { all, unread }, unreadCount, timeZone?, allowArchive?, labels? })` —
  All / Unread tabs (URL), unread markers (text + dot), mark one / all read, archive, links mark read when
  followed; optimistic with rollback + toast. `labels` translates every string (People Portal).
- `NotificationPreferencesForm({ matrix, labels? })` — one labelled group per category with a switch per
  channel, locked mandatory events listed, channel notes (verified phone, WhatsApp consent); posts to
  `saveNotificationPreferencesAction`.

### Pages

- `/account/notifications` — notification centre (inbox) for every signed-in user; the bell's "View all" target
  for business portals. Sub-tab **Preferences**: `/account/notifications/preferences`.
- `/notifications/unsubscribe?token=` — verifies the token (no side effects on GET), names the category, confirms
  with a button (`unsubscribeAction`); invalid / expired links explain what to do. `referrer: no-referrer`.

## Background tasks (`tasks.ts`)

`notifications.dispatch`, `notifications.dispatch_staff`, `notifications.dispatch_org`, `notifications.retry_delivery`.
All idempotent: rows are keyed by the dispatch key (`dedupeKey` or `task:<id>`); a re-run never duplicates
in-app rows or re-sends sent messages; deliveries still `queued` after a crash are sent (at-least-once).

**Secret links.** Events whose `link` carries a single-use secret (`hasSecretLink` in `channels.ts`: `org.invitation`)
have `link` removed from the stored task payload (`redactTaskPayload`) as the last step of each handler. A failed
send still works: its `retry_delivery` task carries its own copy, removed in turn when that retry has run. (A task
that dies on an infrastructure error keeps its payload until `system.cleanup`; the invitation token expires first.)

## Event keys added (events.ts)

`enquiry.received` (staff alert + sender acknowledgement via `forStaff`), `support.sla_breached` (staff),
`work.assigned` and `work.reminder` (staff work items: leads, enquiries, requirements, tickets, tasks).

## Template data used by the operations module

| Event | data |
|---|---|
| enquiry.received | `forStaff`, `code`, `type`, `senderName`, `organizationName`, `subject` |
| requirement.received / status_changed | `forStaff`, `code`, `title`, `organizationName`, `totalPositions`, `status` (label), `reason`, `source`, `sourceLabel` |
| support.ticket_created | `forStaff`, `code`, `subject`, `grievanceCode`, `firstResponseDue`, `requesterName`, `categoryLabel`, `priorityLabel` |
| support.ticket_reply / resolved | `forStaff`, `code`, `subject`, `excerpt`, `resolution`, `authorName`, `isGuest` |
| support.sla_breached | `code`, `subject`, `grievanceCode`, `breached`, `deadlineLabel`, `dueAt`, `escalationLevel` |
| work.assigned / work.reminder | `kindLabel`, `title`, `code`, `assignedBy`, `dueAt`, `priority`, `overdue` |
| message.received | `senderName`, `subject`, `excerpt` |

## Seed

`seed.ts` intentionally inserts nothing: the code defaults cover every event; admins create overrides.

## Tests

```powershell
npx vitest run src/modules/notifications                       # pure: channel matrix, rendering + escaping, email layout, tokens, template completeness
node scripts/test-db.mjs vsg_test_opsnotif
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_opsnotif'; npx vitest run src/modules/notifications
```

`dispatch.integration.test.ts`: in-app + email with unsubscribe link, idempotent re-runs, opt-outs vs mandatory,
unverified / inactive recipients, raw recipients, SMS / WhatsApp consent, failure → retry with backoff, DB
template override + version, staff / organisation fan-out, unsubscribe tokens, inbox scoping, preference matrix.

## Known limits / follow-ups

- Provider delivery receipts (`delivered`) need provider webhooks (not built); deliveries stop at `sent`.
- Retention of old archived notifications belongs to the privacy module's retention jobs.
