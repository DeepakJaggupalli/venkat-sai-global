/**
 * Venkat Sai Global logo geometry and palette (client-safe, framework-free).
 *
 * The mark: a path that dips and rises (Discover → Learn → Qualify → Work → Grow) past a horizon
 * arc (global reach), ending in a gold spark — a nod to the welding heritage of Venkat Sai Welding
 * Works and Testing Center. The V of the path doubles as a single-V weld joint and the "V" of Venkat.
 * The arc is drawn in segments that stop short of the path, so it reads as passing *behind* the V
 * on any background without knockout strokes or SVG masks (no ids needed).
 *
 * Shared by the React components (logo.tsx) and the SVG string generator (logo-svg.ts) so the two
 * can never drift apart. All coordinates are in a 48 × 48 box.
 */

export type LogoVariant = "onLight" | "onDark";

export const BRAND_COLORS = {
  // 2026-11 rebrand: poster palette (navy, royal blue, golden yellow). Key names kept for compatibility.
  navy: "#0B1F5C",
  navyDeep: "#06123A",
  teal: "#1D3FA8",
  /** AA-compliant accent for text on white (royal blue). */
  tealStrong: "#1D3FA8",
  /** Accent for text/strokes on navy backgrounds. */
  tealLight: "#8FA9FF",
  gold: "#FFD000",
  white: "#FFFFFF",
} as const;

export const MARK_SIZE = 48;

export const MARK = {
  /** Horizon arc (circle r = 14.6 centred at 24, 28.5), split where the path crosses it. */
  arcPaths: ["M9.4 28.5A14.6 14.6 0 0 1 11.27 21.36", "M18.5 14.98A14.6 14.6 0 0 1 29.5 14.98", "M36.73 21.36A14.6 14.6 0 0 1 38.6 28.5"],
  arcWidth: 3.1,
  /** The path: down to the weld root, then up and out past the horizon. */
  pathD: "M13.6 15.6L24 36.4L36 12.4",
  pathWidth: 4,
  /** The spark caps the rising arm. */
  spark: { cx: 36.58, cy: 11.24, r: 3.2 },
} as const;

/** Tile behind the glyph: solid navy on light backgrounds, a quiet glass tile on dark ones. */
export const TILE = {
  onLight: { x: 0, y: 0, size: 48, rx: 12, fill: BRAND_COLORS.navy, fillOpacity: 1, stroke: null, strokeOpacity: 0 },
  onDark: {
    x: 0.5,
    y: 0.5,
    size: 47,
    rx: 11.5,
    fill: BRAND_COLORS.white,
    fillOpacity: 0.08,
    stroke: BRAND_COLORS.white,
    strokeOpacity: 0.18,
  },
} as const;

/**
 * Wordmark metrics, tuned to Manrope (the heading font loaded in the root layout).
 * `textLength` pins each word's width so the lockup never clips or collides, even if the
 * brand font has not loaded yet (letter spacing absorbs the difference). Lengths were calibrated
 * from measured Segoe UI ink widths scaled by the Manrope/Segoe average-width ratio (capsize metrics).
 */
export const WORDMARK = {
  fontSize: 25,
  baseline: 32.6,
  /** "Venkat Sai" — ExtraBold. */
  primary: { text: "Venkat Sai", weight: 800, length: 126 },
  /** "Global" — SemiBold, in teal. */
  secondary: { text: "Global", weight: 600, length: 73 },
  /** Gap between the two words. */
  wordGap: 7,
  /** Gap between the mark and the wordmark in the full lockup. */
  markGap: 12,
} as const;

/** Width of the wordmark on its own (viewBox units, height 48). */
export const WORDMARK_WIDTH = WORDMARK.primary.length + WORDMARK.wordGap + WORDMARK.secondary.length + 2;

/** Width of the full lockup: mark + gap + wordmark. */
export const LOCKUP_WIDTH = MARK_SIZE + WORDMARK.markGap + WORDMARK_WIDTH;

export function logoPalette(variant: LogoVariant): {
  arc: string;
  path: string;
  spark: string;
  primaryText: string;
  secondaryText: string;
} {
  return {
    arc: BRAND_COLORS.teal,
    path: BRAND_COLORS.white,
    spark: BRAND_COLORS.gold,
    primaryText: variant === "onDark" ? BRAND_COLORS.white : BRAND_COLORS.navy,
    secondaryText: variant === "onDark" ? BRAND_COLORS.tealLight : BRAND_COLORS.tealStrong,
  };
}
