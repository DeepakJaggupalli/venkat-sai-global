import "server-only";

import { env, integrations } from "@/lib/env";

/**
 * Integration status from environment PRESENCE only. Secret values are never read into the result —
 * only booleans, provider names and non-secret settings (ports, regions, sender addresses' domains).
 */
export type IntegrationState = "configured" | "development" | "incomplete" | "not_configured";

export type IntegrationStatus = {
  id: string;
  name: string;
  purpose: string;
  state: IntegrationState;
  provider: string | null;
  detail: string;
  /** Variable names to set (names only). */
  variables: string[];
  docs: string;
};

const has = (v: unknown) => typeof v === "string" && v.trim() !== "";

export function getIntegrationStatuses(): IntegrationStatus[] {
  const e = env();
  const list: IntegrationStatus[] = [];

  // E-mail
  if (e.EMAIL_TRANSPORT === "dev") {
    list.push({ id: "email", name: "E-mail (SMTP)", purpose: "Sign-in codes, notifications and invoices", state: "development", provider: "Development outbox", detail: "Messages are stored in the development outbox, not sent.", variables: ["EMAIL_TRANSPORT=smtp", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"], docs: "docs/OPERATIONS.md §7.1" });
  } else {
    const ok = has(e.SMTP_HOST);
    list.push({ id: "email", name: "E-mail (SMTP)", purpose: "Sign-in codes, notifications and invoices", state: ok ? "configured" : "incomplete", provider: "SMTP", detail: ok ? `Port ${e.SMTP_PORT}${e.SMTP_SECURE ? " (TLS)" : " (STARTTLS)"}${has(e.SMTP_USER) ? ", authenticated" : ", no login"}.` : "SMTP_HOST is missing.", variables: ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"], docs: "docs/OPERATIONS.md §7.1" });
  }

  // SMS
  if (e.SMS_PROVIDER === "dev") {
    list.push({ id: "sms", name: "SMS", purpose: "Phone sign-in codes and SMS notifications", state: "development", provider: "Development outbox", detail: "Messages are stored in the development outbox, not sent.", variables: ["SMS_PROVIDER=msg91 or twilio"], docs: "docs/OPERATIONS.md §7.2" });
  } else if (e.SMS_PROVIDER === "msg91") {
    const ok = has(e.MSG91_AUTH_KEY) && has(e.MSG91_TEMPLATE_ID);
    list.push({ id: "sms", name: "SMS", purpose: "Phone sign-in codes and SMS notifications", state: ok ? "configured" : "incomplete", provider: "MSG91", detail: ok ? `Sender ID ${has(e.MSG91_SENDER_ID) ? "set" : "not set"}. Templates must be DLT-registered.` : "MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required.", variables: ["MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "MSG91_SENDER_ID"], docs: "docs/OPERATIONS.md §7.2" });
  } else {
    const ok = has(e.TWILIO_ACCOUNT_SID) && has(e.TWILIO_AUTH_TOKEN) && has(e.TWILIO_FROM);
    list.push({ id: "sms", name: "SMS", purpose: "Phone sign-in codes and SMS notifications", state: ok ? "configured" : "incomplete", provider: "Twilio", detail: ok ? "Account, token and sender are set." : "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are required.", variables: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"], docs: "docs/OPERATIONS.md §7.2" });
  }

  // WhatsApp
  if (e.WHATSAPP_PROVIDER === "dev") {
    list.push({ id: "whatsapp", name: "WhatsApp", purpose: "Template notifications", state: "development", provider: "Development outbox", detail: "Messages are stored in the development outbox, not sent.", variables: ["WHATSAPP_PROVIDER=meta", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"], docs: "docs/OPERATIONS.md §7.3" });
  } else {
    const ok = has(e.WHATSAPP_PHONE_NUMBER_ID) && has(e.WHATSAPP_ACCESS_TOKEN);
    list.push({ id: "whatsapp", name: "WhatsApp", purpose: "Template notifications", state: ok ? "configured" : "incomplete", provider: "Meta WhatsApp Cloud API", detail: ok ? "Phone number ID and access token are set. Templates need Meta approval." : "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required.", variables: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"], docs: "docs/OPERATIONS.md §7.3" });
  }

  // Payments
  const razorpay = integrations.razorpay();
  list.push({ id: "razorpay", name: "Razorpay", purpose: "Online card, UPI and net-banking payments (India)", state: razorpay ? (has(e.RAZORPAY_WEBHOOK_SECRET) ? "configured" : "incomplete") : "not_configured", provider: razorpay ? "Razorpay" : null, detail: razorpay ? (has(e.RAZORPAY_WEBHOOK_SECRET) ? "Keys and webhook secret are set." : "Keys are set but RAZORPAY_WEBHOOK_SECRET is missing, so payment confirmations cannot be verified.") : "Not set up. Offline payments can still be recorded by finance.", variables: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], docs: "docs/OPERATIONS.md" });
  const stripe = integrations.stripe();
  list.push({ id: "stripe", name: "Stripe", purpose: "International card payments", state: stripe ? (has(e.STRIPE_WEBHOOK_SECRET) ? "configured" : "incomplete") : "not_configured", provider: stripe ? "Stripe" : null, detail: stripe ? (has(e.STRIPE_WEBHOOK_SECRET) ? "Secret key and webhook secret are set." : "STRIPE_WEBHOOK_SECRET is missing.") : "Not set up.", variables: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], docs: "docs/OPERATIONS.md" });

  // Sign-in
  const google = integrations.googleSignIn();
  list.push({ id: "google", name: "Google sign-in", purpose: "Sign in with a Google account", state: google ? "configured" : has(e.GOOGLE_CLIENT_ID) || has(e.GOOGLE_CLIENT_SECRET) ? "incomplete" : "not_configured", provider: google ? "Google OAuth" : null, detail: google ? "Client ID and secret are set." : "Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are needed; the Google button stays hidden until then.", variables: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], docs: "docs/OPERATIONS.md" });

  // Malware scanning
  const clam = integrations.malwareScanning();
  list.push({ id: "clamav", name: "Malware scanning (ClamAV)", purpose: "Scans every upload before it is served", state: clam ? "configured" : "not_configured", provider: clam ? "ClamAV" : null, detail: clam ? `Scanner on port ${e.CLAMAV_PORT}.` : "Uploads are marked “not scanned”.", variables: ["CLAMAV_HOST", "CLAMAV_PORT"], docs: "docs/OPERATIONS.md §6.4" });

  // Storage
  if (e.STORAGE_DRIVER === "local") {
    list.push({ id: "storage", name: "File storage", purpose: "Résumés, documents, media", state: "configured", provider: "Local disk", detail: "Files are stored on the server's disk. Back them up together with the database. Not suitable for serverless hosting.", variables: ["STORAGE_DRIVER", "STORAGE_LOCAL_DIR"], docs: "docs/OPERATIONS.md §6" });
  } else if (e.STORAGE_DRIVER === "s3") {
    const ok = has(e.S3_BUCKET) && has(e.S3_ACCESS_KEY_ID) && has(e.S3_SECRET_ACCESS_KEY);
    list.push({ id: "storage", name: "File storage", purpose: "Résumés, documents, media", state: ok ? "configured" : "incomplete", provider: "S3-compatible", detail: ok ? `Region ${e.S3_REGION}${has(e.S3_ENDPOINT) ? ", custom endpoint" : ""}.` : "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required.", variables: ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"], docs: "docs/OPERATIONS.md §6" });
  } else {
    const ok = has(e.BLOB_READ_WRITE_TOKEN);
    list.push({ id: "storage", name: "File storage", purpose: "Résumés, documents, media", state: ok ? "configured" : "incomplete", provider: "Vercel Blob", detail: ok ? "Read-write token is set." : "BLOB_READ_WRITE_TOKEN is missing.", variables: ["BLOB_READ_WRITE_TOKEN"], docs: "docs/OPERATIONS.md §6" });
  }

  // Scheduler
  list.push({ id: "cron", name: "Scheduled tasks (cron)", purpose: "Runs background tasks through /api/v1/cron/tick when no worker process is running", state: has(e.CRON_SECRET) ? "configured" : "not_configured", provider: has(e.CRON_SECRET) ? "Cron secret" : null, detail: has(e.CRON_SECRET) ? "The cron endpoint accepts authenticated calls." : "CRON_SECRET is not set; run `npm run worker` instead.", variables: ["CRON_SECRET"], docs: "docs/OPERATIONS.md" });

  return list;
}

export const STATE_LABEL: Record<IntegrationState, { label: string; tone: "success" | "info" | "warning" | "neutral" }> = {
  configured: { label: "Configured", tone: "success" },
  development: { label: "Development mode", tone: "info" },
  incomplete: { label: "Incomplete", tone: "warning" },
  not_configured: { label: "Not configured", tone: "neutral" },
};

/** True when every message transport stores into the dev outbox (the outbox viewer is only useful then). */
export function anyDevTransport(): boolean {
  const e = env();
  return e.EMAIL_TRANSPORT === "dev" || e.SMS_PROVIDER === "dev" || e.WHATSAPP_PROVIDER === "dev";
}
