import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Venkat Sai Global — Next.js configuration.
 *
 * Rendering model: Cache Components is intentionally DISABLED. Every route is
 * rendered dynamically (the root layout reads cookies), and data is read
 * straight from PostgreSQL through the domain modules in `src/modules`.
 * Do not add `"use cache"` directives — see docs/CONVENTIONS.md.
 *
 * Content-Security-Policy (nonce based) is applied per request in src/proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN (not DENY) so the admin heatmap viewer can frame public pages.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()",
  },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const s3PublicHost = process.env.STORAGE_PUBLIC_HOST;

const nextConfig: NextConfig = {
  // Local end-to-end runs start several dev servers side by side, each with its own build folder.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Dev server only: those servers are reached at http://127.0.0.1:<port>. Next.js blocks its dev resources
  // (/_next/hmr) for origins other than localhost, and without that socket the client never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  reactStrictMode: true,
  // Native / Node-only packages must not be bundled. sanitize-html is deliberately bundled: it is
  // CommonJS but depends on the ESM-only htmlparser2 12, which the Vercel runtime refuses to require().
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg", "nodemailer", "qrcode"],
  experimental: {
    // Enables forbidden() / unauthorized() from next/navigation.
    authInterrupts: true,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  images: {
    qualities: [60, 75, 90],
    remotePatterns: s3PublicHost ? [{ protocol: "https", hostname: s3PublicHost }] : [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
