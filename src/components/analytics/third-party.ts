/**
 * Consent-gated loaders for optional third-party analytics. Only called by AnalyticsTrackerClient when the
 * feature flag is on, the id is configured and the visitor consented (GA4: analytics; Clarity: session
 * insights). Scripts carry the CSP nonce; 'strict-dynamic' in the CSP trusts what they load.
 *
 * GA4 runs in Consent Mode v2 with every storage type denied by default, advertising signals off and
 * page views sent manually with normalised paths (no query values, no page titles that could hold names).
 */
import { normalizeAnalyticsPath, pickAllowedQueryParams } from "@/modules/analytics/privacy-rules";

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: ClarityFn;
  }
}

const loaded = { ga4: null as string | null, clarity: null as string | null };

function injectScript(src: string, nonce: string | null, id: string): void {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  if (nonce) script.nonce = nonce;
  document.head.appendChild(script);
}

/** Expire cookies by name prefix on this host and its registrable parent domains. */
function expireCookiesWithPrefix(prefixes: string[]): void {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0]?.trim() ?? "")
    .filter((name) => prefixes.some((p) => name === p || name.startsWith(p)));
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; Domain=.${parts.slice(i).join(".")}`);
  for (const name of names) {
    for (const domain of domains) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domain}`;
  }
}

// ---------------------------------------------------------------------------
// Google Analytics 4
// ---------------------------------------------------------------------------

export function isGa4Loaded(): boolean {
  return loaded.ga4 !== null;
}

export function loadGa4(measurementId: string, nonce: string | null): void {
  if (loaded.ga4 === measurementId) {
    window.gtag?.("consent", "update", { analytics_storage: "granted" });
    return;
  }
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js expects the Arguments object itself on the data layer.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });
  window.gtag("set", "ads_data_redaction", true);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`, nonce, "vsg-ga4");
  loaded.ga4 = measurementId;
}

/** GA4 page view with the normalised path and whitelisted query parameters only. */
export function ga4PageView(pathname: string, search: string): void {
  if (!loaded.ga4 || !window.gtag) return;
  const path = normalizeAnalyticsPath(pathname);
  if (!path) return;
  const query = new URLSearchParams(pickAllowedQueryParams(search) as Record<string, string>).toString();
  const location = `${window.location.origin}${path}${query ? `?${query}` : ""}`;
  window.gtag("event", "page_view", { page_location: location, page_path: path, page_title: path });
}

/** Consent withdrawn: deny storage and delete GA cookies (gtag stops collecting under Consent Mode). */
export function revokeGa4(): void {
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  expireCookiesWithPrefix(["_ga", "_gid", "_gat"]);
}

// ---------------------------------------------------------------------------
// Microsoft Clarity
// ---------------------------------------------------------------------------

export function isClarityLoaded(): boolean {
  return loaded.clarity !== null;
}

export function loadClarity(projectId: string, nonce: string | null): void {
  if (loaded.clarity) return;
  if (!window.clarity) {
    // Same queue stub as Clarity's official snippet (calls are replayed once the tag loads).
    const stub: ClarityFn = function clarity() {
      // eslint-disable-next-line prefer-rest-params
      (stub.q = stub.q ?? []).push(arguments);
    };
    window.clarity = stub;
  }
  window.clarity("consent");
  injectScript(`https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`, nonce, "vsg-clarity");
  loaded.clarity = projectId;
}

/**
 * Mask everything for session insights on signed-in areas (portals, account) and on elements marked
 * data-analytics-ignore. Clarity honours the data-clarity-mask attribute.
 */
export function applyClarityMasking(maskWholePage: boolean): void {
  if (!loaded.clarity) return;
  if (maskWholePage) document.body.setAttribute("data-clarity-mask", "true");
  else document.body.removeAttribute("data-clarity-mask");
  for (const el of document.querySelectorAll("[data-analytics-ignore]")) el.setAttribute("data-clarity-mask", "true");
}

/** Consent withdrawn: tell Clarity, delete its cookies. Callers reload the page to unload the script. */
export function revokeClarity(): void {
  window.clarity?.("consent", false);
  expireCookiesWithPrefix(["_clck", "_clsk"]);
}
