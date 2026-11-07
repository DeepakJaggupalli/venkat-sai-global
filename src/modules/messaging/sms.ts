import "server-only";

import { env } from "@/lib/env";

import { describeHttpFailure, isRecord, networkFailure, providerFetch, toMsisdn } from "./http";
import type { SendResult, SmsMessage } from "./index";

/**
 * SMS providers.
 *
 * MSG91 (India, DLT): Flow API v5 — POST https://control.msg91.com/api/v5/flow with the `authkey`
 * header and a DLT-approved template. Free text cannot be sent in India: `templateId` (or
 * MSG91_TEMPLATE_ID) is required and `variables` must match the template's ##placeholders##.
 * When no variables are given, the body is sent as `var1` (for single-variable templates).
 *
 * Twilio: Messages REST API with HTTP basic auth. TWILIO_FROM may be a phone number (E.164) or a
 * Messaging Service SID (MG…).
 */

export const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";

export function buildMsg91Payload(message: SmsMessage, defaults: { templateId?: string; senderId?: string }): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const templateId = message.templateId ?? defaults.templateId;
  if (!templateId) return { ok: false, error: "MSG91 needs a DLT-approved template id (pass templateId or set MSG91_TEMPLATE_ID)" };
  const mobiles = toMsisdn(message.to);
  if (!mobiles) return { ok: false, error: "Invalid recipient phone number" };
  const variables = message.variables && Object.keys(message.variables).length ? message.variables : { var1: message.body };
  return {
    ok: true,
    body: {
      template_id: templateId,
      short_url: "0",
      ...(defaults.senderId ? { sender: defaults.senderId } : {}),
      recipients: [{ mobiles, ...variables }],
    },
  };
}

export async function sendMsg91Sms(message: SmsMessage): Promise<SendResult> {
  const e = env();
  if (!e.MSG91_AUTH_KEY) return { ok: false, provider: "msg91", error: "MSG91 is not configured (set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID)" };
  const payload = buildMsg91Payload(message, { templateId: e.MSG91_TEMPLATE_ID, senderId: e.MSG91_SENDER_ID });
  if (!payload.ok) return { ok: false, provider: "msg91", error: payload.error };
  try {
    const res = await providerFetch(MSG91_FLOW_URL, {
      method: "POST",
      headers: { authkey: e.MSG91_AUTH_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload.body),
    });
    const json = isRecord(res.json) ? res.json : {};
    // MSG91 answers HTTP 200 with { type: "error", message } for rejected requests.
    if (!res.ok || json.type === "error") {
      return describeHttpFailure("msg91", { ...res, status: res.status }, (j) => (isRecord(j) && typeof j.message === "string" ? j.message.slice(0, 200) : null));
    }
    return { ok: true, provider: "msg91", providerMessageId: typeof json.message === "string" ? json.message : typeof json.request_id === "string" ? json.request_id : undefined };
  } catch (error) {
    return networkFailure("msg91", error);
  }
}

export function buildTwilioForm(message: SmsMessage, from: string): URLSearchParams {
  const form = new URLSearchParams();
  form.set("To", message.to.startsWith("+") ? message.to : `+${message.to}`);
  if (/^MG[0-9a-f]{32}$/i.test(from)) form.set("MessagingServiceSid", from);
  else form.set("From", from);
  form.set("Body", message.body);
  return form;
}

export async function sendTwilioSms(message: SmsMessage): Promise<SendResult> {
  const e = env();
  if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_FROM) {
    return { ok: false, provider: "twilio", error: "Twilio is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM)" };
  }
  if (!toMsisdn(message.to)) return { ok: false, provider: "twilio", error: "Invalid recipient phone number" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(e.TWILIO_ACCOUNT_SID)}/Messages.json`;
  try {
    const res = await providerFetch(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: buildTwilioForm(message, e.TWILIO_FROM).toString(),
    });
    if (!res.ok) {
      return describeHttpFailure("twilio", res, (j) => (isRecord(j) && typeof j.message === "string" ? `${j.code ?? ""} ${j.message}`.trim().slice(0, 200) : null));
    }
    const json = isRecord(res.json) ? res.json : {};
    return { ok: true, provider: "twilio", providerMessageId: typeof json.sid === "string" ? json.sid : undefined };
  } catch (error) {
    return networkFailure("twilio", error);
  }
}
