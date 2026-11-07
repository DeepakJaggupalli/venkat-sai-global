import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "./env";

/** URL-safe random token (default 32 bytes ≈ 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Numeric one-time code, uniformly distributed (crypto.randomInt). */
export function randomNumericCode(digits = 6): string {
  let out = "";
  for (let i = 0; i < digits; i++) out += randomInt(0, 10).toString();
  return out;
}

/** HMAC-SHA256 keyed with SESSION_SECRET — used to store tokens/codes without the raw secret. */
export function hmacToken(value: string, purpose = "token"): string {
  return createHmac("sha256", env().SESSION_SECRET).update(`${purpose}:${value}`).digest("base64url");
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Pseudonymise an IP address (never store raw IPs). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env().IP_HASH_SALT).update(ip).digest("base64url").slice(0, 22);
}

// ---------------------------------------------------------------------------
// Field-level encryption (AES-256-GCM). Format: v1.<iv>.<tag>.<ciphertext> (base64url parts)
// Use for: passport / identity numbers, TOTP secrets, bank details, integration secrets.
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
  const raw = env().DATA_ENCRYPTION_KEY;
  const decoded = Buffer.from(raw, "base64");
  // Accept a proper 32-byte base64 key; otherwise derive 32 bytes (dev fallback strings).
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptField(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unsupported encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

/** Safe decrypt for display paths: returns null instead of throwing on corrupt data. */
export function tryDecryptField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptField(payload);
  } catch {
    return null;
  }
}
