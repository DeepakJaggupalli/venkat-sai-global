import "server-only";

import type { z } from "zod";

import { decryptField, encryptField } from "@/lib/crypto";

/**
 * Tamper-proof, confidential cookie payloads (AES-256-GCM via encryptField).
 * The purpose tag stops a value sealed for one cookie from being replayed in another.
 */
const MAX_SEALED_LENGTH = 8192;

export function sealJson(purpose: string, payload: unknown): string {
  return encryptField(JSON.stringify({ p: purpose, d: payload }));
}

export function unsealJson<T>(purpose: string, value: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!value || value.length > MAX_SEALED_LENGTH) return null;
  try {
    const envelope = JSON.parse(decryptField(value)) as { p?: unknown; d?: unknown };
    if (envelope.p !== purpose) return null;
    const parsed = schema.safeParse(envelope.d);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
