/**
 * Zod schemas for notification forms, actions and route handlers (client-safe).
 */
import { z } from "zod";

import { NOTIFICATION_CATEGORY_KEYS, NOTIFICATION_CHANNEL_KEYS } from "./catalog";
import { isNotificationEvent } from "./channels";

const DELIVERY_STATUSES = ["queued", "sent", "delivered", "failed", "skipped"] as const;

export const notificationIdsSchema = z.object({
  ids: z.array(z.uuid("Invalid notification")).min(1, "Choose at least one notification").max(100),
});

export const markAllReadSchema = z.object({ organizationId: z.uuid().optional() });

/** Body of POST /api/v1/notifications/read: `{ ids: [...] }` or `{ all: true }`. */
export const markReadRequestSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
  z.object({ all: z.literal(true), organizationId: z.uuid().optional() }),
]);

export const notificationListFiltersSchema = z.object({
  filter: z.enum(["all", "unread", "archived"]).catch("all").default("all"),
  category: z.enum(NOTIFICATION_CATEGORY_KEYS).optional().catch(undefined),
  organizationId: z.uuid().optional().catch(undefined),
});

export const preferenceChangeSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORY_KEYS),
  channel: z.enum(NOTIFICATION_CHANNEL_KEYS),
  enabled: z.boolean(),
});

/** Preferences form: the client posts `preferences:json` with every cell it shows. */
export const preferencesFormSchema = z.object({
  preferences: z.array(preferenceChangeSchema).max(200, "Too many preferences"),
});

export const unsubscribeFormSchema = z.object({
  token: z.string({ error: "This unsubscribe link is not valid." }).trim().min(10, "This unsubscribe link is not valid.").max(600),
});

const optionalTrimmed = (max: number) => z.string().trim().max(max, "Too long").optional();

export const templateFormSchema = z
  .object({
    eventKey: z.string().refine(isNotificationEvent, "Choose a notification event"),
    channel: z.enum(NOTIFICATION_CHANNEL_KEYS, { error: "Choose a channel" }),
    locale: z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/, "Choose a language")
      .default("en"),
    subject: optionalTrimmed(300),
    body: z.string({ error: "Enter the message body" }).trim().min(1, "Enter the message body").max(10_000, "The message is too long"),
    whatsappTemplateName: optionalTrimmed(200),
    whatsappLanguageCode: optionalTrimmed(20),
    smsTemplateId: optionalTrimmed(100),
    isActive: z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean()),
  })
  .superRefine((v, ctx) => {
    if ((v.channel === "email" || v.channel === "in_app") && !v.subject) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: "A subject is required for email and in-app templates" });
    }
    if (v.channel === "whatsapp" && v.isActive && !v.whatsappTemplateName) {
      ctx.addIssue({ code: "custom", path: ["whatsappTemplateName"], message: "Enter the approved WhatsApp template name" });
    }
  });

export const templatePreviewSchema = z.object({
  eventKey: z.string().refine(isNotificationEvent, "Choose a notification event"),
  channel: z.enum(NOTIFICATION_CHANNEL_KEYS),
  locale: z.string().trim().max(12).optional(),
  /** Draft text to preview; the active override / code default is used when omitted. */
  subject: z.string().max(300).optional(),
  body: z.string().max(10_000).optional(),
  /** Extra sample values (merged over the built-in sample data). */
  data: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean()])).optional(),
});

export const templateActiveSchema = z.object({ id: z.uuid(), isActive: z.boolean() });

export const deliveryFiltersSchema = z.object({
  status: z.enum(DELIVERY_STATUSES).optional().catch(undefined),
  channel: z.enum(NOTIFICATION_CHANNEL_KEYS).optional().catch(undefined),
  eventKey: z.string().refine(isNotificationEvent).optional().catch(undefined),
  /** Exact email address or phone number (matched by hash, never stored in clear). */
  recipient: z.string().trim().max(320).optional().catch(undefined),
  userId: z.uuid().optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export type TemplateFormInput = z.output<typeof templateFormSchema>;
export type TemplatePreviewInput = z.output<typeof templatePreviewSchema>;
export type DeliveryFilters = z.output<typeof deliveryFiltersSchema>;
