/**
 * Privacy rules applied to everything the analytics pipeline records (client-safe and pure, used by the
 * browser tracker AND re-applied by the collector, which never trusts the browser):
 *  - paths without query strings, with personal identifiers and secrets in dynamic segments replaced
 *    by placeholders (/invite/[token], /talent/applications/[id]);
 *  - only whitelisted, non-personal query parameters (page, type, category… and utm_*);
 *  - element selectors built from tag names, safe ids and data-analytics attributes — never text,
 *    attribute values or ids that look personal;
 *  - event properties without personal keys or values (emails, phone numbers, free text).
 */

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Never tracked by the first-party tracker (staff tools, development pages, API routes). */
export const EXCLUDED_PATH_PREFIXES = ["/admin", "/dev", "/api", "/_next"] as const;

/** Signed-in areas: session-insight tools (Clarity) are masked completely here. */
export const PRIVATE_AREA_PREFIXES = ["/talent", "/employer", "/recruiter", "/institution", "/admin", "/account", "/notifications"] as const;

function hasPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isTrackablePath(path: string): boolean {
  return !hasPrefix(path, EXCLUDED_PATH_PREFIXES);
}

export function isPrivateAreaPath(path: string): boolean {
  return hasPrefix(path, PRIVATE_AREA_PREFIXES);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Human reference codes (VSG-APP-000123, VSG-ASM-2026-000012) identify individual records. */
const HUMAN_CODE_RE = /^([A-Z]{2,5}-)?[A-Z]{2,5}(-\d{4})?-\d{3,}$/i;
const HEX_TOKEN_RE = /^[0-9a-f]{24,}$/i;
const TOKEN_CHARS_RE = /^[A-Za-z0-9_.~-]+$/;

/** The segment after one of these is always a secret or lookup token. */
const TOKEN_AFTER: Record<string, string> = {
  invite: "[token]",
  "reset-password": "[token]",
  unsubscribe: "[token]",
  "verify-certificate": "[code]",
  verify: "[token]",
};

/** Only phone characters and at least 9 digits (dates such as 2026-11-07 have 8). */
function looksLikePhone(value: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(value)) return false;
  return value.replace(/\D/g, "").length >= 9;
}

function looksLikeToken(value: string): boolean {
  if (value.length < 20 || !TOKEN_CHARS_RE.test(value)) return false;
  if (HEX_TOKEN_RE.test(value)) return true;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /\d/.test(value);
  if (hasUpper && hasLower && hasDigit) return true;
  if (value.includes(".") && value.length >= 24) return true;
  // Long run without word separators mixing letters and digits (slugs use hyphens between words).
  return !/[-_]/.test(value) && hasDigit && /[a-z]/i.test(value);
}

/** Placeholder for a segment that must not be stored, or null when the segment is safe. */
export function sensitiveSegmentPlaceholder(segment: string): string | null {
  if (UUID_RE.test(segment)) return "[id]";
  if (segment.includes("@")) return "[redacted]";
  if (looksLikePhone(segment)) return "[redacted]";
  if (/^\d{6,}$/.test(segment)) return "[n]";
  if (HUMAN_CODE_RE.test(segment)) return "[code]";
  if (looksLikeToken(segment)) return "[token]";
  return null;
}

const MAX_PATH_LENGTH = 1024;

/**
 * Normalise a URL or path for storage: path only (no origin, query or fragment), collapsed slashes,
 * no trailing slash, personal identifiers and secrets replaced with placeholders, percent-encoded,
 * at most 1024 characters. Returns null when nothing usable remains.
 *
 *   normalizeAnalyticsPath("https://x.test/invite/abc.def?x=1") → "/invite/[token]"
 *   normalizeAnalyticsPath("/talent/applications/0b9e…-…")      → "/talent/applications/[id]"
 */
export function normalizeAnalyticsPath(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  if (!value.startsWith("/")) value = `/${value}`;

  const raw = value.split("/").filter((s) => s !== "");
  const out: string[] = [];
  // Placeholders forced onto the next segments by the route context (e.g. /invite/<token>).
  const forced: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const next = forced.shift();
    if (next) {
      out.push(next);
      continue;
    }
    let segment: string;
    try {
      segment = decodeURIComponent(raw[i]!);
    } catch {
      segment = raw[i]!;
    }
    const placeholder = sensitiveSegmentPlaceholder(segment);
    out.push(placeholder ?? encodeURIComponent(segment).replace(/%2C/gi, ",").replace(/%3A/gi, ":"));
    const lower = segment.toLowerCase();
    if (TOKEN_AFTER[lower]) forced.push(TOKEN_AFTER[lower]!);
    // Public file route /media/<file id>/<file name>: file names can contain personal names.
    if (lower === "media" && i === 0) forced.push("[id]", "[name]");
  }

  let path = `/${out.join("/")}`;
  if (path.length > MAX_PATH_LENGTH) {
    while (out.length > 0 && `/${out.join("/")}`.length > MAX_PATH_LENGTH) out.pop();
    path = `/${out.join("/")}`;
  }
  return path;
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/**
 * Non-personal query parameters kept on page views (listing filters, pagination, sign-up intent).
 * Everything else — search keywords, tokens, e-mail links — is dropped.
 */
export const QUERY_PARAM_WHITELIST = [
  "page",
  "type",
  "category",
  "country",
  "industry",
  "overseas",
  "mode",
  "experience",
  "sort",
  "tab",
  "view",
  "intent",
  "lang",
  "status",
] as const;
export type WhitelistedQueryParam = (typeof QUERY_PARAM_WHITELIST)[number];

const WHITELIST_SET: ReadonlySet<string> = new Set(QUERY_PARAM_WHITELIST);
const SAFE_PARAM_VALUE_RE = /^[A-Za-z0-9_.,:-]{1,64}$/;

function toSearchParams(search: string | URLSearchParams | null | undefined): URLSearchParams {
  if (!search) return new URLSearchParams();
  if (typeof search !== "string") return search;
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/** Whitelisted query parameters with safe values (first value only). Never returns other keys. */
export function pickAllowedQueryParams(search: string | URLSearchParams | null | undefined): Partial<Record<WhitelistedQueryParam, string>> {
  const params = toSearchParams(search);
  const out: Partial<Record<WhitelistedQueryParam, string>> = {};
  const seen = new Set<string>();
  for (const [key, value] of params) {
    const k = key.toLowerCase();
    if (!WHITELIST_SET.has(k) || seen.has(k)) continue;
    seen.add(k);
    const v = value.trim();
    if (!SAFE_PARAM_VALUE_RE.test(v) || sensitiveSegmentPlaceholder(v)) continue;
    out[k as WhitelistedQueryParam] = v;
  }
  return out;
}

export type UtmParams = { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/** Lower-case a UTM / campaign label; null when empty, too long or containing an e-mail address. */
export function normalizeUtmValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v || v.length > 200 || v.includes("@") || looksLikePhone(v)) return null;
  return v;
}

/** utm_* parameters (normalised). Null when none are present. */
export function extractUtm(search: string | URLSearchParams | null | undefined): UtmParams | null {
  const params = toSearchParams(search);
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = normalizeUtmValue(params.get(`utm_${key}`));
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** Host of the referring page (lower-case), or null for same-site, invalid or non-http referrers. */
export function referrerDomainFrom(referrer: string | null | undefined, currentHost?: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (currentHost && host === currentHost.toLowerCase().replace(/:\d+$/, "")) return null;
    return /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function isValidReferrerDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9.-]{1,253}$/.test(value);
}

// ---------------------------------------------------------------------------
// Viewport, form and CTA ids
// ---------------------------------------------------------------------------

export type ViewportBucket = "mobile" | "tablet" | "desktop";

export function viewportBucket(width: number): ViewportBucket {
  if (!Number.isFinite(width) || width < 768) return "mobile";
  return width < 1024 ? "tablet" : "desktop";
}

const SAFE_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** A form id (data-analytics-form) or CTA id (data-analytics-cta): lower-case, short, no personal data. */
export function sanitizeAnalyticsKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!SAFE_KEY_RE.test(v) || sensitiveSegmentPlaceholder(v)) return null;
  return v;
}

// ---------------------------------------------------------------------------
// Element selectors (heatmaps)
// ---------------------------------------------------------------------------

/** The subset of DOM Element the selector builder needs (lets tests use plain objects). */
export type SelectorNode = {
  tagName: string;
  id?: string | null;
  getAttribute(name: string): string | null;
  parentElement: SelectorNode | null;
};

const SAFE_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/** An element id that is stable and not personal (no long digit runs, uuids or generated ids). */
export function isSafeElementId(id: string | null | undefined): id is string {
  if (!id || !SAFE_ID_RE.test(id)) return false;
  if (/\d{4,}/.test(id)) return false;
  if (/^(radix|headlessui|react|mui|r)[-_]/i.test(id)) return false;
  return sensitiveSegmentPlaceholder(id) === null;
}

/**
 * Sanitised element path for heatmaps, e.g. `main > section#hero > a[cta:hire_through_venkat_sai]`.
 * Uses tag names, safe ids and data-analytics-cta / data-analytics-id keys only — never text, classes,
 * other attribute values or ids that look personal. Stops at the first ancestor with a safe id.
 * Returns null inside `[data-analytics-ignore]`.
 */
export function buildSafeSelector(node: SelectorNode | null, maxDepth = 6): string | null {
  const parts: string[] = [];
  let current: SelectorNode | null = node;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (current.getAttribute("data-analytics-ignore") !== null) return null;
    const tag = current.tagName.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!tag || tag === "html" || tag === "body") break;
    let part = tag;
    const cta = sanitizeAnalyticsKey(current.getAttribute("data-analytics-cta"));
    const key = sanitizeAnalyticsKey(current.getAttribute("data-analytics-id"));
    const id = current.id ?? current.getAttribute("id");
    if (isSafeElementId(id)) part += `#${id}`;
    if (cta) part += `[cta:${cta}]`;
    else if (key) part += `[id:${key}]`;
    parts.unshift(part);
    if (isSafeElementId(id)) break;
    current = current.parentElement;
    depth += 1;
  }
  // Ancestors above maxDepth may still be ignored.
  let probe: SelectorNode | null = current;
  while (probe) {
    if (probe.getAttribute("data-analytics-ignore") !== null) return null;
    probe = probe.parentElement;
  }
  if (!parts.length) return null;
  const selector = parts.join(" > ");
  return selector.length <= 512 && !/['"=@]/.test(selector) ? selector : null;
}

const SELECTOR_PART_RE = /^([a-z][a-z0-9-]*)(#([A-Za-z][A-Za-z0-9_-]{0,39}))?(\[(cta|id):([a-z0-9][a-z0-9_-]{0,63})\])?$/;

/**
 * Re-validate a selector received from the browser: every part must have the shape produced by
 * buildSafeSelector and every id must pass isSafeElementId. Returns null otherwise.
 */
export function sanitizeSelectorString(selector: string | null | undefined): string | null {
  if (typeof selector !== "string") return null;
  const value = selector.trim();
  if (!value || value.length > 512 || /['"=@]/.test(value)) return null;
  const parts = value.split(" > ");
  if (parts.length > 12) return null;
  for (const part of parts) {
    const match = SELECTOR_PART_RE.exec(part);
    if (!match) return null;
    if (match[3] && !isSafeElementId(match[3])) return null;
    if (match[6] && sensitiveSegmentPlaceholder(match[6])) return null;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Event properties
// ---------------------------------------------------------------------------

export type SafeEventProps = Record<string, string | number | boolean | null>;

const PROP_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
/** Keys that hold personal data or free text; dropped whatever their value. */
const BLOCKED_PROP_KEY_RE =
  /^(e_?mail|email_?address|phone|phone_?number|mobile|whatsapp|name|first_?name|last_?name|full_?name|display_?name|user_?name|username|password|passcode|pass|secret|token|otp|code|pin|address|street|postcode|zip|dob|date_?of_?birth|birth_?date|age|gender|passport|passport_?number|aadhaar|aadhar|pan|ssn|national_?id|ip|ip_?address|user_?agent|q|query|search|search_?term|keyword|keywords|text|message|comment|comments|note|notes|body|value|input|answer|cover_?letter|resume|cv|userid|user_?id|candidate_?id|visitor_?id|session_?id)$/i;

const MAX_PROPS = 20;
const MAX_PROP_STRING = 200;
const MAX_PROPS_BYTES = 3000;

function safePropString(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (UUID_RE.test(v)) return v.toLowerCase();
  if (v.length > MAX_PROP_STRING) return null;
  if (v.includes("@")) return null;
  if (looksLikePhone(v)) return null;
  if (/[\r\n\t]/.test(v)) return null;
  return v;
}

/**
 * Keep only flat, non-personal properties: at most 20 keys matching [A-Za-z][A-Za-z0-9_]{0,39}, values
 * that are booleans, finite numbers, null or short strings without e-mail addresses / phone numbers.
 */
export function sanitizeEventProps(props: unknown): SafeEventProps {
  const out: SafeEventProps = {};
  if (!props || typeof props !== "object" || Array.isArray(props)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (count >= MAX_PROPS) break;
    if (!PROP_KEY_RE.test(key) || BLOCKED_PROP_KEY_RE.test(key)) continue;
    if (value === undefined) continue;
    if (value === null || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      out[key] = value;
    } else if (typeof value === "string") {
      const s = safePropString(value);
      if (s === null) continue;
      out[key] = s;
    } else {
      continue;
    }
    count += 1;
  }
  // Stay well inside the 4 KB CHECK on analytics_events.props (bytes, not characters).
  const encoder = new TextEncoder();
  const keys = Object.keys(out);
  while (keys.length && encoder.encode(JSON.stringify(out)).length > MAX_PROPS_BYTES) delete out[keys.pop()!];
  return out;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * Server-side event time from client timestamps, corrected for clock skew: now − (sentAt − ts),
 * clamped to [now − 24h, now].
 */
export function resolveOccurredAt(ts: number | undefined, sentAt: number | undefined, now: Date = new Date()): Date {
  const nowMs = now.getTime();
  if (typeof ts !== "number" || typeof sentAt !== "number" || !Number.isFinite(ts) || !Number.isFinite(sentAt)) return new Date(nowMs);
  const age = Math.max(0, sentAt - ts);
  const clamped = Math.min(age, 24 * 60 * 60 * 1000);
  return new Date(nowMs - clamped);
}
