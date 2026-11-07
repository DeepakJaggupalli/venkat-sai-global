import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Sanitise rich text (CMS bodies, job descriptions, company "about" text) on WRITE.
 * Allows a conservative set of formatting tags; strips scripts, styles, event handlers,
 * iframes (videos use the dedicated embed field), and non-http(s)/mailto/tel links.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
    "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "img", "figure", "figcaption", "span",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    span: ["class"],
  },
  allowedClasses: { span: ["highlight"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https", "http"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const external = /^https?:\/\//i.test(attribs.href ?? "");
      return {
        tagName,
        attribs: { ...attribs, ...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {}) },
      };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
  },
};

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, RICH_TEXT_OPTIONS).trim();
}

/** Strip ALL markup (plain-text excerpts, meta descriptions, notification bodies). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

/** Plain-text excerpt of rich text. */
export function excerpt(html: string | null | undefined, maxLength = 180): string {
  const text = stripHtml(html);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
