/**
 * Notification template rendering (pure, client-safe — used by the dispatcher, the admin preview and tests).
 *
 * Template syntax (subjects and bodies, code defaults and admin overrides alike):
 *   {{key}}                 value from `data` (escaped in HTML; ISO timestamps are formatted in the
 *                           recipient's time zone, YYYY-MM-DD dates as calendar dates, arrays joined)
 *   {{#key}} … {{/key}}     rendered only when `key` has a value (non-empty string, number, true, non-empty array)
 *   {{^key}} … {{/key}}     rendered only when `key` has no value
 * Body text is Markdown-lite: blank line = new paragraph, line break = <br>, `**bold**`,
 * lines starting with "- " = bullet list, `[label](url)` = link (http(s), mailto or an app path such as
 * `/talent/applications`, which is made absolute). Template text and values are HTML-escaped; values are
 * inserted after the Markdown pass, so they can never inject markup or links.
 */
import { formatDate, formatDateTime } from "@/lib/format";

export type TemplateValues = Record<string, unknown>;

export type RenderContext = {
  /** IANA time zone used for ISO timestamps (recipient's zone or the platform default). */
  timeZone: string;
  /** Recipient locale ("en", "hi", "te", …). */
  locale: string;
  /** Absolute base URL used to make `[label](/path)` links absolute (no trailing slash). */
  appUrl: string;
};

export type RenderedContent = {
  /** Single-line plain text (email subject / in-app title). */
  subject: string;
  /** Plain-text body (in-app body, text email part, SMS). */
  text: string;
  /** HTML body fragment (paragraphs / lists / links) for the email layout. */
  html: string;
};

const KEY = "[A-Za-z0-9_]+";
const PLACEHOLDER = new RegExp(`\\{\\{\\s*(${KEY})\\s*\\}\\}`, "g");
const SECTION = new RegExp(`\\{\\{([#^])\\s*(${KEY})\\s*\\}\\}([\\s\\S]*?)\\{\\{\\/\\s*\\2\\s*\\}\\}`);
const SECTION_TAG = new RegExp(`\\{\\{[#^/]\\s*(${KEY})\\s*\\}\\}`, "g");
const SLOT = /\u0000(\d+)\u0000/g;
const SINGLE_SLOT = /^\u0000(\d+)\u0000$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SUBJECT = 200;

const INTL_LOCALE: Record<string, string> = { en: "en-IN", hi: "hi-IN", te: "te-IN" };

export function intlLocale(locale: string): string {
  return INTL_LOCALE[locale] ?? (locale || "en-IN");
}

/** True when a value should count as "present" for sections. 0 is present ("0 credits left"). */
export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(isPresent);
  return typeof value === "boolean" || value instanceof Date;
}

/** Display string for a template value. Objects (other than dates) are never dumped into messages. */
export function formatTemplateValue(value: unknown, ctx: Pick<RenderContext, "timeZone" | "locale">): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const v = value.trim();
    try {
      if (ISO_DATETIME.test(v)) return formatDateTime(v, { timeZone: ctx.timeZone, locale: intlLocale(ctx.locale) });
      if (ISO_DATE.test(v)) return formatDate(`${v}T00:00:00.000Z`, { timeZone: "UTC", locale: intlLocale(ctx.locale) });
    } catch {
      return v;
    }
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : formatDateTime(value, { timeZone: ctx.timeZone, locale: intlLocale(ctx.locale) });
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => formatTemplateValue(item, ctx))
      .filter((s) => s !== "")
      .join(", ");
  }
  return "";
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function unescapeHtml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** Resolve {{#key}}…{{/key}} / {{^key}}…{{/key}} sections (innermost-last; different keys may nest). */
export function resolveSections(template: string, values: TemplateValues): string {
  let out = template;
  for (let i = 0; i < 500; i++) {
    const match = SECTION.exec(out);
    if (!match) break;
    const [whole, kind, key, inner] = match;
    const present = isPresent(values[key!]);
    const keep = kind === "#" ? present : !present;
    out = out.slice(0, match.index) + (keep ? inner! : "") + out.slice(match.index + whole.length);
  }
  // Unbalanced section tags left behind by a broken template are dropped rather than shown to recipients.
  return out.replace(SECTION_TAG, "");
}

/** Every key a template refers to (placeholders and sections), for admin validation and previews. */
export function extractPlaceholders(template: string | null | undefined): string[] {
  if (!template) return [];
  const keys = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) keys.add(m[1]!);
  for (const m of template.matchAll(SECTION_TAG)) keys.add(m[1]!);
  return [...keys].sort();
}

type Tokenized = { text: string; slots: string[] };

/** Replace placeholders with sentinels so Markdown transforms never touch values. Empty values vanish. */
function tokenize(template: string, values: TemplateValues, ctx: RenderContext): Tokenized {
  const slots: string[] = [];
  const text = resolveSections(template.replace(/\u0000/g, ""), values).replace(PLACEHOLDER, (_m, key: string) => {
    const formatted = formatTemplateValue(values[key], ctx).replace(/\u0000/g, "");
    if (formatted === "") return "";
    slots.push(formatted);
    return `\u0000${slots.length - 1}\u0000`;
  });
  return { text: tidy(text), slots };
}

/** Clean up whitespace left by empty values / sections (template text only — values are still sentinels). */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Only http(s), mailto and in-app paths become links; app paths are made absolute. */
export function safeHref(raw: string, appUrl: string): string | null {
  const url = raw.trim();
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return `${appUrl.replace(/\/+$/, "")}${url}`;
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^mailto:[^\s]+$/i.test(url)) return url;
  return null;
}

function resolveLinkTarget(target: string, slots: string[], escaped: boolean): string {
  const slot = SINGLE_SLOT.exec(target);
  if (slot) return slots[Number(slot[1])] ?? "";
  return escaped ? unescapeHtml(target) : target;
}

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BOLD = /\*\*(?=\S)([^*\n]+?)\*\*/g;

const STYLE = {
  p: "margin:0 0 16px 0;",
  ul: "margin:0 0 16px 0;padding:0 0 0 20px;",
  li: "margin:0 0 6px 0;",
  a: "color:#0b7c78;text-decoration:underline;",
};

function inlineHtml(line: string, slots: string[], appUrl: string): string {
  let s = escapeHtml(line);
  s = s.replace(LINK, (_m, label: string, target: string) => {
    const href = safeHref(resolveLinkTarget(target, slots, true), appUrl);
    return href ? `<a href="${escapeHtml(href)}" style="${STYLE.a}">${label}</a>` : label;
  });
  s = s.replace(BOLD, "<strong>$1</strong>");
  return s;
}

function fillHtmlSlots(html: string, slots: string[]): string {
  return html.replace(SLOT, (_m, i: string) => escapeHtml(slots[Number(i)] ?? "").replace(/\r?\n/g, "<br>"));
}

function toHtml(tok: Tokenized, appUrl: string): string {
  if (!tok.text) return "";
  const blocks = tok.text.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) return "";
      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="${STYLE.li}">${inlineHtml(l.replace(/^[-*]\s+/, ""), tok.slots, appUrl)}</li>`).join("");
        return `<ul style="${STYLE.ul}">${items}</ul>`;
      }
      return `<p style="${STYLE.p}">${lines.map((l) => inlineHtml(l, tok.slots, appUrl)).join("<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
  return fillHtmlSlots(html, tok.slots);
}

function toText(tok: Tokenized, appUrl: string): string {
  let s = tok.text.replace(LINK, (_m, label: string, target: string) => {
    const href = safeHref(resolveLinkTarget(target, tok.slots, false), appUrl);
    return href ? `${label} (${href})` : label;
  });
  s = s.replace(BOLD, "$1");
  return s.replace(SLOT, (_m, i: string) => tok.slots[Number(i)] ?? "").trim();
}

/** Render a template string to plain text (Markdown-lite markers removed). */
export function renderPlainText(template: string, values: TemplateValues, ctx: RenderContext): string {
  return toText(tokenize(template, values, ctx), ctx.appUrl);
}

/** Render a single-line subject / title. */
export function renderSubject(template: string, values: TemplateValues, ctx: RenderContext): string {
  const text = renderPlainText(template, values, ctx).replace(/\s+/g, " ").trim();
  return text.length > MAX_SUBJECT ? `${text.slice(0, MAX_SUBJECT - 1).trimEnd()}…` : text;
}

/** Render a full template (subject + body as text and HTML). */
export function renderTemplate(template: { subject: string | null | undefined; body: string }, values: TemplateValues, ctx: RenderContext): RenderedContent {
  const tok = tokenize(template.body, values, ctx);
  return {
    subject: template.subject ? renderSubject(template.subject, values, ctx) : "",
    text: toText(tok, ctx.appUrl),
    html: toHtml(tok, ctx.appUrl),
  };
}

/** Truncate plain text for SMS / in-app bodies without cutting words in half when possible. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
