import "server-only";

import { and, arrayContains, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { PLATFORM_PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from "@/config/permissions";
import { BRAND } from "@/config/site";
import { db } from "@/db";
import {
  consentRecords,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  notificationTemplates,
  organizationMembers,
  organizations,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { NOTIFICATION_CHANNELS, type NotificationSkipReason } from "@/db/schema/notifications";
import { hmacToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { humanize, maskEmail, maskPhone } from "@/lib/format";
import { logger } from "@/lib/logger";
import { normalizePhone } from "@/lib/validation";
import { sendEmail, sendSms, sendWhatsApp, type SendResult } from "@/modules/messaging";
import { isFeatureEnabled } from "@/modules/settings";
import { enqueueTask } from "@/server/tasks/queue";

import { CATEGORY_LABELS } from "./catalog";
import {
  decideChannel,
  getEventMeta,
  isNotificationEvent,
  resolveChannelsForRecipient,
  type CategoryPreferences,
  type ChannelDecision,
  type ChannelFlags,
  type EventMeta,
  type RecipientFacts,
} from "./channels";
import { buildEmail } from "./email-layout";
import type { NotificationChannel, NotificationEvent } from "./events";
import { renderPlainText, renderSubject, renderTemplate, truncateText, type RenderContext } from "./render";
import { DEFAULT_CTA_LABEL, getDefaultTemplate } from "./templates";
import { createUnsubscribeToken } from "./unsubscribe";

/**
 * Notification dispatch engine — runs inside the "notifications.dispatch" / "dispatch_staff" /
 * "dispatch_org" / "retry_delivery" background tasks (tasks.ts). Never call it from a request:
 * use notify() / notifyStaff() / notifyOrganization() from "@/modules/notifications".
 *
 * Per recipient × channel: decide (channels.ts) → render (templates.ts + DB overrides, render.ts,
 * email-layout.ts) → write the in-app notification and one delivery row per channel (skipped rows carry
 * the reason) → send through the messaging transports. Idempotent: rows are keyed by a dispatch key
 * (notify's dedupeKey, else the task id) so a retried task never writes or sends twice; deliveries still
 * "queued" after a crash are sent on the re-run (at-least-once). Failed sends are retried by
 * "notifications.retry_delivery" with backoff, up to MAX_DELIVERY_ATTEMPTS.
 */

export const MAX_DELIVERY_ATTEMPTS = 5;
const RECIPIENT_CHUNK = 200;
const IN_APP_BODY_MAX = 2000;
const SMS_MAX = 480;
const PREFERENCES_PATH = "/account/notifications/preferences";
const ONE_CLICK_UNSUBSCRIBE_PATH = "/api/v1/notifications/unsubscribe";
const PLATFORM_PERMISSION_KEYS: ReadonlySet<string> = new Set(PLATFORM_PERMISSIONS.map((p) => p.key));

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

const userRecipientSchema = z.object({ userId: z.uuid() });
const emailRecipientSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().max(200).optional(),
  locale: z.string().trim().max(12).optional(),
});
const phoneRecipientSchema = z.object({ phone: z.string().trim().min(6).max(24), locale: z.string().trim().max(12).optional() });
const recipientSchema = z.union([userRecipientSchema, emailRecipientSchema, phoneRecipientSchema]);
export type RecipientInput = z.infer<typeof recipientSchema>;

const basePayloadSchema = z.object({
  event: z.string().refine(isNotificationEvent, "Unknown notification event"),
  data: z.record(z.string(), z.unknown()).nullish(),
  link: z.string().max(2000).nullish(),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).nullish(),
  organizationId: z.uuid().nullish(),
  dedupeKey: z.string().trim().min(1).max(400).nullish(),
});

export const dispatchPayloadSchema = basePayloadSchema.extend({ recipients: z.array(z.unknown()).max(20_000) });
export const staffDispatchPayloadSchema = basePayloadSchema.extend({ permission: z.string().min(1).max(100) });
export const orgDispatchPayloadSchema = basePayloadSchema.extend({ organizationId: z.uuid(), permission: z.string().min(1).max(100).nullish() });

const retryPayloadSchema = basePayloadSchema.extend({ deliveryId: z.uuid(), recipient: recipientSchema });

type BasePayload = z.infer<typeof basePayloadSchema>;

export type DispatchSummary = { recipients: number; delivered: number; sent: number; failed: number; skipped: number; existing: number };

export type DispatchOptions = {
  /** Idempotency key for rows of this dispatch (notify's dedupeKey, else `task:<id>`). */
  dispatchKey: string;
  /** Override feature flags (tests). */
  flags?: ChannelFlags;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Only relative in-app paths may be stored as notification links (same rule as the DB CHECK). */
export function safeRelativeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const v = link.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\s<>]/.test(v)) return null;
  return v;
}

function appUrl(): string {
  return env().APP_URL.replace(/\/+$/, "");
}

function absolute(path: string): string {
  return `${appUrl()}${path}`;
}

function normalizeLocale(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(v) ? v : "en";
}

export function recipientHash(value: string): string {
  return hmacToken(value, "notification-recipient");
}

function addressHash(channel: NotificationChannel, address: string | null, userId: string | null): string {
  if (address) return recipientHash(channel === "email" ? address.toLowerCase() : address);
  return recipientHash(`user:${userId ?? "unknown"}`);
}

function maskAddress(channel: NotificationChannel, address: string | null): string | null {
  if (!address) return null;
  return channel === "email" ? maskEmail(address) : maskPhone(address);
}

const SNAKE_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Template values: caller data + humanised `<key>Label` copies of snake_case strings + dispatcher values. */
export function buildTemplateValues(data: Record<string, unknown>, extra: { recipientName: string; link: string | null }): Record<string, unknown> {
  const values: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && SNAKE_TOKEN.test(value) && values[`${key}Label`] === undefined) values[`${key}Label`] = humanize(value);
  }
  values.recipientName = extra.recipientName;
  values.appName = BRAND.name;
  values.link = extra.link ?? "";
  return values;
}

function deliveryRetryDelayMs(attempts: number): number {
  const base = Math.min(6 * 60 * 60_000, 60_000 * 5 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function loadFlags(): Promise<ChannelFlags> {
  const [email, sms, whatsapp] = await Promise.all([
    isFeatureEnabled("notifications.email"),
    isFeatureEnabled("notifications.sms"),
    isFeatureEnabled("notifications.whatsapp"),
  ]);
  return { email, sms, whatsapp };
}

type TemplateRow = typeof notificationTemplates.$inferSelect;
type TemplateMap = Map<string, TemplateRow>;

async function loadTemplates(event: NotificationEvent): Promise<TemplateMap> {
  const rows = await db
    .select()
    .from(notificationTemplates)
    .where(and(eq(notificationTemplates.eventKey, event), eq(notificationTemplates.isActive, true)));
  return new Map(rows.map((r) => [`${r.channel}:${r.locale}`, r]));
}

function pickTemplate(map: TemplateMap, channel: NotificationChannel, locale: string): TemplateRow | null {
  return map.get(`${channel}:${locale}`) ?? map.get(`${channel}:en`) ?? null;
}

function hasWhatsAppTemplate(map: TemplateMap, locale: string): boolean {
  return Boolean(pickTemplate(map, "whatsapp", locale)?.whatsappTemplateName);
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

type ParsedRecipient = { kind: "user"; userId: string } | { kind: "email"; email: string; name: string; locale: string } | { kind: "phone"; phone: string; locale: string };

export type LoadedRecipient = {
  input: ParsedRecipient;
  userId: string | null;
  name: string;
  locale: string;
  timeZone: string;
  facts: RecipientFacts;
  preferences: CategoryPreferences;
};

function parseRecipients(raw: readonly unknown[]): ParsedRecipient[] {
  const out: ParsedRecipient[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = recipientSchema.safeParse(item);
    if (!parsed.success) {
      logger.warn("Notification recipient ignored (invalid)", { issues: parsed.error.issues.length });
      continue;
    }
    const r = parsed.data;
    if ("userId" in r) {
      if (seen.has(`u:${r.userId}`)) continue;
      seen.add(`u:${r.userId}`);
      out.push({ kind: "user", userId: r.userId });
    } else if ("email" in r) {
      if (seen.has(`e:${r.email}`)) continue;
      seen.add(`e:${r.email}`);
      out.push({ kind: "email", email: r.email, name: r.name ?? "", locale: normalizeLocale(r.locale) });
    } else {
      const phone = normalizePhone(r.phone);
      if (!phone) {
        logger.warn("Notification recipient ignored (invalid phone number)");
        continue;
      }
      if (seen.has(`p:${phone}`)) continue;
      seen.add(`p:${phone}`);
      out.push({ kind: "phone", phone, locale: normalizeLocale(r.locale) });
    }
  }
  return out;
}

async function loadRecipients(parsed: ParsedRecipient[], event: EventMeta, needWhatsAppConsent: boolean): Promise<LoadedRecipient[]> {
  const defaultZone = env().DEFAULT_TIMEZONE;
  const userIds = parsed.filter((r): r is Extract<ParsedRecipient, { kind: "user" }> => r.kind === "user").map((r) => r.userId);

  const [userRows, prefRows, consentRows] = userIds.length
    ? await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            phone: users.phone,
            phoneVerifiedAt: users.phoneVerifiedAt,
            displayName: users.displayName,
            status: users.status,
            locale: users.locale,
            timezone: users.timezone,
          })
          .from(users)
          .where(inArray(users.id, userIds)),
        db
          .select({ userId: notificationPreferences.userId, channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
          .from(notificationPreferences)
          .where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences.category, event.category))),
        needWhatsAppConsent
          ? db
              .selectDistinctOn([consentRecords.userId], { userId: consentRecords.userId, granted: consentRecords.granted })
              .from(consentRecords)
              .where(and(inArray(consentRecords.userId, userIds), eq(consentRecords.purpose, "whatsapp_updates")))
              .orderBy(consentRecords.userId, desc(consentRecords.createdAt))
          : Promise.resolve([] as { userId: string | null; granted: boolean }[]),
      ])
    : [[], [], []];

  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const prefMap = new Map<string, CategoryPreferences>();
  for (const p of prefRows) {
    const entry = prefMap.get(p.userId) ?? {};
    entry[p.channel] = p.enabled;
    prefMap.set(p.userId, entry);
  }
  const consentMap = new Map(consentRows.filter((c) => c.userId).map((c) => [c.userId as string, c.granted]));

  const loaded: LoadedRecipient[] = [];
  for (const r of parsed) {
    if (r.kind === "user") {
      const u = userMap.get(r.userId);
      if (!u) {
        logger.warn("Notification recipient ignored (user not found)", { event: event.key });
        continue;
      }
      loaded.push({
        input: r,
        userId: u.id,
        name: u.displayName,
        locale: normalizeLocale(u.locale),
        timeZone: u.timezone || defaultZone,
        facts: {
          kind: "user",
          active: u.status === "active" || u.status === "pending_verification",
          email: u.email,
          emailVerified: Boolean(u.emailVerifiedAt),
          phone: u.phone,
          phoneVerified: Boolean(u.phoneVerifiedAt),
          whatsappConsent: consentMap.get(u.id) === true,
        },
        preferences: prefMap.get(u.id) ?? {},
      });
    } else if (r.kind === "email") {
      loaded.push({ input: r, userId: null, name: r.name, locale: r.locale, timeZone: defaultZone, facts: { kind: "email", email: r.email }, preferences: {} });
    } else {
      loaded.push({ input: r, userId: null, name: "", locale: r.locale, timeZone: defaultZone, facts: { kind: "phone", phone: r.phone }, preferences: {} });
    }
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

type InAppContent = { channel: "in_app"; title: string; body: string };
type EmailContent = { channel: "email"; subject: string; html: string; text: string; headers?: Record<string, string> };
type SmsContent = { channel: "sms"; body: string; templateId?: string; variables?: Record<string, string> };
type WhatsAppContent = { channel: "whatsapp"; templateName: string; languageCode: string; variables: string[]; fallbackText: string };
type Content = InAppContent | EmailContent | SmsContent | WhatsAppContent;

type RenderInput = {
  event: EventMeta;
  recipient: LoadedRecipient;
  data: Record<string, unknown>;
  link: string | null;
  templates: TemplateMap;
};

function renderContext(r: LoadedRecipient): RenderContext {
  return { timeZone: r.timeZone, locale: r.locale, appUrl: appUrl() };
}

function primitiveVariables(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v).slice(0, 200);
  }
  return out;
}

export function renderChannelContent(channel: NotificationChannel, input: RenderInput): { content: Content; template: TemplateRow | null } {
  const { event, recipient, data, link, templates } = input;
  const absLink = link ? absolute(link) : null;
  const values = buildTemplateValues(data, { recipientName: recipient.name, link: absLink });
  const ctx = renderContext(recipient);
  const fallback = getDefaultTemplate(event.key);
  const dbTemplate = pickTemplate(templates, channel, recipient.locale);

  switch (channel) {
    case "in_app": {
      const subject = dbTemplate?.subject ?? fallback.subject;
      const body = dbTemplate?.body ?? fallback.body;
      const title = renderSubject(subject, values, ctx) || event.label;
      return { content: { channel, title, body: truncateText(renderPlainText(body, values, ctx), IN_APP_BODY_MAX) }, template: dbTemplate };
    }
    case "email": {
      const rendered = renderTemplate({ subject: dbTemplate?.subject ?? fallback.subject, body: dbTemplate?.body ?? fallback.body }, values, ctx);
      const subject = rendered.subject || event.label;
      const isUser = recipient.facts.kind === "user" && recipient.userId;
      const unsubscribeToken =
        isUser && !event.mandatory ? encodeURIComponent(createUnsubscribeToken({ userId: recipient.userId!, category: event.category, channel: "email" })) : null;
      const unsubscribeUrl = unsubscribeToken ? absolute(`/notifications/unsubscribe?token=${unsubscribeToken}`) : null;
      // RFC 8058 one-click: mail clients POST "List-Unsubscribe=One-Click" to this endpoint (a GET opens the confirmation page).
      const headers = unsubscribeToken
        ? { "List-Unsubscribe": `<${absolute(`${ONE_CLICK_UNSUBSCRIBE_PATH}?token=${unsubscribeToken}`)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
        : undefined;
      const built = buildEmail({
        locale: recipient.locale,
        subject,
        preheader: truncateText(rendered.text.replace(/\s+/g, " "), 140),
        bodyHtml: rendered.html,
        bodyText: rendered.text,
        cta: absLink ? { label: fallback.cta ?? DEFAULT_CTA_LABEL, url: absLink } : null,
        brand: { name: BRAND.name, legalEntity: BRAND.legalEntity, address: BRAND.headquarters, homeUrl: absolute("/") },
        footer: isUser
          ? {
              reason: `You are receiving this email because you have a ${BRAND.name} account.`,
              preferencesUrl: absolute(PREFERENCES_PATH),
              unsubscribeUrl,
              unsubscribeLabel: `Unsubscribe from ${CATEGORY_LABELS[event.category].label.toLowerCase()} emails`,
              mandatoryNote: event.mandatory ? "This is a required service message about your account or a transaction, so it is sent even if you have turned off other emails." : null,
            }
          : {
              reason: `You are receiving this email because this address was given to ${BRAND.name}, for example in a form or an invitation.`,
            },
      });
      return { content: { channel, subject: built.subject, html: built.html, text: built.text, ...(headers ? { headers } : {}) }, template: dbTemplate };
    }
    case "sms": {
      const text = dbTemplate
        ? renderPlainText(dbTemplate.body, values, ctx)
        : fallback.sms
          ? renderPlainText(fallback.sms, values, ctx)
          : `${BRAND.name}: ${renderSubject(fallback.subject, values, ctx)}${absLink ? ` ${absLink}` : ""}`;
      const content: SmsContent = { channel, body: truncateText(text.replace(/\s+/g, " ").trim(), SMS_MAX) };
      if (dbTemplate?.smsTemplateId) {
        content.templateId = dbTemplate.smsTemplateId;
        content.variables = primitiveVariables(values);
      }
      return { content, template: dbTemplate };
    }
    case "whatsapp": {
      // Decision rules guarantee a template with a pre-approved name exists before we get here.
      const t = dbTemplate!;
      const variables = t.body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => renderPlainText(line, values, ctx).slice(0, 1000) || "-");
      const fallbackText = renderPlainText(fallback.body, values, ctx);
      return {
        content: { channel, templateName: t.whatsappTemplateName ?? "", languageCode: t.whatsappLanguageCode ?? t.locale, variables, fallbackText: truncateText(fallbackText, 1000) },
        template: t,
      };
    }
  }
}

async function send(content: Content, address: string, event: EventMeta): Promise<SendResult> {
  switch (content.channel) {
    case "email":
      return sendEmail({ to: address, subject: content.subject, html: content.html, text: content.text, tags: [event.key], headers: content.headers });
    case "sms":
      return sendSms({ to: address, body: content.body, templateId: content.templateId, variables: content.variables });
    case "whatsapp":
      return sendWhatsApp({ to: address, templateName: content.templateName, languageCode: content.languageCode, variables: content.variables, fallbackText: content.fallbackText });
    case "in_app":
      return { ok: true, provider: "in_app" };
  }
}

// ---------------------------------------------------------------------------
// Delivery attempts
// ---------------------------------------------------------------------------

type RetryContext = { payload: BasePayload; recipient: RecipientInput };

function toRecipientInput(r: ParsedRecipient): RecipientInput {
  if (r.kind === "user") return { userId: r.userId };
  if (r.kind === "email") return { email: r.email, ...(r.name ? { name: r.name } : {}), locale: r.locale };
  return { phone: r.phone, locale: r.locale };
}

/**
 * Claim a queued / failed delivery (optimistic: attempts must still be what we saw), send it and record
 * the outcome. A failure schedules the next retry with backoff until MAX_DELIVERY_ATTEMPTS.
 */
async function attemptDelivery(
  row: { id: string; attempts: number },
  content: Content,
  address: string,
  event: EventMeta,
  retry: RetryContext,
): Promise<"sent" | "failed" | "lost"> {
  const claimed = await db
    .update(notificationDeliveries)
    .set({ attempts: sql`${notificationDeliveries.attempts} + 1` })
    .where(and(eq(notificationDeliveries.id, row.id), inArray(notificationDeliveries.status, ["queued", "failed"]), eq(notificationDeliveries.attempts, row.attempts)))
    .returning({ attempts: notificationDeliveries.attempts });
  const attempts = claimed[0]?.attempts;
  if (attempts === undefined) return "lost";

  let result: SendResult;
  try {
    result = await send(content, address, event);
  } catch (error) {
    result = { ok: false, provider: "unknown", error: errorText(error) };
  }

  if (result.ok) {
    await db
      .update(notificationDeliveries)
      .set({ status: "sent", provider: result.provider, providerMessageId: result.providerMessageId ?? null, sentAt: new Date(), lastError: null })
      .where(eq(notificationDeliveries.id, row.id));
    return "sent";
  }

  await db
    .update(notificationDeliveries)
    .set({ status: "failed", provider: result.provider, lastError: result.error.slice(0, 500), failedAt: new Date() })
    .where(eq(notificationDeliveries.id, row.id));
  if (attempts < MAX_DELIVERY_ATTEMPTS) {
    await enqueueTask(
      "notifications.retry_delivery",
      { ...retry.payload, deliveryId: row.id, recipient: retry.recipient } as Record<string, unknown>,
      { runAt: new Date(Date.now() + deliveryRetryDelayMs(attempts)), dedupeKey: `notifications.retry:${row.id}:${attempts}`, maxAttempts: 3 },
    );
  } else {
    logger.warn("Notification delivery failed permanently", { deliveryId: row.id, event: event.key, channel: content.channel, provider: result.provider });
  }
  return "failed";
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

type Planned = {
  recipient: LoadedRecipient;
  channel: NotificationChannel;
  decision: Exclude<ChannelDecision, { action: "ignore" }>;
  hash: string;
  content: Content | null;
  template: TemplateRow | null;
};

function emptySummary(): DispatchSummary {
  return { recipients: 0, delivered: 0, sent: 0, failed: 0, skipped: 0, existing: 0 };
}

/** Dispatch one notify() payload (validated here). Returns counts; throws only on infrastructure errors. */
export async function dispatchNotification(raw: unknown, opts: DispatchOptions): Promise<DispatchSummary> {
  const parsed = dispatchPayloadSchema.safeParse(raw);
  const summary = emptySummary();
  if (!parsed.success) {
    logger.error("Notification payload rejected", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5) });
    return summary;
  }
  const payload = parsed.data;
  const event = getEventMeta(payload.event as NotificationEvent);
  const link = safeRelativeLink(payload.link);
  if (payload.link && !link) logger.warn("Notification link dropped (must be a relative app path)", { event: event.key });
  const data = payload.data ?? {};
  const recipients = parseRecipients(payload.recipients);
  if (!recipients.length) return summary;

  const flags = opts.flags ?? (await loadFlags());
  const templates = await loadTemplates(event.key);
  const base: BasePayload = { event: payload.event, data, link, channels: payload.channels ?? null, organizationId: payload.organizationId ?? null, dedupeKey: payload.dedupeKey ?? null };

  for (let i = 0; i < recipients.length; i += RECIPIENT_CHUNK) {
    const chunk = recipients.slice(i, i + RECIPIENT_CHUNK);
    const needConsent = flags.whatsapp && chunk.some((r) => r.kind === "user");
    const loaded = await loadRecipients(chunk, event, needConsent);
    summary.recipients += loaded.length;
    await dispatchChunk(loaded, { event, data, link, templates, flags, base, dispatchKey: opts.dispatchKey }, summary);
  }
  return summary;
}

type ChunkContext = {
  event: EventMeta;
  data: Record<string, unknown>;
  link: string | null;
  templates: TemplateMap;
  flags: ChannelFlags;
  base: BasePayload;
  dispatchKey: string;
};

function planRecipient(r: LoadedRecipient, c: ChunkContext): Planned[] {
  const channels = resolveChannelsForRecipient({ event: c.event, override: c.base.channels, recipient: r.facts, preferences: r.preferences });
  const plans: Planned[] = [];
  for (const channel of channels) {
    const decision = decideChannel({
      channel,
      event: c.event,
      recipient: r.facts,
      preference: r.preferences[channel],
      flags: c.flags,
      hasWhatsAppTemplate: hasWhatsAppTemplate(c.templates, r.locale),
    });
    if (decision.action === "ignore") continue;
    const address = decision.action === "send" ? decision.address : null;
    const hash = addressHash(channel, address, r.userId);
    if (decision.action === "send") {
      const { content, template } = renderChannelContent(channel, { event: c.event, recipient: r, data: c.data, link: c.link, templates: c.templates });
      plans.push({ recipient: r, channel, decision, hash, content, template });
    } else {
      plans.push({ recipient: r, channel, decision, hash, content: null, template: null });
    }
  }
  return plans;
}

async function dispatchChunk(loaded: LoadedRecipient[], c: ChunkContext, summary: DispatchSummary): Promise<void> {
  const plans = loaded.flatMap((r) => planRecipient(r, c));
  if (!plans.length) return;

  type Pending = { plan: Planned; row: { id: string; attempts: number } };
  const pending: Pending[] = [];

  // Phase 1 — record everything atomically (in-app rows are complete here).
  await db.transaction(async (tx) => {
    const notificationIds = new Map<string, string | null>();
    for (const plan of plans) {
      const r = plan.recipient;
      if (plan.channel !== "in_app" || plan.decision.action !== "send" || !r.userId || plan.content?.channel !== "in_app") continue;
      const inserted = await tx
        .insert(notifications)
        .values({
          userId: r.userId,
          organizationId: c.base.organizationId ?? null,
          eventKey: c.event.key,
          category: c.event.category,
          title: plan.content.title,
          body: plan.content.body || null,
          link: c.link,
          data: c.data,
          dedupeKey: c.dispatchKey,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      let id = inserted[0]?.id ?? null;
      if (!id) {
        const [existing] = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.userId, r.userId), eq(notifications.dedupeKey, c.dispatchKey)))
          .limit(1);
        id = existing?.id ?? null;
      }
      notificationIds.set(r.userId, id);
    }

    for (const plan of plans) {
      const r = plan.recipient;
      const now = new Date();
      const isSend = plan.decision.action === "send";
      const inApp = plan.channel === "in_app";
      const address = isSend ? (plan.decision as { address: string | null }).address : null;
      const skipReason: NotificationSkipReason | null = plan.decision.action === "skip" ? plan.decision.reason : null;
      const inserted = await tx
        .insert(notificationDeliveries)
        .values({
          notificationId: r.userId ? (notificationIds.get(r.userId) ?? null) : null,
          userId: r.userId,
          eventKey: c.event.key,
          channel: plan.channel,
          recipient: maskAddress(plan.channel, address),
          recipientHash: plan.hash,
          locale: r.locale,
          templateId: plan.template?.id ?? null,
          templateVersion: plan.template?.version ?? null,
          status: !isSend ? "skipped" : inApp ? "delivered" : "queued",
          skipReason,
          provider: inApp && isSend ? "in_app" : null,
          attempts: inApp && isSend ? 1 : 0,
          dedupeKey: c.dispatchKey,
          sentAt: inApp && isSend ? now : null,
          deliveredAt: inApp && isSend ? now : null,
        })
        .onConflictDoNothing()
        .returning({ id: notificationDeliveries.id, status: notificationDeliveries.status, attempts: notificationDeliveries.attempts });

      let row = inserted[0];
      if (row) {
        if (row.status === "skipped") summary.skipped += 1;
        else if (row.status === "delivered") summary.delivered += 1;
      } else {
        summary.existing += 1;
        [row] = await tx
          .select({ id: notificationDeliveries.id, status: notificationDeliveries.status, attempts: notificationDeliveries.attempts })
          .from(notificationDeliveries)
          .where(
            and(
              eq(notificationDeliveries.dedupeKey, c.dispatchKey),
              eq(notificationDeliveries.channel, plan.channel),
              eq(notificationDeliveries.recipientHash, plan.hash),
            ),
          )
          .limit(1);
      }
      // A row still "queued" (new, or left by a crashed run) is sent now; failed rows belong to the retry task.
      if (row && row.status === "queued" && isSend && !inApp) pending.push({ plan, row: { id: row.id, attempts: row.attempts } });
    }
  });

  // Phase 2 — send outside the transaction.
  for (const { plan, row } of pending) {
    if (!plan.content || plan.decision.action !== "send" || !plan.decision.address) continue;
    const outcome = await attemptDelivery(row, plan.content, plan.decision.address, c.event, {
      payload: c.base,
      recipient: toRecipientInput(plan.recipient.input),
    });
    if (outcome === "sent") summary.sent += 1;
    else if (outcome === "failed") summary.failed += 1;
  }
}

// ---------------------------------------------------------------------------
// Staff / organisation fan-out
// ---------------------------------------------------------------------------

/** Active staff whose platform roles grant `permission` (super admins always included). */
export async function resolveStaffRecipients(permission: string): Promise<string[]> {
  if (!PLATFORM_PERMISSION_KEYS.has(permission)) {
    logger.error("notifyStaff: unknown platform permission", { permission });
    return [];
  }
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.scope, "platform")))
    .where(and(eq(users.isStaff, true), eq(users.status, "active"), or(eq(roles.key, SUPER_ADMIN_ROLE_KEY), arrayContains(roles.permissions, [permission]))));
  return rows.map((r) => r.id);
}

/** Active members of an organisation (optionally only those whose role grants `permission`). */
export async function resolveOrganizationRecipients(organizationId: string, permission?: string | null): Promise<string[]> {
  const conditions = [
    eq(organizationMembers.organizationId, organizationId),
    eq(organizationMembers.status, "active"),
    eq(users.status, "active"),
    isNull(organizations.deletedAt),
  ];
  if (permission) conditions.push(arrayContains(roles.permissions, [permission]));
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(...conditions));
  return rows.map((r) => r.id);
}

export async function dispatchToStaff(raw: unknown, opts: DispatchOptions): Promise<DispatchSummary> {
  const parsed = staffDispatchPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error("Staff notification payload rejected", { issues: parsed.error.issues.length });
    return emptySummary();
  }
  const { permission, ...rest } = parsed.data;
  const ids = await resolveStaffRecipients(permission);
  return dispatchNotification({ ...rest, recipients: ids.map((userId) => ({ userId })) }, opts);
}

export async function dispatchToOrganization(raw: unknown, opts: DispatchOptions): Promise<DispatchSummary> {
  const parsed = orgDispatchPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error("Organisation notification payload rejected", { issues: parsed.error.issues.length });
    return emptySummary();
  }
  const { permission, ...rest } = parsed.data;
  const ids = await resolveOrganizationRecipients(rest.organizationId, permission ?? null);
  return dispatchNotification({ ...rest, recipients: ids.map((userId) => ({ userId })) }, opts);
}

// ---------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------

export type RetryOutcome = "sent" | "failed" | "skipped" | "noop";

/** Handler body of "notifications.retry_delivery". Re-checks the recipient and preferences, re-renders, re-sends. */
export async function retryDelivery(raw: unknown, opts: { flags?: ChannelFlags } = {}): Promise<RetryOutcome> {
  const parsed = retryPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error("Notification retry payload rejected", { issues: parsed.error.issues.length });
    return "noop";
  }
  const { deliveryId, recipient, ...payload } = parsed.data;
  const [row] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, deliveryId)).limit(1);
  if (!row || row.status !== "failed" || row.attempts >= MAX_DELIVERY_ATTEMPTS) return "noop";

  const event = getEventMeta(payload.event as NotificationEvent);
  const channel = row.channel;
  const flags = opts.flags ?? (await loadFlags());
  const [loaded] = await loadRecipients(parseRecipients([recipient]), event, channel === "whatsapp" && flags.whatsapp);

  const markSkipped = async (reason: NotificationSkipReason) => {
    await db
      .update(notificationDeliveries)
      .set({ status: "skipped", skipReason: reason })
      .where(and(eq(notificationDeliveries.id, row.id), eq(notificationDeliveries.status, "failed")));
    return "skipped" as const;
  };
  if (!loaded) return markSkipped("recipient_inactive");

  const templates = await loadTemplates(event.key);
  const decision = decideChannel({
    channel,
    event,
    recipient: loaded.facts,
    preference: loaded.preferences[channel],
    flags,
    hasWhatsAppTemplate: hasWhatsAppTemplate(templates, loaded.locale),
  });
  if (decision.action === "ignore") return markSkipped("no_address");
  if (decision.action === "skip") return markSkipped(decision.reason);
  if (!decision.address) return markSkipped("no_address");

  const link = safeRelativeLink(payload.link);
  const { content } = renderChannelContent(channel, { event, recipient: loaded, data: payload.data ?? {}, link, templates });
  const outcome = await attemptDelivery({ id: row.id, attempts: row.attempts }, content, decision.address, event, {
    payload: { ...payload, link },
    recipient,
  });
  return outcome === "lost" ? "noop" : outcome;
}
