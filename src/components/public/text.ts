/** Plain text from sanitised CMS HTML (meta descriptions, teasers). Pure and client-safe. */
export function htmlToText(html: string | null | undefined, max = 220): string {
  if (!html) return "";
  const text = html
    .replace(/<\s*(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text;
}
