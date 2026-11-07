import "server-only";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { maskRecipient } from "./http";
import { devProviders, type MessagingProviders, type SendResult } from "./index";
import { sendMsg91Sms, sendTwilioSms } from "./sms";
import { sendSmtpEmail } from "./smtp";
import { sendMetaWhatsApp } from "./whatsapp";

/**
 * Provider selection by environment:
 *   EMAIL_TRANSPORT   dev | smtp            (nodemailer SMTP, EMAIL_FROM sender)
 *   SMS_PROVIDER      dev | msg91 | twilio  (MSG91 Flow API with DLT template / Twilio REST)
 *   WHATSAPP_PROVIDER dev | meta            (Meta WhatsApp Cloud API template messages)
 * "dev" stores messages in the dev outbox (devProviders in ./index) instead of sending them.
 *
 * Every real send has a 10 s timeout and never throws: failures come back as
 * { ok: false, error, provider }. Logs carry the provider, a masked recipient and the outcome —
 * never the message body, subject variables or codes.
 */

type Channel = "email" | "sms" | "whatsapp";

function logOutcome(channel: Channel, to: string, result: SendResult) {
  if (result.ok) logger.info("Message sent", { channel, provider: result.provider, to: maskRecipient(to), providerMessageId: result.providerMessageId ?? null });
  else logger.warn("Message send failed", { channel, provider: result.provider, to: maskRecipient(to), error: result.error });
}

/** Guard against an unexpected throw inside a provider implementation. */
async function safely(channel: Channel, provider: string, to: string, send: () => Promise<SendResult>): Promise<SendResult> {
  let result: SendResult;
  try {
    result = await send();
  } catch (error) {
    result = { ok: false, provider, error: error instanceof Error ? error.message.slice(0, 200) : "Unexpected provider error" };
  }
  logOutcome(channel, to, result);
  return result;
}

let cached: { key: string; providers: MessagingProviders } | null = null;
let warnedDevInProduction = false;

export function getProviders(): MessagingProviders {
  const e = env();
  const key = `${e.EMAIL_TRANSPORT}|${e.SMS_PROVIDER}|${e.WHATSAPP_PROVIDER}`;
  if (cached?.key === key) return cached.providers;

  if (e.NODE_ENV === "production" && !warnedDevInProduction && (e.EMAIL_TRANSPORT === "dev" || e.SMS_PROVIDER === "dev" || e.WHATSAPP_PROVIDER === "dev")) {
    warnedDevInProduction = true;
    logger.warn("A messaging channel uses the dev outbox in production; those messages are stored, not sent", {
      email: e.EMAIL_TRANSPORT,
      sms: e.SMS_PROVIDER,
      whatsapp: e.WHATSAPP_PROVIDER,
    });
  }

  const providers: MessagingProviders = {
    sendEmail:
      e.EMAIL_TRANSPORT === "smtp"
        ? (m) => safely("email", "smtp", m.to, () => sendSmtpEmail(m))
        : devProviders.sendEmail,
    sendSms:
      e.SMS_PROVIDER === "msg91"
        ? (m) => safely("sms", "msg91", m.to, () => sendMsg91Sms(m))
        : e.SMS_PROVIDER === "twilio"
          ? (m) => safely("sms", "twilio", m.to, () => sendTwilioSms(m))
          : devProviders.sendSms,
    sendWhatsApp:
      e.WHATSAPP_PROVIDER === "meta"
        ? (m) => safely("whatsapp", "meta_whatsapp", m.to, () => sendMetaWhatsApp(m))
        : devProviders.sendWhatsApp,
  };
  cached = { key, providers };
  return providers;
}
