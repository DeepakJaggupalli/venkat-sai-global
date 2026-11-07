/**
 * Browser-side consent store shared by the consent banner, the preferences form and the analytics tracker
 * (no React provider needed: state lives in the `vsg_consent` cookie, changes are broadcast with a window
 * event). Safe to import from client components only; every function is a no-op on the server.
 */
import {
  ANALYTICS_SESSION_COOKIE,
  buildCookieString,
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  generateRandomId,
  inferConsentMethod,
  parseConsentCookie,
  readCookieValue,
  serializeConsentCookie,
  type ConsentCategories,
  type ConsentMethod,
  type ConsentSource,
  type StoredConsent,
} from "@/modules/analytics/consent";

declare global {
  interface Navigator {
    /** Global Privacy Control (https://globalprivacycontrol.org). */
    globalPrivacyControl?: boolean;
  }
}

const CHANGE_EVENT = "vsg:consent-change";
const OPEN_EVENT = "vsg:open-cookie-preferences";

let configuredVersion: string | null = null;
let cachedRaw: string | null | undefined;
let cachedConsent: StoredConsent | null = null;

const isBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

function emitChange(): void {
  if (isBrowser()) window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Register the current consent version (done by the banner, the tracker and the preferences form). */
export function configureConsentVersion(version: string): void {
  if (version && version !== configuredVersion) {
    configuredVersion = version;
    emitChange();
  }
}

export function getConfiguredConsentVersion(): string | null {
  return configuredVersion;
}

/** The stored choice (memoised on the raw cookie string so React snapshots stay referentially stable). */
export function readStoredConsent(): StoredConsent | null {
  if (!isBrowser()) return null;
  let raw: string | null = null;
  try {
    raw = readCookieValue(document.cookie, CONSENT_COOKIE);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedConsent;
  cachedRaw = raw;
  cachedConsent = parseConsentCookie(raw);
  return cachedConsent;
}

export function hasGpcSignal(): boolean {
  return isBrowser() && navigator.globalPrivacyControl === true;
}

/** Subscribe to consent changes (this tab, plus re-checks when the tab regains focus). */
export function subscribeConsent(listener: () => void): () => void {
  if (!isBrowser()) return () => undefined;
  const onVisibility = () => {
    if (document.visibilityState === "visible") listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("focus", listener);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export type SaveConsentOptions = {
  method?: ConsentMethod;
  source?: ConsentSource;
  /** Overrides the configured version. */
  version?: string;
  locale?: string;
};

export type SaveConsentResult = { ok: true; consent: StoredConsent } | { ok: false; reason: "no_version" | "cookie_blocked" };

/**
 * Store a choice in the vsg_consent cookie (12 months), broadcast it, and send a receipt to
 * POST /api/v1/consent (best effort; the choice applies even if the receipt fails).
 */
export function saveConsent(categories: ConsentCategories, opts: SaveConsentOptions = {}): SaveConsentResult {
  if (!isBrowser()) return { ok: false, reason: "no_version" };
  const version = opts.version ?? configuredVersion;
  if (!version) return { ok: false, reason: "no_version" };
  const previous = readStoredConsent();
  const gpc = hasGpcSignal();
  const consent: StoredConsent = {
    version,
    categories: { functional: categories.functional, analytics: categories.analytics, session_insights: categories.session_insights },
    anonymousId: previous?.anonymousId ?? generateRandomId(),
    timestamp: new Date().toISOString(),
    ...(gpc ? { gpc: true } : {}),
  };
  const method = opts.method ?? inferConsentMethod(consent.categories, { previous: previous?.categories ?? null });
  try {
    document.cookie = buildCookieString(CONSENT_COOKIE, serializeConsentCookie(consent), {
      maxAgeSeconds: CONSENT_COOKIE_MAX_AGE_SECONDS,
      secure: window.location.protocol === "https:",
    });
  } catch {
    return { ok: false, reason: "cookie_blocked" };
  }
  const written = readStoredConsent();
  if (!written || written.timestamp !== consent.timestamp) return { ok: false, reason: "cookie_blocked" };
  if (!consent.categories.analytics) expireCookie(ANALYTICS_SESSION_COOKIE);
  emitChange();

  const body = JSON.stringify({
    version,
    categories: consent.categories,
    anonymousId: consent.anonymousId,
    method,
    source: opts.source ?? "cookie_banner",
    ...(opts.locale ? { locale: opts.locale } : {}),
    gpc,
  });
  try {
    void fetch("/api/v1/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // The receipt is best effort; the visitor's choice is already stored and applied.
  }
  return { ok: true, consent };
}

let gpcNoticePending = false;

/**
 * Record a Global Privacy Control signal as the visitor's choice (analytics and session insights off,
 * method browser_signal) and flag the short notice that tells them so.
 */
export function applyGpcDefault(opts: { version: string; locale?: string }): boolean {
  const result = saveConsent(
    { functional: false, analytics: false, session_insights: false },
    { method: "browser_signal", source: "cookie_banner", version: opts.version, locale: opts.locale },
  );
  if (result.ok) {
    gpcNoticePending = true;
    emitChange();
  }
  return result.ok;
}

/** A GPC default was recorded on this page and its notice has not been dismissed. */
export function isGpcNoticePending(): boolean {
  return gpcNoticePending;
}

export function dismissGpcNotice(): void {
  if (!gpcNoticePending) return;
  gpcNoticePending = false;
  emitChange();
}

/** Expire a first-party cookie on this host. */
export function expireCookie(name: string): void {
  if (!isBrowser()) return;
  try {
    document.cookie = buildCookieString(name, "", { maxAgeSeconds: 0, secure: window.location.protocol === "https:" });
  } catch {
    // ignore
  }
}

/** Ask the mounted consent banner to open the preferences dialog (e.g. from a footer "Cookie settings" button). */
export function openCookiePreferences(): void {
  if (isBrowser()) window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCookiePreferences(listener: () => void): () => void {
  if (!isBrowser()) return () => undefined;
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
