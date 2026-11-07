import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

/**
 * Read one-time codes and links that the app "sent" in local development. With EMAIL_TRANSPORT / SMS_PROVIDER /
 * WHATSAPP_PROVIDER set to "dev" (see .env.local), messages are stored in the `dev_outbox` table
 * (src/modules/messaging/index.ts) instead of being delivered.
 *
 * Connection: E2E_DATABASE_URL, else DATABASE_URL from the repository's .env.local. Only 127.0.0.1 / localhost
 * databases are accepted — this helper must never read a shared or production outbox.
 */

export type OutboxChannel = "email" | "sms" | "whatsapp";

export type OutboxMessage = {
  id: string;
  channel: OutboxChannel;
  to: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  createdAt: Date;
};

export type OutboxQuery = {
  channel?: OutboxChannel;
  /** Only messages created at or after this time (take it just before triggering the send). */
  since?: Date;
  /** Case-insensitive substring of the subject (emails). */
  subjectIncludes?: string;
  /** How long to wait for the message to appear (default 15 s). */
  timeoutMs?: number;
};

function readDatabaseUrl(): string {
  const fromEnv = process.env.E2E_DATABASE_URL;
  let url = fromEnv;
  if (!url) {
    const file = path.resolve(__dirname, "..", "..", ".env.local");
    if (existsSync(file)) {
      const line = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .find((l) => /^\s*DATABASE_URL\s*=/.test(l));
      url = line?.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  if (!url) throw new Error("Set E2E_DATABASE_URL or DATABASE_URL in .env.local to read the dev outbox.");
  const host = new URL(url).hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Refusing to read a dev outbox on host "${host}" (local databases only).`);
  return url;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function findLatest(to: string, query: OutboxQuery): Promise<OutboxMessage | null> {
  return withClient(async (client) => {
    const params: unknown[] = [to.trim().toLowerCase()];
    const where = ["lower(\"to\") = $1"];
    if (query.channel) {
      params.push(query.channel);
      where.push(`channel = $${params.length}`);
    }
    if (query.since) {
      params.push(query.since);
      where.push(`created_at >= $${params.length}`);
    }
    if (query.subjectIncludes) {
      params.push(`%${query.subjectIncludes.toLowerCase()}%`);
      where.push(`lower(coalesce(subject, '')) like $${params.length}`);
    }
    const result = await client.query<{ id: string; channel: OutboxChannel; to: string; subject: string | null; body_text: string | null; body_html: string | null; created_at: Date }>(
      `select id, channel, "to", subject, body_text, body_html, created_at from dev_outbox where ${where.join(" and ")} order by created_at desc limit 1`,
      params,
    );
    const row = result.rows[0];
    return row ? { id: row.id, channel: row.channel, to: row.to, subject: row.subject, bodyText: row.body_text, bodyHtml: row.body_html, createdAt: row.created_at } : null;
  });
}

/** The newest matching message, polling until it arrives (throws after `timeoutMs`). */
export async function latestOutboxMessage(to: string, query: OutboxQuery = {}): Promise<OutboxMessage> {
  const deadline = Date.now() + (query.timeoutMs ?? 15_000);
  for (;;) {
    const message = await findLatest(to, query);
    if (message) return message;
    if (Date.now() > deadline) throw new Error(`No ${query.channel ?? "outbox"} message to ${to}${query.since ? ` since ${query.since.toISOString()}` : ""} in the dev outbox.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The 6-digit one-time code in the newest matching message. */
export async function latestOtpCode(to: string, query: OutboxQuery = {}): Promise<string> {
  const message = await latestOutboxMessage(to, query);
  const code = /\b(\d{6})\b/.exec(message.bodyText ?? message.bodyHtml ?? "")?.[1];
  if (!code) throw new Error(`The latest message to ${to} has no 6-digit code.`);
  return code;
}

/**
 * The first link in the newest matching message whose path contains `pathIncludes` (e.g. "/reset-password",
 * "/invite/"). Returned as path + query so specs can `page.goto()` it against their own base URL.
 */
export async function latestLink(to: string, pathIncludes: string, query: OutboxQuery = {}): Promise<string> {
  const message = await latestOutboxMessage(to, query);
  const text = `${message.bodyText ?? ""}\n${message.bodyHtml ?? ""}`;
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
    const url = new URL(match[0].replace(/&amp;/g, "&"));
    if (url.pathname.includes(pathIncludes)) return `${url.pathname}${url.search}`;
  }
  throw new Error(`The latest message to ${to} has no link containing "${pathIncludes}".`);
}
