/**
 * Cookie-consent model shared by the browser (banner, preferences form, tracker) and the server
 * (consent receipts, collector, trackServer). Client-safe and pure: no server imports, no DOM access
 * except in the clearly marked browser helpers (which accept their inputs as arguments).
 *
 * The visitor's choice lives in a first-party cookie `vsg_consent` (12 months, SameSite=Lax, readable by
 * the tracker, so not httpOnly) holding URL-encoded JSON:
 *   { "version": "1.2026-11-01", "categories": { "functional": false, "analytics": true, "session_insights": false },
 *     "anonymousId": "<random>", "timestamp": "2026-11-07T10:00:00.000Z", "gpc": false }
 * Essential cookies are always on and therefore not stored as a category.
 */

export const CONSENT_COOKIE = "vsg_consent";
/** Analytics session id for server-side conversion attribution (set only with analytics consent). */
export const ANALYTICS_SESSION_COOKIE = "vsg_sid";
/** 12 months, in seconds. */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
/** 30 minutes of inactivity ends an analytics session. */
export const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Bump when the consent categories or their meaning change. Combined with the privacy notice version
 * (setting `privacy.policy_version`) into the consent version; any change re-prompts every visitor.
 */
export const CONSENT_REVISION = "1";

export const OPTIONAL_CONSENT_CATEGORIES = ["functional", "analytics", "session_insights"] as const;
export type OptionalConsentCategory = (typeof OPTIONAL_CONSENT_CATEGORIES)[number];
export type ConsentCategories = Record<OptionalConsentCategory, boolean>;

/** Mirrors ANALYTICS_CONSENT_METHODS in src/db/schema/analytics.ts (checked at compile time in consent-service.ts). */
export const CONSENT_METHODS = ["accept_all", "reject_all", "custom", "withdrawn", "browser_signal"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

/** Where a choice was made (consent_records.source). */
export const CONSENT_SOURCES = ["cookie_banner", "cookie_preferences", "account_privacy"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export type StoredConsent = {
  version: string;
  categories: ConsentCategories;
  anonymousId: string;
  /** ISO timestamp of the choice. */
  timestamp: string;
  /** The choice was made while the browser sent a Global Privacy Control signal (so it overrides it). */
  gpc?: boolean;
};

export const NO_OPTIONAL_CONSENT: Readonly<ConsentCategories> = Object.freeze({ functional: false, analytics: false, session_insights: false });
export const ALL_OPTIONAL_CONSENT: Readonly<ConsentCategories> = Object.freeze({ functional: true, analytics: true, session_insights: true });

/** Random client-generated ids (session, visitor, consent receipt): same rule as the database CHECKs. */
export const RANDOM_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const VERSION_RE = /^[A-Za-z0-9._:-]{1,50}$/;

export function isRandomId(value: unknown): value is string {
  return typeof value === "string" && RANDOM_ID_RE.test(value);
}

export function isConsentVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_RE.test(value);
}

/** Consent version shown to visitors: `<revision>.<privacy notice version>`, at most 50 characters. */
export function buildConsentVersion(policyVersion: string): string {
  const safe = policyVersion.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 40) || "0";
  return `${CONSENT_REVISION}.${safe}`;
}

/** 16 random bytes as base64url (22 characters) using Web Crypto (browser and Node 20+). */
export function generateRandomId(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  let binary = "";
  for (const b of buffer) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizeCategories(value: unknown): ConsentCategories | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: ConsentCategories = { ...NO_OPTIONAL_CONSENT };
  for (const key of OPTIONAL_CONSENT_CATEGORIES) {
    const v = record[key];
    if (v !== undefined && typeof v !== "boolean") return null;
    out[key] = v === true;
  }
  return out;
}

/**
 * Parse the `vsg_consent` cookie value (URL-encoded JSON, or plain JSON). Returns null for anything
 * missing, malformed or tampered with — a missing choice means "not consented" everywhere.
 */
export function parseConsentCookie(raw: string | null | undefined): StoredConsent | null {
  if (!raw || raw.length > 2048) return null;
  let text = raw;
  if (!text.trimStart().startsWith("{")) {
    try {
      text = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (!isConsentVersion(record.version) || !isRandomId(record.anonymousId)) return null;
  if (typeof record.timestamp !== "string" || record.timestamp.length > 40 || Number.isNaN(Date.parse(record.timestamp))) return null;
  if (record.gpc !== undefined && typeof record.gpc !== "boolean") return null;
  const categories = normalizeCategories(record.categories);
  if (!categories) return null;
  return {
    version: record.version,
    categories,
    anonymousId: record.anonymousId,
    timestamp: new Date(record.timestamp).toISOString(),
    ...(record.gpc === true ? { gpc: true } : {}),
  };
}

/** Cookie value for `vsg_consent` (URL-encoded JSON). */
export function serializeConsentCookie(consent: StoredConsent): string {
  return encodeURIComponent(
    JSON.stringify({
      version: consent.version,
      categories: {
        functional: consent.categories.functional,
        analytics: consent.categories.analytics,
        session_insights: consent.categories.session_insights,
      },
      anonymousId: consent.anonymousId,
      timestamp: consent.timestamp,
      ...(consent.gpc ? { gpc: true } : {}),
    }),
  );
}

/** Show the banner when there is no valid choice for the current consent version. */
export function consentNeedsPrompt(stored: StoredConsent | null, currentVersion: string): boolean {
  return !stored || stored.version !== currentVersion;
}

/**
 * What the visitor has actually agreed to right now. A missing or outdated choice grants nothing.
 * Global Privacy Control turns analytics and session insights off unless the choice was made while the
 * signal was on (an explicit opt-in on the preferences form overrides the browser default).
 */
export function effectiveConsent(stored: StoredConsent | null, currentVersion: string, gpc: boolean): ConsentCategories {
  if (!stored || stored.version !== currentVersion) return { ...NO_OPTIONAL_CONSENT };
  const categories = { ...stored.categories };
  if (gpc && !stored.gpc) {
    categories.analytics = false;
    categories.session_insights = false;
  }
  return categories;
}

/** analytics_sessions.consentLevel for a set of categories. */
export function consentLevelFor(categories: ConsentCategories): "essential" | "analytics" | "session_insights" {
  if (!categories.analytics) return "essential";
  return categories.session_insights ? "session_insights" : "analytics";
}

/** The consent-ledger purposes (identity consent_records) a cookie choice maps to. */
export function toLedgerChoices(categories: ConsentCategories): {
  analytics_cookies: boolean;
  session_insights: boolean;
  functional_cookies: boolean;
} {
  return {
    analytics_cookies: categories.analytics,
    session_insights: categories.session_insights,
    functional_cookies: categories.functional,
  };
}

/** Categories as stored on a consent receipt (analytics_consent_logs.categories). */
export function toReceiptCategories(categories: ConsentCategories): Record<string, boolean> {
  return { essential: true, ...toLedgerChoices(categories) };
}

/** How a set of categories was chosen, for the receipt. */
export function inferConsentMethod(categories: ConsentCategories, opts: { viaGpcDefault?: boolean; previous?: ConsentCategories | null } = {}): ConsentMethod {
  if (opts.viaGpcDefault) return "browser_signal";
  const all = OPTIONAL_CONSENT_CATEGORIES.every((k) => categories[k]);
  const none = OPTIONAL_CONSENT_CATEGORIES.every((k) => !categories[k]);
  if (all) return "accept_all";
  if (none) {
    const hadAny = opts.previous ? OPTIONAL_CONSENT_CATEGORIES.some((k) => opts.previous?.[k]) : false;
    return hadAny ? "withdrawn" : "reject_all";
  }
  return "custom";
}

// ---------------------------------------------------------------------------
// Browser helpers (pure: callers pass document.cookie / location.protocol)
// ---------------------------------------------------------------------------

/** Read one cookie from a `document.cookie` string. */
export function readCookieValue(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** A `document.cookie` assignment string. */
export function buildCookieString(name: string, value: string, opts: { maxAgeSeconds: number; secure: boolean }): string {
  const parts = [`${name}=${value}`, "Path=/", `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`, "SameSite=Lax"];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
