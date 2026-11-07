import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/lib/env";

import { PROVIDER_TIMEOUT_MS } from "./http";
import type { EmailMessage, SendResult } from "./index";

/**
 * SMTP email via nodemailer. One transport per process (connection settings are cached; the
 * transport opens a connection per message and times out after 10 s at each stage).
 */
let transport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (transport) return transport;
  const e = env();
  if (!e.SMTP_HOST) return null;
  transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    requireTLS: !e.SMTP_SECURE && e.NODE_ENV === "production",
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: PROVIDER_TIMEOUT_MS,
    greetingTimeout: PROVIDER_TIMEOUT_MS,
    socketTimeout: PROVIDER_TIMEOUT_MS,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}

/** Map nodemailer / SMTP errors to a short message without echoing the message content. */
export function describeSmtpError(error: unknown): string {
  if (!(error instanceof Error)) return "SMTP send failed";
  const err = error as Error & { code?: string; responseCode?: number; command?: string };
  const parts = [err.code, err.responseCode ? `SMTP ${err.responseCode}` : null].filter(Boolean);
  const message = err.message.replace(/\s+/g, " ").slice(0, 200);
  return `${parts.length ? `${parts.join(" ")}: ` : ""}${message}`;
}

export async function sendSmtpEmail(message: EmailMessage): Promise<SendResult> {
  const t = getTransport();
  if (!t) return { ok: false, provider: "smtp", error: "SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)" };
  try {
    const info = await t.sendMail({
      from: env().EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      headers: message.tags?.length ? { "X-VSG-Tags": message.tags.join(",").slice(0, 200) } : undefined,
    });
    return { ok: true, provider: "smtp", providerMessageId: typeof info.messageId === "string" ? info.messageId : undefined };
  } catch (error) {
    return { ok: false, provider: "smtp", error: describeSmtpError(error) };
  }
}
