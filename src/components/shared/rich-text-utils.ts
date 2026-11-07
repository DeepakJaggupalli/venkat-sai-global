/**
 * Pure helpers for RichTextEditor (client-safe, unit-tested). The server still sanitises every write
 * with sanitizeRichText(); these only keep the editing experience predictable.
 */

const ALLOWED_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i;

/**
 * Normalise what an author typed into a safe link URL, or null when it is not acceptable:
 *  - http(s), mailto: and tel: URLs pass (validated);
 *  - "name@example.com" becomes mailto:, "example.com/jobs" becomes https://;
 *  - javascript:, data: and anything else are rejected.
 */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) {
    try {
      const url = new URL(value);
      if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return null;
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname.includes(".") && url.hostname !== "localhost") return null;
      return value;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !DOMAIN_LIKE.test(value)) return null; // other schemes
  if (EMAIL.test(value)) return `mailto:${value}`;
  if (DOMAIN_LIKE.test(value)) return `https://${value}`;
  return null;
}

/** Treat an empty editor document as an empty value (so `.optional()` schemas work). */
export function normalizeEditorHtml(html: string, isEmpty: boolean): string {
  if (isEmpty) return "";
  const trimmed = html.trim();
  return trimmed === "<p></p>" ? "" : trimmed;
}
