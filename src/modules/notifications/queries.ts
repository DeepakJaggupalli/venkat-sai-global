import "server-only";

import { and, count, desc, eq, gte, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { notificationDeliveries, notificationPreferences, notifications, notificationTemplates, organizationMembers, organizations, users } from "@/db/schema";
import type { NotificationDeliveryStatus } from "@/db/schema/notifications";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { normalizeEmail, normalizePhone } from "@/lib/validation";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { hasConsent } from "@/modules/identity/consent";
import { isFeatureEnabled } from "@/modules/settings";

import { BUSINESS_ONLY_CATEGORIES, CATEGORY_LABELS, CHANNEL_LABELS, NOTIFICATION_CATEGORY_KEYS } from "./catalog";
import { CHANNEL_ORDER, categoryChannelDefault, listEventMeta, lockedEventsFor } from "./channels";
import { recipientHash } from "./dispatch";
import type { NotificationCategory, NotificationChannel } from "./events";
import { extractPlaceholders } from "./render";
import type { DeliveryFilters } from "./schemas";
import { getDefaultTemplate } from "./templates";
import type {
  DeliveryLogItem,
  DeliveryStats,
  NotificationItem,
  NotificationListFilters,
  NotificationListItem,
  NotificationSummaryResponse,
  PreferenceMatrix,
  TemplateCatalogItem,
} from "./types";

/**
 * Read side of the notifications module. User-facing reads are scoped to the given userId (callers pass
 * the signed-in user's id, never an id from the client); admin reads take a StaffContext and check
 * notifications.templates / notifications.logs.
 */

const itemColumns = {
  id: notifications.id,
  eventKey: notifications.eventKey,
  category: notifications.category,
  title: notifications.title,
  body: notifications.body,
  link: notifications.link,
  organizationId: notifications.organizationId,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
  archivedAt: notifications.archivedAt,
};

function inboxConditions(userId: string, filters: NotificationListFilters): SQL[] {
  const where: SQL[] = [eq(notifications.userId, userId)];
  const filter = filters.filter ?? "all";
  if (filter === "archived") where.push(isNotNull(notifications.archivedAt));
  else where.push(isNull(notifications.archivedAt));
  if (filter === "unread") where.push(isNull(notifications.readAt));
  if (filters.category) where.push(eq(notifications.category, filters.category));
  if (filters.organizationId) where.push(eq(notifications.organizationId, filters.organizationId));
  return where;
}

/** The user's notifications, newest first (archived ones only with filter "archived"). */
export async function listNotifications(userId: string, filters: NotificationListFilters, page: PageQuery): Promise<Paginated<NotificationItem>> {
  const where = and(...inboxConditions(userId, filters));
  const [items, totals] = await Promise.all([
    db.select(itemColumns).from(notifications).where(where).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(page.pageSize).offset(page.offset),
    db.select({ value: count() }).from(notifications).where(where),
  ]);
  return paginated(items, totals[0]?.value ?? 0, page);
}

/** Unread, non-archived notifications of the user. */
export async function unreadCount(userId: string, opts: { organizationId?: string } = {}): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(...inboxConditions(userId, { filter: "unread", organizationId: opts.organizationId })));
  return rows[0]?.value ?? 0;
}

/** Serialisable list items for client components. */
export function toNotificationListItem(item: NotificationItem): NotificationListItem {
  return {
    id: item.id,
    eventKey: item.eventKey,
    category: item.category,
    categoryLabel: CATEGORY_LABELS[item.category]?.label ?? item.category,
    title: item.title,
    body: item.body,
    link: item.link,
    createdAt: item.createdAt.toISOString(),
    readAt: item.readAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
  };
}

/** Bell summary: unread count + latest items (not archived). */
export async function getNotificationSummary(userId: string, limit = 8): Promise<NotificationSummaryResponse> {
  const [count, latest] = await Promise.all([
    unreadCount(userId),
    db
      .select(itemColumns)
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.archivedAt)))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(Math.min(Math.max(limit, 1), 50)),
  ]);
  return {
    unreadCount: count,
    items: latest.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })),
  };
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

async function userCapacities(userId: string): Promise<{ isStaff: boolean; hasMemberships: boolean; phone: string | null; phoneVerified: boolean } | null> {
  const [user] = await db
    .select({ isStaff: users.isStaff, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  const [membership] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), isNull(organizations.deletedAt)))
    .limit(1);
  return { isStaff: user.isStaff, hasMemberships: Boolean(membership), phone: user.phone, phoneVerified: Boolean(user.phoneVerifiedAt) };
}

/** Categories relevant to the user (pure candidates never see organisation, billing or recruitment). */
export function relevantCategories(capacity: { isStaff: boolean; hasMemberships: boolean }): NotificationCategory[] {
  const business = capacity.isStaff || capacity.hasMemberships;
  return NOTIFICATION_CATEGORY_KEYS.filter((c) => business || !BUSINESS_ONLY_CATEGORIES.includes(c));
}

/**
 * Category × channel matrix for the signed-in user. Channels whose feature flag is off are not shown.
 * Mandatory events are listed per cell as "always sent" (they ignore opt-outs for email and in-app).
 */
export async function getPreferenceMatrix(userId: string): Promise<PreferenceMatrix> {
  const capacity = await userCapacities(userId);
  if (!capacity) throw new ActionError("Account not found.");
  const [rows, sms, whatsapp] = await Promise.all([
    db
      .select({ category: notificationPreferences.category, channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)),
    isFeatureEnabled("notifications.sms"),
    isFeatureEnabled("notifications.whatsapp"),
  ]);
  const stored = new Map(rows.map((r) => [`${r.category}:${r.channel}`, r.enabled]));
  const visibleChannels = CHANNEL_ORDER.filter((c) => c === "in_app" || c === "email" || (c === "sms" && sms) || (c === "whatsapp" && whatsapp));
  const whatsappConsent = whatsapp ? await hasConsent(userId, "whatsapp_updates") : false;
  const phoneNote = !capacity.phone || !capacity.phoneVerified ? "Add and verify your mobile number in your account to receive these." : null;

  return {
    channels: visibleChannels.map((channel) => ({
      channel,
      label: CHANNEL_LABELS[channel],
      note:
        channel === "sms"
          ? phoneNote
          : channel === "whatsapp"
            ? (phoneNote ?? (whatsappConsent ? null : "Allow WhatsApp updates in your privacy settings to receive these."))
            : null,
    })),
    categories: relevantCategories(capacity).map((category) => ({
      category,
      label: CATEGORY_LABELS[category].label,
      description: CATEGORY_LABELS[category].description,
      cells: visibleChannels.map((channel) => {
        const defaultEnabled = categoryChannelDefault(category, channel);
        const explicit = stored.get(`${category}:${channel}`);
        return {
          channel,
          enabled: explicit ?? defaultEnabled,
          defaultEnabled,
          customised: explicit !== undefined && explicit !== defaultEnabled,
          lockedEvents: lockedEventsFor(category, channel).map((e) => e.label),
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Admin: templates
// ---------------------------------------------------------------------------

function assertStaff(ctx: StaffContext, permission: "notifications.templates" | "notifications.logs") {
  if (!staffCan(ctx, permission)) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
}

/** Every event with its code default and the admin overrides (notifications.templates). */
export async function listNotificationTemplates(ctx: StaffContext, filters: { category?: NotificationCategory; q?: string } = {}): Promise<TemplateCatalogItem[]> {
  assertStaff(ctx, "notifications.templates");
  const overrides = await db
    .select({
      id: notificationTemplates.id,
      eventKey: notificationTemplates.eventKey,
      channel: notificationTemplates.channel,
      locale: notificationTemplates.locale,
      isActive: notificationTemplates.isActive,
      version: notificationTemplates.version,
      updatedAt: notificationTemplates.updatedAt,
      updatedByName: users.displayName,
    })
    .from(notificationTemplates)
    .leftJoin(users, eq(users.id, notificationTemplates.updatedByUserId))
    .orderBy(notificationTemplates.eventKey, notificationTemplates.channel, notificationTemplates.locale);
  const byEvent = new Map<string, TemplateCatalogItem["overrides"]>();
  for (const o of overrides) {
    const list = byEvent.get(o.eventKey) ?? [];
    list.push({ id: o.id, channel: o.channel, locale: o.locale, isActive: o.isActive, version: o.version, updatedAt: o.updatedAt, updatedByName: o.updatedByName ?? null });
    byEvent.set(o.eventKey, list);
  }
  const q = filters.q?.trim().toLowerCase();
  return listEventMeta()
    .filter((e) => !filters.category || e.category === filters.category)
    .filter((e) => !q || e.key.includes(q) || e.label.toLowerCase().includes(q))
    .map((e) => {
      const d = getDefaultTemplate(e.key);
      return {
        eventKey: e.key,
        label: e.label,
        category: e.category,
        mandatory: e.mandatory,
        defaultChannels: [...e.defaultChannels],
        defaults: { subject: d.subject, body: d.body, sms: d.sms ?? null, cta: d.cta ?? null },
        placeholders: [...new Set([...extractPlaceholders(d.subject), ...extractPlaceholders(d.body), ...extractPlaceholders(d.sms)])].sort(),
        overrides: byEvent.get(e.key) ?? [],
      };
    });
}

export type NotificationTemplateRow = typeof notificationTemplates.$inferSelect;

export async function getNotificationTemplate(ctx: StaffContext, id: string): Promise<NotificationTemplateRow | null> {
  assertStaff(ctx, "notifications.templates");
  const [row] = await db.select().from(notificationTemplates).where(eq(notificationTemplates.id, id)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Admin: delivery log
// ---------------------------------------------------------------------------

function deliveryConditions(filters: DeliveryFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(notificationDeliveries.status, filters.status));
  if (filters.channel) where.push(eq(notificationDeliveries.channel, filters.channel));
  if (filters.eventKey) where.push(eq(notificationDeliveries.eventKey, filters.eventKey));
  if (filters.userId) where.push(eq(notificationDeliveries.userId, filters.userId));
  if (filters.recipient) {
    const v = filters.recipient.trim();
    const normalized = v.includes("@") ? normalizeEmail(v) : normalizePhone(v);
    // Addresses are stored masked + hashed: exact matches only.
    where.push(eq(notificationDeliveries.recipientHash, normalized ? recipientHash(normalized) : "-"));
  }
  if (filters.from) where.push(gte(notificationDeliveries.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to) where.push(lt(notificationDeliveries.createdAt, new Date(new Date(`${filters.to}T00:00:00.000Z`).getTime() + 86_400_000)));
  return where;
}

/** Delivery log for staff with notifications.logs (masked recipients; no message contents are stored). */
export async function listNotificationDeliveries(ctx: StaffContext, filters: DeliveryFilters, page: PageQuery): Promise<Paginated<DeliveryLogItem>> {
  assertStaff(ctx, "notifications.logs");
  const conditions = deliveryConditions(filters);
  const where = conditions.length ? and(...conditions) : undefined;
  const [items, totals] = await Promise.all([
    db
      .select({
        id: notificationDeliveries.id,
        eventKey: notificationDeliveries.eventKey,
        channel: notificationDeliveries.channel,
        status: notificationDeliveries.status,
        skipReason: notificationDeliveries.skipReason,
        recipient: notificationDeliveries.recipient,
        userId: notificationDeliveries.userId,
        userName: users.displayName,
        locale: notificationDeliveries.locale,
        provider: notificationDeliveries.provider,
        attempts: notificationDeliveries.attempts,
        lastError: notificationDeliveries.lastError,
        templateId: notificationDeliveries.templateId,
        templateVersion: notificationDeliveries.templateVersion,
        createdAt: notificationDeliveries.createdAt,
        sentAt: notificationDeliveries.sentAt,
        failedAt: notificationDeliveries.failedAt,
      })
      .from(notificationDeliveries)
      .leftJoin(users, eq(users.id, notificationDeliveries.userId))
      .where(where)
      .orderBy(desc(notificationDeliveries.createdAt), desc(notificationDeliveries.id))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(notificationDeliveries).where(where),
  ]);
  return paginated(
    items.map((i) => ({ ...i, userName: i.userName ?? null })),
    totals[0]?.value ?? 0,
    page,
  );
}

/** Delivery counts by status and channel since `days` ago (default 7). */
export async function getNotificationDeliveryStats(ctx: StaffContext, opts: { days?: number } = {}): Promise<DeliveryStats> {
  assertStaff(ctx, "notifications.logs");
  const days = Math.min(Math.max(opts.days ?? 7, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ status: notificationDeliveries.status, channel: notificationDeliveries.channel, value: count() })
    .from(notificationDeliveries)
    .where(gte(notificationDeliveries.createdAt, since))
    .groupBy(notificationDeliveries.status, notificationDeliveries.channel);
  const byStatus: Record<NotificationDeliveryStatus, number> = { queued: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 };
  const byChannel = Object.fromEntries(CHANNEL_ORDER.map((c) => [c, { sent: 0, failed: 0, skipped: 0 }])) as Record<NotificationChannel, { sent: number; failed: number; skipped: number }>;
  for (const r of rows) {
    byStatus[r.status] += r.value;
    const bucket = byChannel[r.channel];
    if (r.status === "sent" || r.status === "delivered") bucket.sent += r.value;
    else if (r.status === "failed") bucket.failed += r.value;
    else if (r.status === "skipped") bucket.skipped += r.value;
  }
  return { since, byStatus, byChannel };
}

/** Delivery rows of one in-app notification (support diagnostics). */
export async function listDeliveriesForNotification(ctx: StaffContext, notificationId: string): Promise<DeliveryLogItem[]> {
  assertStaff(ctx, "notifications.logs");
  const rows = await db
    .select({
      id: notificationDeliveries.id,
      eventKey: notificationDeliveries.eventKey,
      channel: notificationDeliveries.channel,
      status: notificationDeliveries.status,
      skipReason: notificationDeliveries.skipReason,
      recipient: notificationDeliveries.recipient,
      userId: notificationDeliveries.userId,
      locale: notificationDeliveries.locale,
      provider: notificationDeliveries.provider,
      attempts: notificationDeliveries.attempts,
      lastError: notificationDeliveries.lastError,
      templateId: notificationDeliveries.templateId,
      templateVersion: notificationDeliveries.templateVersion,
      createdAt: notificationDeliveries.createdAt,
      sentAt: notificationDeliveries.sentAt,
      failedAt: notificationDeliveries.failedAt,
    })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.notificationId, notificationId))
    .orderBy(notificationDeliveries.channel);
  return rows.map((r) => ({ ...r, userName: null }));
}

/** Raw SQL helper kept for admin dashboards: deliveries still queued for more than `minutes`. */
export async function countStuckDeliveries(ctx: StaffContext, minutes = 30): Promise<number> {
  assertStaff(ctx, "notifications.logs");
  const rows = await db
    .select({ value: count() })
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.status, "queued"), lt(notificationDeliveries.createdAt, sql`now() - make_interval(mins => ${minutes})`)));
  return rows[0]?.value ?? 0;
}
