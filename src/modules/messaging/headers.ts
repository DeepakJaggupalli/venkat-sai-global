/**
 * Extra email headers (e.g. List-Unsubscribe) are sanitised by every transport before sending, so a value can
 * never inject further headers or override the ones the transport sets itself.
 */

const HEADER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,75}$/;
const MAX_HEADER_VALUE_LENGTH = 2000;
const MAX_HEADERS = 20;

/** Set by the transport from the message itself; callers may not supply or override them. */
const RESERVED_HEADERS: ReadonlySet<string> = new Set([
  "bcc",
  "cc",
  "content-transfer-encoding",
  "content-type",
  "date",
  "from",
  "message-id",
  "mime-version",
  "reply-to",
  "return-path",
  "sender",
  "subject",
  "to",
]);

/**
 * Keep well-formed, non-reserved headers; CR / LF (and other control characters) in values become spaces.
 * Returns undefined when nothing is left.
 */
export function sanitizeEmailHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [name, raw] of Object.entries(headers)) {
    if (count >= MAX_HEADERS) break;
    if (!HEADER_NAME_RE.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) continue;
    if (typeof raw !== "string") continue;
    const value = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_HEADER_VALUE_LENGTH);
    if (!value) continue;
    out[name] = value;
    count += 1;
  }
  return count ? out : undefined;
}
