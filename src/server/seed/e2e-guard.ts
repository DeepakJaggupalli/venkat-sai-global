/**
 * Safety guard and env-file helpers for the local-only end-to-end seed (`npm run db:seed:e2e`).
 * Pure (no database or server imports) so it can be unit-tested and checked before `@/db` is loaded.
 */

/** Hosts the E2E seed may write to. Anything else (Neon, staging, a LAN host, a socket path) is refused. */
export const E2E_ALLOWED_HOSTS: readonly string[] = ["127.0.0.1", "localhost"];

export class E2eSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "E2eSeedRefused";
  }
}

/**
 * Throws `E2eSeedRefused` unless DATABASE_URL points at a local PostgreSQL and NODE_ENV is not production.
 * Also refuses connection strings whose query overrides the host (`?host=` / `?hostaddr=` are honoured by
 * node-postgres and could redirect a "localhost" URL elsewhere) and anything running on Vercel.
 * Returns the parsed URL (password included — never log it).
 */
export function assertE2eSeedAllowed(env: Readonly<Record<string, string | undefined>>): URL {
  if (env.NODE_ENV === "production") throw new E2eSeedRefused("Refusing to run the E2E seed with NODE_ENV=production.");
  if (env.VERCEL || env.VERCEL_ENV) throw new E2eSeedRefused("Refusing to run the E2E seed on Vercel.");
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new E2eSeedRefused("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new E2eSeedRefused("DATABASE_URL is not a valid connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new E2eSeedRefused("DATABASE_URL must be a postgres:// URL.");
  }
  const host = url.hostname.toLowerCase();
  if (!E2E_ALLOWED_HOSTS.includes(host)) {
    throw new E2eSeedRefused(`Refusing to run the E2E seed against host "${host || "(none)"}": only ${E2E_ALLOWED_HOSTS.join(" or ")} is allowed.`);
  }
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase() === "host" || key.toLowerCase() === "hostaddr") {
      throw new E2eSeedRefused("Refusing a DATABASE_URL whose query string overrides the host.");
    }
  }
  return url;
}

/** Characters that never need quoting in a POSIX `KEY=value` line. */
const SAFE_VALUE = /^[A-Za-z0-9@%+=:,./_-]*$/;

/** Formats `KEY=value` lines that `set -a; . file` (bash) can source. Values are single-quoted when needed. */
export function formatEnvFile(values: Readonly<Record<string, string>>, header: readonly string[] = []): string {
  const lines = header.map((line) => `# ${line}`);
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid env key: ${key}`);
    if (/[\r\n]/.test(value)) throw new Error(`Env value for ${key} contains a line break`);
    lines.push(`${key}=${SAFE_VALUE.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Parses the KEY=value lines written by `formatEnvFile` (used to keep passwords with --keep-passwords). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2]!;
    if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) value = value.slice(1, -1).replace(/'\\''/g, "'");
    out[match[1]!] = value;
  }
  return out;
}
