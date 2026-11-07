import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (formerly middleware) — runs before every page request. Keep it fast: no database access,
 * no server-module imports.
 *
 *  1. Per-request nonce Content-Security-Policy (Next.js reads the nonce from the request CSP
 *     header and applies it to its own scripts; server components can read it from `x-nonce`
 *     to pass to <Script nonce>). Third-party scripts (Clarity, GA4/GTM, Razorpay, Stripe) must be
 *     loaded by a nonce-bearing script — 'strict-dynamic' trusts what those load.
 *  2. Forwards `x-nonce`, `x-vsg-pathname` (path + query, used by requireUser() for returnTo) and
 *     `x-request-id` (log correlation) to the app.
 *  3. Coarse auth redirect: portal and account pages without a session cookie go straight to
 *     /sign-in?returnTo=… . This is only a UX shortcut — every page, action and route handler still
 *     authorises the request itself.
 */

/** Must match SESSION_COOKIE in src/modules/identity/session.ts (duplicated: proxy cannot import server modules). */
const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vsg_session" : "vsg_session";

export const PROTECTED_PREFIXES = ["/talent", "/employer", "/recruiter", "/institution", "/admin", "/account"] as const;

/** True for a protected portal path ("/admin", "/admin/…"), false for look-alikes ("/administration"). */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Third-party origins allowed by the CSP (keep in sync with the integrations in use). */
const SCRIPT_HOSTS = ["https://www.clarity.ms", "https://scripts.clarity.ms", "https://www.googletagmanager.com", "https://checkout.razorpay.com", "https://js.stripe.com"];
const CONNECT_HOSTS = [
  "https://*.clarity.ms",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
  "https://api.stripe.com",
];
const FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://player.vimeo.com",
  // CMS map embeds (Google Maps embed URLs and OpenStreetMap export iframes).
  "https://www.google.com",
  "https://www.openstreetmap.org",
  "https://api.razorpay.com",
  "https://checkout.razorpay.com",
  "https://js.stripe.com",
  "https://hooks.stripe.com",
];
const FORM_ACTION_HOSTS = ["https://accounts.google.com", "https://checkout.stripe.com"];

/**
 * Build the Content-Security-Policy header value.
 * - script-src: nonce + 'strict-dynamic' (CSP3 browsers ignore the host list and 'self'; CSP2
 *   browsers fall back to them). Development adds 'unsafe-eval' (React dev tooling needs eval).
 * - style-src allows inline styles (Next.js / Radix inject them); no nonce there on purpose —
 *   a nonce would make browsers ignore 'unsafe-inline'.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDev,
  upgradeInsecureRequests = !isDev,
}: {
  nonce: string;
  isDev: boolean;
  /** Production default; off for localhost so `next start` over plain http keeps working. */
  upgradeInsecureRequests?: boolean;
}): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : []), ...SCRIPT_HOSTS]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...CONNECT_HOSTS, ...(isDev ? ["ws:", "wss:"] : [])]],
    ["frame-src", ["'self'", ...FRAME_HOSTS]],
    ["frame-ancestors", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", ...FORM_ACTION_HOSTS]],
    ["object-src", ["'none'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (upgradeInsecureRequests) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

/** Reuse a well-formed upstream request id (load balancer / Vercel), otherwise mint one. */
export function resolveRequestId(incoming: string | null): string {
  return incoming && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
}

/** Path + query for returnTo, without Next.js internal parameters. */
export function pathForReturn(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete("_rsc");
  const query = params.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const pathname = request.nextUrl.pathname;
  const returnPath = pathForReturn(request.nextUrl);

  const method = request.method.toUpperCase();
  if ((method === "GET" || method === "HEAD") && isProtectedPath(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const signIn = new URL("/sign-in", request.nextUrl.origin);
    signIn.searchParams.set("returnTo", returnPath);
    const redirect = NextResponse.redirect(signIn, 307);
    redirect.headers.set("X-Request-Id", requestId);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }

  const nonce = createNonce();
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildContentSecurityPolicy({ nonce, isDev, upgradeInsecureRequests: !isDev && !isLocalHost(request.nextUrl.hostname) });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-vsg-pathname", returnPath);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Request-Id", requestId);
  refreshSessionCookie(request, response);
  return response;
}

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sliding session cookie: the database session slides (src/modules/identity/session.ts) but the cookie's
 * expiry was fixed at sign-in. Re-issue the same token with a fresh Max-Age on real page navigations
 * (not prefetches, assets or API calls). The database stays authoritative: an expired or revoked
 * session is rejected server-side regardless of the cookie's lifetime (staff sessions still end after 12h).
 */
export function refreshSessionCookie(request: NextRequest, response: NextResponse): void {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || request.method.toUpperCase() !== "GET") return;
  const isDocument = request.headers.get("sec-fetch-dest") === "document" || (request.headers.get("accept") ?? "").includes("text/html");
  const isPrefetch =
    request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch" || request.headers.get("sec-purpose")?.includes("prefetch");
  if (!isDocument || isPrefetch) return;
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export const config = {
  matcher: [
    /*
     * Every path except: /api/* and /media/* (route handlers set their own headers), Next.js
     * internals (_next/static, _next/image), the favicon and static files served from /public.
     */
    "/((?!(?:api|media)(?:/|$)|_next/static|_next/image|favicon\\.ico$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|otf|map)$).*)",
  ],
};
