"use client";

import type { CSSProperties } from "react";

import { CONTACT, whatsappHref } from "@/config/contact";

/**
 * Shown only when the root layout itself fails, so it must stand alone: its own <html>/<body>, inline styles
 * (the global stylesheet and fonts are not loaded here), no other components. Plain words, Try again, a way
 * home, WhatsApp, and the reference code. Never the error message or a stack trace.
 */
export default function GlobalError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  const code = error.digest && /^[\w-]{1,64}$/.test(error.digest) ? error.digest : null;
  const message = `Hello Venkat Sai, the website is not working for me.${code ? ` Reference: ${code}` : ""}`;
  return (
    <html lang="en">
      <head>
        <title>Something went wrong | Venkat Sai Global</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </head>
      <body style={styles.body}>
        <main style={styles.main}>
          <p style={styles.brand}>Venkat Sai Global</p>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.text}>The website hit a problem on our side. Nothing you saved is lost. Please try again in a moment.</p>
          <div style={styles.actions}>
            <button type="button" onClick={() => (retry ?? reset)()} style={{ ...styles.pill, ...styles.primary }}>
              Try again
            </button>
            {/* A full page load on purpose: the app's router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ ...styles.pill, ...styles.secondary }}>
              Go to the homepage
            </a>
            <a href={whatsappHref(message)} target="_blank" rel="noopener noreferrer" style={{ ...styles.pill, ...styles.secondary }}>
              WhatsApp us ({CONTACT.whatsapp.display})
            </a>
          </div>
          {code ? (
            <p style={styles.ref}>
              Reference code: <span style={styles.code}>{code}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}

const styles: Record<string, CSSProperties> = {
  body: {
    margin: 0,
    background: "#ffffff",
    color: "#0a0a0b",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    WebkitTextSizeAdjust: "100%",
  },
  main: {
    boxSizing: "border-box",
    minHeight: "100dvh",
    maxWidth: 560,
    margin: "0 auto",
    padding: "48px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  brand: { margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0369a1" },
  title: { margin: "16px 0 0", fontSize: 34, lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em" },
  text: { margin: "14px 0 0", fontSize: 16, lineHeight: 1.6, color: "#5b6170" },
  actions: { marginTop: 28, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", width: "100%" },
  pill: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    padding: "0 22px",
    borderRadius: 9999,
    fontFamily: "inherit",
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
  },
  primary: { background: "#0a0a0b", color: "#ffffff", border: "1px solid #0a0a0b" },
  secondary: { background: "#ffffff", color: "#0a0a0b", border: "1px solid #e9ebef" },
  ref: { marginTop: 24, fontSize: 12, color: "#5b6170" },
  code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", background: "#f7f8fa", padding: "2px 6px", borderRadius: 6, color: "#0a0a0b" },
};
