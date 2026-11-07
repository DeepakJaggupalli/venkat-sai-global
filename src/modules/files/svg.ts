/**
 * SVG active-content detection (pure).
 *
 * SVG is only accepted for trusted purposes (CMS media uploaded by staff), and even then it is
 * rejected when it contains anything that could execute or load content: scripts, event handlers,
 * javascript:/data:text URLs, foreignObject/iframe/embed/object, DTDs/entities, external
 * references, CSS imports. SVGs are additionally served with a sandboxing CSP, so this check is
 * one of two independent layers.
 */

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => safeFromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n");
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

const ACTIVE_PATTERNS: RegExp[] = [
  /<\s*script[\s>/]/i,
  /<\s*foreignobject[\s>/]/i,
  /<\s*(iframe|embed|object|frame|frameset|applet|meta|link|base|form|input|button|textarea)[\s>/]/i,
  /<!\s*(doctype|entity|element|attlist)/i,
  /[\s/"']on[a-z]+\s*=/i,
  /(java|vb|live)script\s*:/i,
  /data\s*:\s*(text\/html|application\/(x?html|javascript|ecmascript)|image\/svg\+xml|text\/javascript)/i,
  /@import/i,
  /expression\s*\(/i,
  /-moz-binding/i,
  /behavior\s*:/i,
  // Any href / xlink:href / src that is not a same-document fragment (#id) or a raster data URI.
  // (Lookaheads sit directly after "=" / "(" so backtracking cannot skip a quote character.)
  /\b(?:xlink:)?href\s*=(?!\s*["']?\s*(?:#|data:image\/(?:png|jpe?g|gif|webp);))/i,
  /\ssrc\s*=(?!\s*["']?\s*data:image\/(?:png|jpe?g|gif|webp);)/i,
  // CSS url() that is not a fragment reference.
  /url\((?!\s*["']?\s*#)/i,
  // SMIL animation that rewrites links or event attributes.
  /<\s*(set|animate)[^>]*attributename\s*=\s*["']?\s*((xlink:)?href|on[a-z]+)/i,
];

/** True when the SVG markup contains script-capable or externally loading content. */
export function svgHasActiveContent(svg: string): boolean {
  // Remove comments first so payloads cannot hide in them only to be "uncommented" by tooling,
  // and check both the raw and entity-decoded forms.
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, " ");
  const candidates = [withoutComments, decodeEntities(withoutComments)];
  return candidates.some((text) => ACTIVE_PATTERNS.some((re) => re.test(text)));
}

/** Quick structural check that a text document is an SVG image. */
export function looksLikeSvg(text: string): boolean {
  const head = text.slice(0, 4096).replace(/^﻿/, "").trimStart();
  const withoutProlog = head.replace(/^<\?xml[^>]*\?>\s*/i, "").replace(/^(<!--[\s\S]*?-->\s*)+/g, "");
  return /^<svg[\s>]/i.test(withoutProlog) || /^<!doctype\s+svg/i.test(withoutProlog);
}
