import "server-only";

import { headers } from "next/headers";

import { hashIp } from "./crypto";

export type RequestMeta = {
  ip: string | null;
  ipHash: string | null;
  userAgent: string | null;
  /** Coarse country from the hosting edge (Vercel / Cloudflare headers), if present. */
  country: string | null;
  requestId: string | null;
  origin: string | null;
  host: string | null;
};

function firstIp(value: string | null): string | null {
  if (!value) return null;
  const ip = value.split(",")[0]?.trim();
  return ip || null;
}

/** Request metadata for audit/security logging. Only call inside a request scope. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = firstIp(h.get("x-forwarded-for")) ?? h.get("x-real-ip") ?? h.get("cf-connecting-ip");
  const ua = h.get("user-agent");
  return {
    ip,
    ipHash: hashIp(ip),
    userAgent: ua ? ua.slice(0, 400) : null,
    country: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null,
    requestId: h.get("x-request-id") ?? h.get("x-vercel-id") ?? null,
    origin: h.get("origin"),
    host: h.get("x-forwarded-host") ?? h.get("host"),
  };
}

/**
 * CSRF guard for Route Handlers that mutate state (Server Actions are protected by Next.js).
 * Accepts same-origin requests only.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Coarse device / browser / OS classification from a user agent (no fingerprinting). */
export function classifyUserAgent(ua: string | null | undefined): {
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  browser: string;
  os: string;
} {
  if (!ua) return { deviceType: "unknown", browser: "Unknown", os: "Unknown" };
  const s = ua.toLowerCase();
  const isBot = /bot|crawler|spider|crawling|headless|lighthouse|slurp|facebookexternalhit|preview/.test(s);
  const isTablet = /ipad|tablet|(android(?!.*mobile))/.test(s);
  const isMobile = !isTablet && /mobi|iphone|ipod|android.*mobile|windows phone/.test(s);
  const deviceType = isBot ? "bot" : isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  const browser = /edg\//.test(s)
    ? "Edge"
    : /opr\/|opera/.test(s)
      ? "Opera"
      : /samsungbrowser/.test(s)
        ? "Samsung Internet"
        : /chrome|crios/.test(s)
          ? "Chrome"
          : /firefox|fxios/.test(s)
            ? "Firefox"
            : /safari/.test(s)
              ? "Safari"
              : "Other";
  const os = /windows/.test(s)
    ? "Windows"
    : /android/.test(s)
      ? "Android"
      : /iphone|ipad|ipod|ios/.test(s)
        ? "iOS"
        : /mac os x|macintosh/.test(s)
          ? "macOS"
          : /linux/.test(s)
            ? "Linux"
            : "Other";
  return { deviceType, browser, os };
}
