import "server-only";

import { env } from "@/lib/env";

import { describeHttpFailure, isRecord, networkFailure, providerFetch, toMsisdn } from "./http";
import type { SendResult, WhatsAppMessage } from "./index";

/**
 * WhatsApp Business via the Meta WhatsApp Cloud API: pre-approved TEMPLATE messages only
 * (business-initiated messages outside the 24-hour window must use templates).
 * POST https://graph.facebook.com/<version>/<phone-number-id>/messages with a bearer token.
 * The Graph API version defaults to v23.0; override with WHATSAPP_GRAPH_API_VERSION.
 */

export const DEFAULT_GRAPH_API_VERSION = "v23.0";

export function graphApiVersion(): string {
  const v = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  return v && /^v\d+\.\d+$/.test(v) ? v : DEFAULT_GRAPH_API_VERSION;
}

export function buildWhatsAppTemplatePayload(message: WhatsAppMessage): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const to = toMsisdn(message.to);
  if (!to) return { ok: false, error: "Invalid recipient phone number" };
  if (!/^[a-z0-9_]{1,512}$/.test(message.templateName)) return { ok: false, error: "Invalid WhatsApp template name" };
  const components = message.variables.length
    ? [{ type: "body", parameters: message.variables.map((text) => ({ type: "text", text: String(text).slice(0, 1024) })) }]
    : [];
  return {
    ok: true,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: { name: message.templateName, language: { code: message.languageCode || "en" }, ...(components.length ? { components } : {}) },
    },
  };
}

export async function sendMetaWhatsApp(message: WhatsAppMessage): Promise<SendResult> {
  const e = env();
  if (!e.WHATSAPP_PHONE_NUMBER_ID || !e.WHATSAPP_ACCESS_TOKEN) {
    return { ok: false, provider: "meta_whatsapp", error: "WhatsApp is not configured (set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN)" };
  }
  const payload = buildWhatsAppTemplatePayload(message);
  if (!payload.ok) return { ok: false, provider: "meta_whatsapp", error: payload.error };
  const url = `https://graph.facebook.com/${graphApiVersion()}/${encodeURIComponent(e.WHATSAPP_PHONE_NUMBER_ID)}/messages`;
  try {
    const res = await providerFetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload.body),
    });
    if (!res.ok) {
      return describeHttpFailure("meta_whatsapp", res, (j) => {
        const err = isRecord(j) && isRecord(j.error) ? j.error : null;
        if (!err) return null;
        const details = isRecord(err.error_data) && typeof err.error_data.details === "string" ? ` (${err.error_data.details})` : "";
        return `${err.code ?? ""} ${typeof err.message === "string" ? err.message : ""}${details}`.trim().slice(0, 200);
      });
    }
    const json = isRecord(res.json) ? res.json : {};
    const first = Array.isArray(json.messages) && isRecord(json.messages[0]) ? json.messages[0] : null;
    return { ok: true, provider: "meta_whatsapp", providerMessageId: first && typeof first.id === "string" ? first.id : undefined };
  } catch (error) {
    return networkFailure("meta_whatsapp", error);
  }
}
