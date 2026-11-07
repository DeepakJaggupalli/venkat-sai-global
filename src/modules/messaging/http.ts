import "server-only";

import type { SendResult } from "./index";

/**
 * HTTP plumbing for SMS / WhatsApp providers: 10 s timeout, JSON parsing, and mapping of every
 * failure (network, timeout, HTTP status, provider error body) to a SendResult. Request bodies
 * are never logged or echoed (they can contain one-time codes).
 */
export const PROVIDER_TIMEOUT_MS = 10_000;

export type ProviderResponse = { status: number; ok: boolean; json: unknown; text: string };

export async function providerFetch(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<ProviderResponse> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, ok: res.ok, json, text };
}

/** Map a thrown fetch error (timeout / DNS / connection) to a failed SendResult. */
export function networkFailure(provider: string, error: unknown): SendResult {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return { ok: false, provider, error: `${provider} did not respond within ${PROVIDER_TIMEOUT_MS / 1000} seconds` };
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, provider, error: `${provider} request failed: ${message.slice(0, 200)}` };
}

/** Pull a short human-readable error out of a provider response body. */
export function describeHttpFailure(provider: string, res: ProviderResponse, extract: (json: unknown) => string | null | undefined): SendResult {
  const detail = extract(res.json) ?? (res.text ? res.text.slice(0, 200) : null);
  return { ok: false, provider, error: `${provider} returned HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** E.164 ("+919876543210") → digits only with country code ("919876543210"), or null if invalid. */
export function toMsisdn(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(digits)) return null;
  return digits.replace(/^\+/, "");
}

/** "+919876543210" → "+91•••••3210" for logs. */
export function maskRecipient(value: string): string {
  if (value.includes("@")) {
    const [user = "", domain = ""] = value.split("@");
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  return value.length > 6 ? `${value.slice(0, 3)}•••${value.slice(-4)}` : "•••";
}
