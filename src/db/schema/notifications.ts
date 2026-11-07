/**
 * Domain schema: notifications — template overrides, in-app notifications, the delivery log
 * (one row per recipient × channel, with skip reasons) and per-user channel preferences.
 *
 * Layer 14 — may import from: taxonomy, core, identity, organizations, system, employers, partners,
 * candidates, operations, jobs, training, recruitment, commercial.
 * Never import from a later layer (see docs/DATA_MODEL.md → Layering).
 *
 * The event catalogue (keys, categories, default channels, mandatory flags) lives in code:
 * src/modules/notifications/events.ts. Rows here only override or record it.
 * Unsubscribe links use signed tokens (no table).
 */
import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { NotificationCategory, NotificationChannel, NotificationEvent } from "@/modules/notifications/events";

import { createdAtOnly, emptyJsonObject, pk, timestamps, tstz } from "./_shared";
import { organizations, users } from "./core";
import { languages } from "./taxonomy";

/** Delivery channels — mirrors `NotificationChannel` in src/modules/notifications/events.ts. */
export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms", "whatsapp"] as const satisfies readonly NotificationChannel[];

/** Preference categories — mirrors `NotificationCategory` in src/modules/notifications/events.ts. */
export const NOTIFICATION_CATEGORIES = [
  "account",
  "applications",
  "interviews",
  "job_alerts",
  "recruitment",
  "organization",
  "billing",
  "support",
  "training",
  "announcements",
  "approvals",
  "messages",
] as const satisfies readonly NotificationCategory[];

export const NOTIFICATION_DELIVERY_STATUSES = ["queued", "sent", "delivered", "failed", "skipped"] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

/**
 * Why a channel was not attempted: user opted out of the category, required consent missing
 * (e.g. WhatsApp updates), channel switched off by a feature flag, no address on file, no active
 * template for the channel, recipient suspended / closed, or already sent (dedupe key).
 */
export const NOTIFICATION_SKIP_REASONS = [
  "opted_out",
  "no_consent",
  "channel_disabled",
  "no_address",
  "no_template",
  "recipient_inactive",
  "duplicate",
] as const;
export type NotificationSkipReason = (typeof NOTIFICATION_SKIP_REASONS)[number];

/** Where a preference change came from (an opt-out via an email unsubscribe link is evidence worth keeping). */
export const NOTIFICATION_PREFERENCE_SOURCES = ["settings", "unsubscribe_link", "admin"] as const;
export type NotificationPreferenceSource = (typeof NOTIFICATION_PREFERENCE_SOURCES)[number];

/**
 * Admin-edited overrides of the code default template for an event, per channel and locale
 * (notifications.templates). One template per (eventKey, channel, locale).
 *  - `body` is Markdown-lite with {{placeholders}}; values are escaped when rendered.
 *  - WhatsApp business-initiated messages need a pre-approved template (`whatsappTemplateName`).
 *  - Transactional SMS in India must use a DLT-registered template (`smsTemplateId`).
 */
export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: pk(),
    eventKey: text().$type<NotificationEvent>().notNull(),
    channel: text({ enum: NOTIFICATION_CHANNELS }).notNull(),
    locale: text()
      .notNull()
      .default("en")
      .references(() => languages.code),
    /** Email subject / in-app title (required for those channels). */
    subject: text(),
    body: text().notNull(),
    whatsappTemplateName: text(),
    /** WhatsApp template language code when it differs from `locale` (e.g. "en_US"). */
    whatsappLanguageCode: text(),
    /** DLT template id for SMS (India). */
    smsTemplateId: text(),
    isActive: boolean().notNull().default(true),
    /** Incremented on every edit; deliveries record the version they used. */
    version: integer().notNull().default(1),
    updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("notification_templates_event_channel_locale_uq").on(t.eventKey, t.channel, t.locale),
    index("notification_templates_locale_idx").on(t.locale),
    index("notification_templates_updated_by_idx").on(t.updatedByUserId),
    check("notification_templates_version_chk", sql`${t.version} >= 1`),
    check("notification_templates_subject_chk", sql`${t.channel} not in ('email', 'in_app') or ${t.subject} is not null`),
    check("notification_templates_whatsapp_chk", sql`${t.channel} <> 'whatsapp' or not ${t.isActive} or ${t.whatsappTemplateName} is not null`),
  ],
);

/**
 * In-app notification centre entries (one per recipient). `data` holds only the template values
 * (names, codes, titles, dates) — never secrets, OTPs, document contents or internal notes.
 * `link` must be a relative app path (no external or protocol-relative URLs).
 * Deleted with the user (personal data); old archived rows are purged by retention.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Workspace the notification belongs to (lets the notification centre filter per portal / organisation). */
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    /** Event key at the time of sending (historical rows may name events since retired). */
    eventKey: text().notNull(),
    category: text({ enum: NOTIFICATION_CATEGORIES }).notNull(),
    title: text().notNull(),
    body: text(),
    link: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    /** From notify({ dedupeKey }): stops duplicates when the dispatch task retries. */
    dedupeKey: text(),
    readAt: tstz(),
    archivedAt: tstz(),
    ...createdAtOnly,
  },
  (t) => [
    index("notifications_user_inbox_idx").on(t.userId, t.readAt, t.createdAt),
    index("notifications_org_idx").on(t.organizationId),
    index("notifications_created_idx").on(t.createdAt),
    uniqueIndex("notifications_user_dedupe_uq").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
    check("notifications_link_chk", sql`${t.link} is null or (left(${t.link}, 1) = '/' and substr(${t.link}, 2, 1) not in ('/', chr(92)))`),
  ],
);

/**
 * Delivery log: one row per recipient × channel of a dispatched event, updated as the attempt
 * progresses (queued → sent → delivered / failed, `attempts` counts retries) or written as
 * `skipped` with the reason. Visible to staff with notifications.logs.
 * Privacy: `recipient` is masked for display; `recipientHash` (HMAC of the normalised address)
 * supports bounce handling, data-subject requests and dedupe without storing the address in clear.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: pk(),
    /** The in-app notification of the same dispatch, when one was written. */
    notificationId: uuid().references(() => notifications.id, { onDelete: "set null" }),
    /** Recipient account (null for raw email / phone recipients). */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    eventKey: text().notNull(),
    channel: text({ enum: NOTIFICATION_CHANNELS }).notNull(),
    /** Masked address, e.g. "ra•••@example.com", "+91•••••3210"; null when there was none. */
    recipient: text(),
    recipientHash: text(),
    /** Locale the message was rendered in. */
    locale: text(),
    /** Database template used (null = code default template). */
    templateId: uuid(),
    templateVersion: integer(),
    status: text({ enum: NOTIFICATION_DELIVERY_STATUSES }).notNull().default("queued"),
    skipReason: text({ enum: NOTIFICATION_SKIP_REASONS }),
    /** smtp, msg91, twilio, meta_whatsapp, dev... */
    provider: text(),
    providerMessageId: text(),
    attempts: integer().notNull().default(0),
    /** Provider error text (never message contents). */
    lastError: text(),
    /** From notify({ dedupeKey }): one delivery per key, channel and address. */
    dedupeKey: text(),
    sentAt: tstz(),
    deliveredAt: tstz(),
    failedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    // Explicit name: the generated one exceeds PostgreSQL's 63-character identifier limit.
    foreignKey({ name: "notification_deliveries_template_fk", columns: [t.templateId], foreignColumns: [notificationTemplates.id] }).onDelete(
      "set null",
    ),
    index("notification_deliveries_notification_idx").on(t.notificationId),
    index("notification_deliveries_user_idx").on(t.userId, t.createdAt),
    index("notification_deliveries_template_idx").on(t.templateId),
    index("notification_deliveries_event_idx").on(t.eventKey, t.createdAt),
    index("notification_deliveries_status_idx").on(t.status, t.createdAt),
    index("notification_deliveries_provider_msg_idx").on(t.provider, t.providerMessageId),
    index("notification_deliveries_recipient_idx").on(t.recipientHash),
    index("notification_deliveries_created_idx").on(t.createdAt),
    uniqueIndex("notification_deliveries_dedupe_uq").on(t.dedupeKey, t.channel, t.recipientHash).where(sql`${t.dedupeKey} is not null`),
    check("notification_deliveries_skip_chk", sql`(${t.status} = 'skipped') = (${t.skipReason} is not null)`),
    check("notification_deliveries_attempts_chk", sql`${t.attempts} >= 0`),
  ],
);

/**
 * Per-user opt-in / opt-out by category and channel. No row = the event's default channels apply.
 * Mandatory events (security, legal, transactional receipts) ignore opt-outs for email / in-app;
 * marketing consent is recorded separately in consent_records.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text({ enum: NOTIFICATION_CATEGORIES }).notNull(),
    channel: text({ enum: NOTIFICATION_CHANNELS }).notNull(),
    enabled: boolean().notNull(),
    source: text({ enum: NOTIFICATION_PREFERENCE_SOURCES }).notNull().default("settings"),
    ...timestamps,
  },
  (t) => [primaryKey({ name: "notification_preferences_pk", columns: [t.userId, t.category, t.channel] })],
);
