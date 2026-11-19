/**
 * Share text for requirement posters (client-safe: used by the "Share to WhatsApp" button and the poster service).
 */

/** "Welder - Saudi Arabia: Welder, Fitter" + "\nApply: <url>" (WhatsApp keeps the line break). */
export function buildShareText({ title, details, url }: { title: string; details?: string | null; url: string }): string {
  const name = title.trim();
  const extra = details?.trim();
  return `${extra ? `${name} - ${extra}` : name}\nApply: ${url}`;
}

/** Short details for a poster: the country and up to three trades. */
export function posterShareDetails(countryName: string | null | undefined, trades: readonly string[] = []): string {
  const list = trades.map((t) => t.trim()).filter(Boolean);
  const shown = list.slice(0, 3).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
  return [countryName?.trim(), shown].filter(Boolean).join(": ");
}

/** wa.me without a number: WhatsApp asks which chat, group or channel to send the text to. */
export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
