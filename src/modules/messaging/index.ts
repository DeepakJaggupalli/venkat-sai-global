import "server-only";

import { db } from "@/db";
import { devOutbox } from "@/db/schema";
import { logger } from "@/lib/logger";

import { sanitizeEmailHeaders } from "./headers";

export { sanitizeEmailHeaders } from "./headers";

/**
 * Low-level message transports — CONTRACT used by auth (OTP) and the notifications engine.
 * Business code should call `notify()` (src/modules/notifications) instead, except for
 * one-time codes, which must be sent immediately and are not subject to preferences.
 *
 * In development (EMAIL_TRANSPORT=dev / SMS_PROVIDER=dev / WHATSAPP_PROVIDER=dev) messages are
 * stored in the dev outbox (admin → System → Dev outbox) instead of being sent.
 * The real providers (SMTP, MSG91, Twilio, Meta WhatsApp Cloud API) are implemented in
 * ./providers.ts by the infrastructure module and selected by environment variables.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: string[];
  /** Extra headers (e.g. List-Unsubscribe). Every transport sanitises them (sanitizeEmailHeaders). */
  headers?: Record<string, string>;
};
export type SmsMessage = { to: string; body: string; templateId?: string; variables?: Record<string, string> };
export type WhatsAppMessage = { to: string; templateName: string; languageCode: string; variables: string[]; fallbackText?: string };
export type SendResult = { ok: true; providerMessageId?: string; provider: string } | { ok: false; error: string; provider: string };

export type MessagingProviders = {
  sendEmail(message: EmailMessage): Promise<SendResult>;
  sendSms(message: SmsMessage): Promise<SendResult>;
  sendWhatsApp(message: WhatsAppMessage): Promise<SendResult>;
};

/** Dev transport: capture in the dev outbox. */
export const devProviders: MessagingProviders = {
  async sendEmail(m) {
    const headers = sanitizeEmailHeaders(m.headers);
    await db.insert(devOutbox).values({ channel: "email", to: m.to, subject: m.subject, bodyText: m.text, bodyHtml: m.html, metadata: { tags: m.tags ?? [], ...(headers ? { headers } : {}) } });
    logger.info("[dev-outbox] email captured", { to: m.to, subject: m.subject });
    return { ok: true, provider: "dev" };
  },
  async sendSms(m) {
    await db.insert(devOutbox).values({ channel: "sms", to: m.to, bodyText: m.body, metadata: { templateId: m.templateId ?? null } });
    logger.info("[dev-outbox] sms captured", { to: m.to });
    return { ok: true, provider: "dev" };
  },
  async sendWhatsApp(m) {
    await db.insert(devOutbox).values({
      channel: "whatsapp",
      to: m.to,
      subject: m.templateName,
      bodyText: m.fallbackText ?? m.variables.join(" | "),
      metadata: { templateName: m.templateName, languageCode: m.languageCode, variables: m.variables },
    });
    logger.info("[dev-outbox] whatsapp captured", { to: m.to, template: m.templateName });
    return { ok: true, provider: "dev" };
  },
};

async function providers(): Promise<MessagingProviders> {
  const mod = await import("./providers");
  return mod.getProviders();
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  return (await providers()).sendEmail(message);
}

export async function sendSms(message: SmsMessage): Promise<SendResult> {
  return (await providers()).sendSms(message);
}

export async function sendWhatsApp(message: WhatsAppMessage): Promise<SendResult> {
  return (await providers()).sendWhatsApp(message);
}
