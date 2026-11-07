/**
 * Heatmap overlay maths (pure, client-safe; tested in heatmap-utils.test.ts).
 *
 * Colour: one sequential hue (the dataviz reference blue ramp, light → dark), never a rainbow. Low density
 * stays light and translucent so the page underneath remains readable; high density is dark and more opaque.
 */
import type { HeatmapCell } from "@/modules/analytics/types";

/** Sequential blue ramp, steps 250 → 700 (reference palette). */
export const HEAT_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"] as const;

/** Cell size of the server buckets: 10 per mille of document width × 25 CSS pixels. */
export const CELL_PERMILLE = 10;
export const CELL_HEIGHT_PX = 25;

/** Viewport widths used to render the live page for each bucket (CSS pixels). */
export const VIEWPORT_WIDTHS = { mobile: 390, tablet: 820, desktop: 1280 } as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Density 0–1 (already scaled) → rgba colour on the ramp. */
export function heatColor(t: number): string {
  const v = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pos = v * (HEAT_RAMP.length - 1);
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(HEAT_RAMP[i]!);
  const b = hexToRgb(HEAT_RAMP[i + 1]!);
  const mix = (k: 0 | 1 | 2) => Math.round(a[k] + (b[k] - a[k]) * f);
  const alpha = (0.35 + 0.5 * v).toFixed(2);
  return `rgba(${mix(0)}, ${mix(1)}, ${mix(2)}, ${alpha})`;
}

/**
 * Count → 0–1 density. Square-root scaling keeps a few very hot cells from washing out the rest;
 * any non-zero cell gets at least a visible minimum.
 */
export function densityScale(count: number, maxCount: number): number {
  if (!(maxCount > 0) || !(count > 0)) return 0;
  return Math.max(0.08, Math.sqrt(count / maxCount));
}

export type CellRect = { x: number; y: number; width: number; height: number; density: number };

/** Server cells → rectangles in document CSS pixels for a document `docWidth` wide. */
export function cellRects(cells: readonly HeatmapCell[], docWidth: number): CellRect[] {
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  const width = (CELL_PERMILLE / 1000) * docWidth;
  return cells.map((c) => ({
    x: (c.x / 1000) * docWidth,
    y: c.y,
    width,
    height: CELL_HEIGHT_PX,
    density: densityScale(c.count, max),
  }));
}

/** Rectangles intersecting the visible window [scrollTop, scrollTop + height). */
export function visibleRects(rects: readonly CellRect[], scrollTop: number, height: number): CellRect[] {
  const bottom = scrollTop + height;
  return rects.filter((r) => r.y + r.height > scrollTop && r.y < bottom);
}

/** Scale factor that fits a `contentWidth` viewport into `containerWidth` (never enlarges). */
export function fitScale(containerWidth: number, contentWidth: number): number {
  if (!(containerWidth > 0) || !(contentWidth > 0)) return 1;
  return Math.min(1, containerWidth / contentWidth);
}
