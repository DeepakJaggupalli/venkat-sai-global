/**
 * Pure text helpers for the public content pages (client-safe, no server imports).
 *
 * CMS rich text is sanitised on write (`sanitizeRichText`): headings arrive as bare `<h2>` / `<h3>`
 * tags without attributes, which is what `withHeadingAnchors` relies on.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Decode the handful of entities the sanitiser emits (and numeric ones). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower]!;
    if (lower.startsWith("#x")) {
      const n = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    if (lower.startsWith("#")) {
      const n = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return match;
  });
}

/** Plain text of an HTML fragment (tags removed, entities decoded, whitespace collapsed). */
export function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<(br|\/p|\/li|\/h[1-6]|\/blockquote|\/tr)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Number of words in one or more HTML fragments. */
export function wordCount(...fragments: (string | null | undefined)[]): number {
  let total = 0;
  for (const fragment of fragments) {
    const text = plainText(fragment);
    if (text) total += text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  }
  return total;
}

/** Estimated reading time in whole minutes (200 words a minute, at least one minute). */
export function readingMinutes(...fragments: (string | null | undefined)[]): number {
  return Math.max(1, Math.ceil(wordCount(...fragments) / 200));
}

/** Short plain-text excerpt, cut on a word boundary. */
export function excerptText(html: string | null | undefined, maxLength = 180): string {
  const text = plainText(html);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type HeadingAnchor = { id: string; text: string; level: 2 | 3 };

/** URL-fragment id for a heading (ASCII letters, digits, hyphens), unique within `used`. */
export function headingId(text: string, used: Set<string>): string {
  const base =
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/**
 * Give every `<h2>` / `<h3>` in sanitised HTML an id and return the headings for a table of contents.
 * Headings that already carry attributes are left alone (the sanitiser never emits them).
 */
export function withHeadingAnchors(html: string | null | undefined): { html: string; headings: HeadingAnchor[] } {
  if (!html) return { html: "", headings: [] };
  const used = new Set<string>();
  const headings: HeadingAnchor[] = [];
  const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => {
    const text = plainText(inner);
    if (!text) return `<h${level}>${inner}</h${level}>`;
    const id = headingId(text, used);
    headings.push({ id, text, level: level === "2" ? 2 : 3 });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, headings };
}

export type SnippetPart = { text: string; match: boolean };

/** Split a search snippet with «matches» into parts (render matches in <mark>, never as HTML). */
export function splitSnippet(snippet: string | null | undefined): SnippetPart[] {
  if (!snippet) return [];
  const parts: SnippetPart[] = [];
  const re = /«([^»]*)»/g;
  let last = 0;
  for (let m = re.exec(snippet); m; m = re.exec(snippet)) {
    if (m.index > last) parts.push({ text: snippet.slice(last, m.index), match: false });
    if (m[1]) parts.push({ text: m[1], match: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last).replace(/[«»]/g, ""), match: false });
  return parts;
}

/** Positive page number from a search param (defaults to 1; capped to keep offsets sane). */
export function pageParam(value: string | string[] | undefined, max = 500): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : 1;
}

/** One value from a whitelist, or undefined. */
export function pickParam<const T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** Calendar date ("YYYY-MM-DD") → Date at UTC midnight, or null. */
export function calendarDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO date-time → Date, or null. */
export function isoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A valid IANA time zone or the fallback. */
export function safeTimeZone(value: string | null | undefined, fallback: string): string {
  const zone = value?.trim();
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

/** Normalise a free-text query: trimmed, single spaces, at most `max` characters. */
export function normaliseQuery(value: string | string[] | undefined, max = 100): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** tel: href for a phone number as typed in the CMS (keeps a leading +, digits only otherwise). */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
}

/** wa.me link for a WhatsApp number (digits only, country code included). */
export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
