import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, config, isProtectedPath, pathForReturn, proxy, resolveRequestId } from "./proxy";

const directives = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("buildContentSecurityPolicy", () => {
  it("builds a strict nonce-based policy for production", () => {
    const d = directives(buildContentSecurityPolicy({ nonce: "abc123", isDev: false }));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(expect.arrayContaining(["'self'", "'nonce-abc123'", "'strict-dynamic'", "https://www.clarity.ms", "https://www.googletagmanager.com", "https://checkout.razorpay.com", "https://js.stripe.com"]));
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
    expect(d["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d["img-src"]).toEqual(["'self'", "data:", "blob:", "https:"]);
    expect(d["font-src"]).toEqual(["'self'", "data:"]);
    expect(d["connect-src"]).toEqual(
      expect.arrayContaining(["'self'", "https://*.clarity.ms", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"]),
    );
    expect(d["frame-src"]).toEqual(
      expect.arrayContaining(["'self'", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com", "https://api.razorpay.com", "https://checkout.razorpay.com"]),
    );
    expect(d["frame-ancestors"]).toEqual(["'self'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'", "https://accounts.google.com", "https://checkout.stripe.com"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["upgrade-insecure-requests"]).toEqual([]);
  });

  it("allows eval and websockets in development and skips upgrade-insecure-requests", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: true });
    const d = directives(csp);
    expect(d["script-src"]).toContain("'unsafe-eval'");
    expect(d["connect-src"]).toEqual(expect.arrayContaining(["ws:", "wss:"]));
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("can disable upgrade-insecure-requests for plain-http localhost", () => {
    expect(buildContentSecurityPolicy({ nonce: "n", isDev: false, upgradeInsecureRequests: false })).not.toContain("upgrade-insecure-requests");
  });
});

describe("helpers", () => {
  it("matches portal prefixes on segment boundaries only", () => {
    for (const p of ["/talent", "/talent/jobs", "/employer", "/employer/jobs/1", "/recruiter", "/institution/courses", "/admin", "/admin/settings", "/account/security"]) {
      expect(isProtectedPath(p)).toBe(true);
    }
    for (const p of ["/", "/employers", "/administration", "/talented", "/jobs", "/sign-in", "/accounting"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });

  it("keeps the query string but drops Next.js internal params from returnTo", () => {
    expect(pathForReturn(new URL("http://x/admin/jobs?status=open&_rsc=abc"))).toBe("/admin/jobs?status=open");
    expect(pathForReturn(new URL("http://x/talent"))).toBe("/talent");
  });

  it("reuses well-formed upstream request ids only", () => {
    expect(resolveRequestId("abcd-1234-efgh")).toBe("abcd-1234-efgh");
    expect(resolveRequestId("bad id with spaces")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("proxy", () => {
  it("redirects signed-out visitors of portal pages to sign-in with returnTo", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin/users?page=2"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("returnTo")).toBe("/admin/users?page=2");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("lets requests with a session cookie through with CSP and forwarded headers", () => {
    const res = proxy(new NextRequest("http://localhost:3000/talent/jobs?q=welder", { headers: { cookie: "vsg_session=token", "x-nonce": "spoofed" } }));
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    // Overridden request headers are passed to the app by Next.js as x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(res.headers.get("x-middleware-request-x-vsg-pathname")).toBe("/talent/jobs?q=welder");
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(res.headers.get("x-request-id"));
    expect(csp).not.toContain("upgrade-insecure-requests"); // localhost
  });

  it("does not redirect public pages or non-GET requests", () => {
    expect(proxy(new NextRequest("http://localhost:3000/jobs")).status).toBe(200);
    expect(proxy(new NextRequest("http://localhost:3000/admin", { method: "POST" })).status).toBe(200);
  });

  it("issues a fresh nonce per request", () => {
    const a = proxy(new NextRequest("http://localhost:3000/")).headers.get("content-security-policy");
    const b = proxy(new NextRequest("http://localhost:3000/")).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });

  it("adds upgrade-insecure-requests outside localhost", () => {
    const res = proxy(new NextRequest("https://venkatsai.example/"));
    expect(res.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
  });
});

describe("matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("runs on pages", () => {
    for (const url of ["/", "/jobs", "/admin", "/talent/profile", "/mediakit", "/api-docs"]) expect(matches(url)).toBe(true);
  });

  it("skips API routes, public media, Next.js internals and static files", () => {
    for (const url of ["/api/v1/health", "/api", "/media/abc/logo.png", "/media", "/_next/static/chunks/main.js", "/_next/image?url=x", "/favicon.ico", "/globe.svg", "/robots.txt", "/sitemap.xml"]) {
      expect(matches(url)).toBe(false);
    }
  });
});
