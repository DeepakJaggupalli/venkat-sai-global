/**
 * Chart colours (client-safe). Built with the dataviz method and checked with its validator
 * (scripts/validate_palette.js — OKLab ΔE×100, Machado 2009 CVD simulation):
 *
 * Light (surface #ffffff), adjacent pairs, 7 slots:
 *   lightness band PASS · chroma floor PASS · CVD worst ΔE 19.9 (target ≥ 8) · normal-vision worst ΔE 24.3 (floor 15)
 *   contrast WARN for teal (3.0:1), gold (2.24:1) and pink (2.69:1) → relief: every chart ships a data table
 *   view and a legend, values are in tooltips and the table, and text never uses series colours.
 *   First three slots validated all-pairs (teal / navy-blue / gold: CVD 13.2, normal 21.1).
 * Dark (surface #0f1b33): all checks PASS (CVD worst 14.1, normal 16.7, contrast ≥ 3:1) — kept for
 *   when the dark theme ships.
 * Donut rings wrap (last segment touches the first): validated up to 6 segments; slot 7 against slot 1
 *   FAILS CVD, so donuts cap at 6 and fold the rest into "Other".
 *
 * The brand tokens --chart-1..5 in globals.css were measured too and fail (navy is too dark to read as
 * a series, the grey reads as no colour, grey↔blue are too close) — so charts use this palette.
 * Assign slots in order, never cycle, never generate an 8th hue: fold extra series into "Other".
 */
export const CHART_COLORS = ["#16a6a1", "#34539c", "#d5a64a", "#5b8def", "#eb6834", "#6250d6", "#e87ba4"] as const;
export const CHART_COLORS_DARK = ["#16a6a1", "#5577cc", "#b8892c", "#5b8def", "#d95926", "#9085e9", "#d55181"] as const;

/** De-emphasis / "Other" — separates from teal under CVD (slate grey #8792a6 collapses into teal, ΔE 0.5). */
export const CHART_OTHER = "#5b677d";
export const CHART_OTHER_DARK = "#c9d0da";

export const CHART_MAX_SERIES = CHART_COLORS.length;
export const DONUT_MAX_SEGMENTS = 6;

/** Chart chrome as CSS variables (SVG presentation attributes accept var()). */
export const CHART_INK = {
  grid: "var(--border)",
  axis: "var(--input)",
  tick: "var(--muted-foreground)",
  surface: "var(--card)",
  cursorFill: "var(--secondary)",
} as const;

/** Colour for the series at `index` (by position in the series list — stable across filters as long as series order is). */
export function seriesColor(index: number): string {
  return CHART_COLORS[index] ?? CHART_OTHER;
}
