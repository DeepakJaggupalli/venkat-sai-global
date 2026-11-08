/**
 * Standalone SVG markup for the logo, for places React cannot render it: e-mail templates,
 * generated Open Graph images (ImageResponse), PWA icons or downloadable brand assets.
 * Pure function, client-safe. Output is fixed brand artwork (no user input is interpolated).
 */
import { BRAND } from "@/config/site";

import { LOCKUP_WIDTH, logoPalette, MARK, MARK_SIZE, TILE, WORDMARK, type LogoVariant } from "./logo-geometry";

export type LogoSvgOptions = {
  variant?: LogoVariant;
  layout?: "full" | "mark";
  /** Rendered height in px (width follows the aspect ratio). Default 48. */
  height?: number;
  /** Font stack for the wordmark when the SVG is used outside the app (Figtree is not guaranteed there). */
  fontFamily?: string;
};

const DEFAULT_FONT_STACK = "Figtree, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function markMarkup(variant: LogoVariant): string {
  const p = logoPalette(variant);
  const t = TILE[variant];
  const tileStroke = t.stroke ? ` stroke="${t.stroke}" stroke-opacity="${t.strokeOpacity}"` : "";
  const arcs = MARK.arcPaths.map((d) => `<path d="${d}" stroke="${p.arc}" stroke-width="${MARK.arcWidth}"/>`).join("");
  return (
    `<rect x="${t.x}" y="${t.y}" width="${t.size}" height="${t.size}" rx="${t.rx}" fill="${t.fill}" fill-opacity="${t.fillOpacity}"${tileStroke}/>` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${arcs}` +
    `<path d="${MARK.pathD}" stroke="${p.path}" stroke-width="${MARK.pathWidth}"/></g>` +
    `<circle cx="${MARK.spark.cx}" cy="${MARK.spark.cy}" r="${MARK.spark.r}" fill="${p.spark}"/>`
  );
}

function wordmarkMarkup(variant: LogoVariant, offsetX: number, fontFamily: string): string {
  const p = logoPalette(variant);
  const font = fontFamily.replace(/"/g, "'");
  const secondaryX = offsetX + WORDMARK.primary.length + WORDMARK.wordGap;
  return (
    `<g font-family="${font}" font-size="${WORDMARK.fontSize}">` +
    `<text x="${offsetX}" y="${WORDMARK.baseline}" fill="${p.primaryText}" font-weight="${WORDMARK.primary.weight}" textLength="${WORDMARK.primary.length}" lengthAdjust="spacing">${WORDMARK.primary.text}</text>` +
    `<text x="${secondaryX}" y="${WORDMARK.baseline}" fill="${p.secondaryText}" font-weight="${WORDMARK.secondary.weight}" textLength="${WORDMARK.secondary.length}" lengthAdjust="spacing">${WORDMARK.secondary.text}</text>` +
    `</g>`
  );
}

/** Complete `<svg>` document for the logo. */
export function getLogoSvg(options: LogoSvgOptions = {}): string {
  const { variant = "onLight", layout = "full", height = 48, fontFamily = DEFAULT_FONT_STACK } = options;
  const width = layout === "mark" ? MARK_SIZE : LOCKUP_WIDTH;
  const renderedWidth = Math.round((width / MARK_SIZE) * height * 100) / 100;
  const body =
    layout === "mark" ? markMarkup(variant) : markMarkup(variant) + wordmarkMarkup(variant, MARK_SIZE + WORDMARK.markGap, fontFamily);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${renderedWidth}" height="${height}" viewBox="0 0 ${width} ${MARK_SIZE}" role="img" aria-label="${BRAND.name}">` +
    `<title>${BRAND.name}</title>${body}</svg>`
  );
}

/** `data:` URI of the logo, e.g. for `<img src>` in e-mails that accept inline SVG. */
export function getLogoDataUri(options: LogoSvgOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getLogoSvg(options))}`;
}
