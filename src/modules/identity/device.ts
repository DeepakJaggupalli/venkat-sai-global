import "server-only";

import { createHash } from "node:crypto";

import { hmacToken } from "@/lib/crypto";
import { classifyUserAgent } from "@/lib/request";

/**
 * Coarse device recognition for new-sign-in alerts. The user agent is normalised (version
 * numbers removed, so a browser update is not a "new device") and keyed-hashed; no raw user
 * agent is stored in security event metadata.
 */
export function deviceFingerprint(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const normalized = userAgent.toLowerCase().replace(/\d+/g, "0").replace(/\s+/g, " ").trim();
  return hmacToken(normalized, "device").slice(0, 32);
}

export type DeviceDescription = ReturnType<typeof classifyUserAgent> & { label: string };

/** "Chrome on Windows" — used in alerts and the sessions list. */
export function describeDevice(userAgent: string | null | undefined): DeviceDescription {
  const info = classifyUserAgent(userAgent);
  const label = info.browser === "Unknown" && info.os === "Unknown" ? "Unknown device" : `${info.browser} on ${info.os}`;
  return { ...info, label };
}

/** Public, non-reversible id for a session (the session id itself never leaves the server). */
export function publicSessionId(sessionId: string): string {
  return createHash("sha256").update(`session-public:${sessionId}`).digest("hex").slice(0, 24);
}
