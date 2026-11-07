import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { BRAND } from "@/config/site";
import { db } from "@/db";
import { languages, notificationPreferences, notifications, notificationTemplates, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { CATEGORY_LABELS } from "./catalog";
import { categoryChannelDefault, getEventMeta } from "./channels";
import { buildTemplateValues } from "./dispatch";
import { buildEmail } from "./email-layout";
import type { NotificationCategory, NotificationChannel, NotificationEvent } from "./events";
import { extractPlaceholders, renderPlainText, renderTemplate } from "./render";
import type { TemplateFormInput, TemplatePreviewInput } from "./schemas";
import { DEFAULT_CTA_LABEL, getDefaultTemplate } from "./templates";
import type { PreferenceChange, TemplatePreview, UnsubscribeResult } from "./types";
import { verifyUnsubscribeToken } from "./unsubscribe";

/**
 * Write side of the notifications module: inbox state (read / archive), preferences, one-click
 * unsubscribe and the template admin. Inbox writes are always scoped to the userId passed by the caller
 * (the signed-in user); template writes require notifications.templates.
 */

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** Mark the user's own notifications as read. Returns how many changed. */
export async function markRead(userId: string, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, [...ids]), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

/** Mark every unread notification of the user (optionally of one workspace) as read. */
export async function markAllRead(userId: string, opts: { organizationId?: string } = {}): Promise<number> {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (opts.organizationId) conditions.push(eq(notifications.organizationId, opts.organizationId));
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions))
    .returning({ id: notifications.id });
  return rows.length;
}

/** Archive the user's own notifications (also marks them read). */
export async function archive(userId: string, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const now = new Date();
  const rows = await db
    .update(notifications)
    .set({ archivedAt: now })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, [...ids]), isNull(notifications.archivedAt)))
    .returning({ id: notifications.id });
  if (rows.length) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, rows.map((r) => r.id)), isNull(notifications.readAt)));
  }
  return rows.length;
}

/** Restore archived notifications to the inbox. */
export async function unarchive(userId: string, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db
    .update(notifications)
    .set({ archivedAt: null })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, [...ids])))
    .returning({ id: notifications.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * Save category × channel preferences. A value equal to the default removes the stored row ("no row =
 * defaults"), so opt-in rows only exist where they extend the defaults. Mandatory events keep being sent
 * by email / in-app whatever is stored here (enforced at dispatch).
 */
export async function setPreferences(
  userId: string,
  changes: readonly PreferenceChange[],
  opts: { source?: "settings" | "admin"; actorUserId?: string } = {},
): Promise<{ updated: number }> {
  const unique = new Map<string, PreferenceChange>();
  for (const c of changes) unique.set(`${c.category}:${c.channel}`, c);
  if (!unique.size) return { updated: 0 };

  const updated = await db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new ActionError("Account not found.");
    const current = await tx
      .select({ category: notificationPreferences.category, channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    const stored = new Map(current.map((r) => [`${r.category}:${r.channel}`, r.enabled]));
    const applied: PreferenceChange[] = [];

    for (const change of unique.values()) {
      const key = `${change.category}:${change.channel}`;
      const isDefault = change.enabled === categoryChannelDefault(change.category, change.channel);
      const before = stored.get(key);
      if (isDefault) {
        if (before === undefined) continue;
        await tx
          .delete(notificationPreferences)
          .where(
            and(
              eq(notificationPreferences.userId, userId),
              eq(notificationPreferences.category, change.category),
              eq(notificationPreferences.channel, change.channel),
            ),
          );
      } else {
        if (before === change.enabled) continue;
        await tx
          .insert(notificationPreferences)
          .values({ userId, category: change.category, channel: change.channel, enabled: change.enabled, source: opts.source ?? "settings" })
          .onConflictDoUpdate({
            target: [notificationPreferences.userId, notificationPreferences.category, notificationPreferences.channel],
            set: { enabled: change.enabled, source: opts.source ?? "settings", updatedAt: new Date() },
          });
      }
      applied.push(change);
    }

    if (applied.length) {
      await audit({
        action: "notification.preferences_updated",
        entityType: "user",
        entityId: userId,
        metadata: { changes: applied, source: opts.source ?? "settings" },
        ...(opts.actorUserId !== undefined ? { actorUserId: opts.actorUserId } : {}),
        tx,
      });
    }
    return applied.length;
  });
  return { updated };
}

/**
 * Apply a one-click unsubscribe token (email footer link / RFC 8058 POST): stores an explicit opt-out for
 * the token's user, category and channel with source "unsubscribe_link". Idempotent.
 */
export async function unsubscribeWithToken(token: string): Promise<UnsubscribeResult> {
  const claims = verifyUnsubscribeToken(token);
  if (!claims.ok) {
    throw new ActionError(
      claims.reason === "expired"
        ? "This unsubscribe link has expired. Sign in to manage your notification preferences."
        : "This unsubscribe link is not valid. Sign in to manage your notification preferences.",
      { code: `unsubscribe_${claims.reason}` },
    );
  }
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, claims.userId)).limit(1);
    if (!user || user.status === "closed") {
      throw new ActionError("This unsubscribe link is no longer valid.", { code: "unsubscribe_invalid" });
    }
    const [existing] = await tx
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, claims.userId),
          eq(notificationPreferences.category, claims.category),
          eq(notificationPreferences.channel, claims.channel),
        ),
      )
      .limit(1);
    const alreadyUnsubscribed = existing?.enabled === false;
    if (!alreadyUnsubscribed) {
      await tx
        .insert(notificationPreferences)
        .values({ userId: claims.userId, category: claims.category, channel: claims.channel, enabled: false, source: "unsubscribe_link" })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.category, notificationPreferences.channel],
          set: { enabled: false, source: "unsubscribe_link", updatedAt: new Date() },
        });
      await audit({
        action: "notification.unsubscribed",
        entityType: "user",
        entityId: claims.userId,
        metadata: { category: claims.category, channel: claims.channel },
        actorUserId: claims.userId,
        actorType: "user",
        tx,
      });
    }
    return { category: claims.category, categoryLabel: CATEGORY_LABELS[claims.category].label, channel: claims.channel, alreadyUnsubscribed };
  });
}

/** Read-only check used by the unsubscribe page before the visitor confirms. */
export function describeUnsubscribeToken(token: string | null | undefined):
  | { ok: true; category: NotificationCategory; categoryLabel: string; channel: NotificationChannel }
  | { ok: false; reason: "malformed" | "invalid" | "expired" } {
  const claims = verifyUnsubscribeToken(token);
  if (!claims.ok) return claims;
  return { ok: true, category: claims.category, categoryLabel: CATEGORY_LABELS[claims.category].label, channel: claims.channel };
}

// ---------------------------------------------------------------------------
// Template admin (notifications.templates)
// ---------------------------------------------------------------------------

function assertTemplates(ctx: StaffContext) {
  if (!staffCan(ctx, "notifications.templates")) throw new ActionError("You do not have permission to edit notification templates.", { code: "forbidden" });
}

/**
 * Create or update the override for (event, channel, locale). Each update bumps `version` (deliveries record
 * the version they used). Audited.
 */
export async function upsertNotificationTemplate(ctx: StaffContext, input: TemplateFormInput): Promise<{ id: string; version: number; created: boolean }> {
  assertTemplates(ctx);
  const event = input.eventKey as NotificationEvent;
  getEventMeta(event);
  const [language] = await db.select({ code: languages.code }).from(languages).where(eq(languages.code, input.locale)).limit(1);
  if (!language) throw new ActionError("Choose a supported language.", { fieldErrors: { locale: ["Choose a supported language"] } });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: notificationTemplates.id, version: notificationTemplates.version })
      .from(notificationTemplates)
      .where(and(eq(notificationTemplates.eventKey, event), eq(notificationTemplates.channel, input.channel), eq(notificationTemplates.locale, input.locale)))
      .limit(1);
    const values = {
      subject: input.subject ?? null,
      body: input.body,
      whatsappTemplateName: input.whatsappTemplateName ?? null,
      whatsappLanguageCode: input.whatsappLanguageCode ?? null,
      smsTemplateId: input.smsTemplateId ?? null,
      isActive: input.isActive,
      updatedByUserId: ctx.user.id,
    };
    let result: { id: string; version: number; created: boolean };
    if (existing) {
      const [row] = await tx
        .update(notificationTemplates)
        .set({ ...values, version: existing.version + 1 })
        .where(eq(notificationTemplates.id, existing.id))
        .returning({ id: notificationTemplates.id, version: notificationTemplates.version });
      result = { id: row!.id, version: row!.version, created: false };
    } else {
      const [row] = await tx
        .insert(notificationTemplates)
        .values({ eventKey: event, channel: input.channel, locale: input.locale, ...values })
        .returning({ id: notificationTemplates.id, version: notificationTemplates.version });
      result = { id: row!.id, version: row!.version, created: true };
    }
    await audit({
      action: result.created ? "notification_template.created" : "notification_template.updated",
      entityType: "notification_template",
      entityId: result.id,
      metadata: { eventKey: event, channel: input.channel, locale: input.locale, version: result.version, isActive: input.isActive },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
    return result;
  });
}

/** Activate / deactivate an override (inactive = the English override or the code default applies). */
export async function setNotificationTemplateActive(ctx: StaffContext, id: string, isActive: boolean): Promise<void> {
  assertTemplates(ctx);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(notificationTemplates).where(eq(notificationTemplates.id, id)).limit(1);
    if (!row) throw new ActionError("Template not found.");
    if (isActive && row.channel === "whatsapp" && !row.whatsappTemplateName) {
      throw new ActionError("Add the approved WhatsApp template name before activating this template.");
    }
    if (row.isActive === isActive) return;
    await tx.update(notificationTemplates).set({ isActive, updatedByUserId: ctx.user.id }).where(eq(notificationTemplates.id, id));
    await audit({
      action: isActive ? "notification_template.activated" : "notification_template.deactivated",
      entityType: "notification_template",
      entityId: id,
      metadata: { eventKey: row.eventKey, channel: row.channel, locale: row.locale },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
  });
}

/**
 * Render a template with sample data (draft text, else the active override for the locale, else the code
 * default). Email previews return the complete branded email.
 */
export async function previewNotificationTemplate(ctx: StaffContext, input: TemplatePreviewInput): Promise<TemplatePreview> {
  assertTemplates(ctx);
  const event = getEventMeta(input.eventKey as NotificationEvent);
  const locale = input.locale || "en";
  const fallback = getDefaultTemplate(event.key);

  let subject = input.subject;
  let body = input.body;
  if (subject === undefined || body === undefined) {
    const [override] = await db
      .select({ subject: notificationTemplates.subject, body: notificationTemplates.body })
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.eventKey, event.key),
          eq(notificationTemplates.channel, input.channel),
          eq(notificationTemplates.locale, locale),
          eq(notificationTemplates.isActive, true),
        ),
      )
      .limit(1);
    subject ??= override?.subject ?? fallback.subject;
    body ??= override?.body ?? (input.channel === "sms" ? (fallback.sms ?? fallback.subject) : fallback.body);
  }

  const appUrl = env().APP_URL.replace(/\/+$/, "");
  const sample = { ...fallback.sample, ...(input.data ?? {}) };
  const values = buildTemplateValues(sample, { recipientName: String(sample.recipientName ?? "Recipient name"), link: `${appUrl}/` });
  const renderCtx = { timeZone: env().DEFAULT_TIMEZONE, locale, appUrl };
  const used = [...extractPlaceholders(subject), ...extractPlaceholders(body)];
  const unknownPlaceholders = [...new Set(used.filter((k) => values[k] === undefined))].sort();

  if (input.channel === "sms" || input.channel === "whatsapp") {
    const text = renderPlainText(body ?? "", values, renderCtx);
    return { subject: "", text, html: "", unknownPlaceholders };
  }
  const rendered = renderTemplate({ subject: subject ?? "", body: body ?? "" }, values, renderCtx);
  if (input.channel === "in_app") return { subject: rendered.subject, text: rendered.text, html: rendered.html, unknownPlaceholders };
  const email = buildEmail({
    locale,
    subject: rendered.subject || event.label,
    preheader: rendered.text.slice(0, 140),
    bodyHtml: rendered.html,
    bodyText: rendered.text,
    cta: { label: fallback.cta ?? DEFAULT_CTA_LABEL, url: `${appUrl}/` },
    brand: { name: BRAND.name, legalEntity: BRAND.legalEntity, address: BRAND.headquarters, homeUrl: `${appUrl}/` },
    footer: {
      reason: `You are receiving this email because you have a ${BRAND.name} account.`,
      preferencesUrl: `${appUrl}/account/notifications/preferences`,
      unsubscribeUrl: event.mandatory ? null : `${appUrl}/notifications/unsubscribe?token=preview`,
      unsubscribeLabel: `Unsubscribe from ${CATEGORY_LABELS[event.category].label.toLowerCase()} emails`,
      mandatoryNote: event.mandatory ? "This is a required service message about your account or a transaction, so it is sent even if you have turned off other emails." : null,
    },
  });
  return { subject: email.subject, text: email.text, html: email.html, unknownPlaceholders };
}
