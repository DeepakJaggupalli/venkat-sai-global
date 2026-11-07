import "server-only";

import { z } from "zod";

/**
 * Validated server environment. Read lazily (call `env()`), so `next build`
 * does not fail when optional integrations are not configured.
 * Client code must only use NEXT_PUBLIC_* variables — never import this file there.
 */
const isProd = process.env.NODE_ENV === "production";

const devFallback = (name: string) => (isProd ? undefined : `dev-insecure-${name}-change-me-0123456789abcdef`);

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Kolkata"),

  DATABASE_URL: z.string().min(1),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DATA_ENCRYPTION_KEY: z.string().min(32, "DATA_ENCRYPTION_KEY must be a 32-byte base64 key"),
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  EMAIL_TRANSPORT: z.enum(["dev", "smtp"]).default("dev"),
  EMAIL_FROM: z.string().default("Venkat Sai Global <no-reply@example.com>"),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,

  SMS_PROVIDER: z.enum(["dev", "msg91", "twilio"]).default("dev"),
  MSG91_AUTH_KEY: optional,
  MSG91_SENDER_ID: optional,
  MSG91_TEMPLATE_ID: optional,
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM: optional,
  WHATSAPP_PROVIDER: z.enum(["dev", "meta"]).default("dev"),
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_ACCESS_TOKEN: optional,

  STORAGE_DRIVER: z.enum(["local", "s3", "blob"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  STORAGE_PUBLIC_HOST: optional,
  /** Vercel Blob (private store) read-write token; set automatically when a store is connected. */
  BLOB_READ_WRITE_TOKEN: optional,
  CLAMAV_HOST: optional,
  CLAMAV_PORT: z.coerce.number().default(3310),

  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const raw = {
    ...process.env,
    SESSION_SECRET: process.env.SESSION_SECRET || devFallback("session"),
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY || devFallback("encryption"),
    IP_HASH_SALT: process.env.IP_HASH_SALT || devFallback("iphash"),
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Absolute URL helper (emails, OAuth callbacks, sitemap). */
export function absoluteUrl(path = "/"): string {
  const base = env().APP_URL.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const integrations = {
  googleSignIn: () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),
  razorpay: () => Boolean(env().RAZORPAY_KEY_ID && env().RAZORPAY_KEY_SECRET),
  stripe: () => Boolean(env().STRIPE_SECRET_KEY),
  malwareScanning: () => Boolean(env().CLAMAV_HOST),
};
