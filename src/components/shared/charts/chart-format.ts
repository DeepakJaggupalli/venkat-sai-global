/**
 * Pure chart formatting + data shaping helpers (client-safe, unit-tested).
 */
import { CHART_OTHER, DONUT_MAX_SEGMENTS, seriesColor } from "./palette";

export type ChartRow = Record<string, string | number | null | undefined>;
export type ChartSeries = { key: string; label: string; color?: string };
export type XFormat = "text" | "date" | "month";

const DEFAULT_LOCALE = "en-IN";

/** Axis ticks: full figures below 10,000, compact above (10K / 1.2L), one style per axis. */
export function formatTick(value: number, max: number, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return "";
  const compact = Math.abs(max) >= 10_000;
  return new Intl.NumberFormat(locale, { notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 }).format(value);
}

/** Tooltip / table values with caller-supplied Intl options (serialisable from server components). */
export function formatValue(value: number | null | undefined, options?: Intl.NumberFormatOptions, locale = DEFAULT_LOCALE): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat(locale).format(value);
  }
}

/** X-axis labels for ISO dates ("2026-11-07" → "7 Nov", month → "Nov 2026"); text passes through. */
export function formatX(value: unknown, format: XFormat = "text", locale = DEFAULT_LOCALE): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (format === "text") return text;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(text);
  if (!match) return text;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? "1")));
  const opts: Intl.DateTimeFormatOptions = format === "month" ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat(locale, opts).format(date);
}

/** Largest absolute numeric value across the series (for tick formatting). */
export function maxValue(data: readonly ChartRow[], keys: readonly string[], stacked = false): number {
  let max = 0;
  for (const row of data) {
    let sum = 0;
    for (const key of keys) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        if (stacked) sum += v;
        else max = Math.max(max, Math.abs(v));
      }
    }
    if (stacked) max = Math.max(max, Math.abs(sum));
  }
  return max;
}

/** Attach palette colours by series position (explicit colours win). */
export function withSeriesColors(series: readonly ChartSeries[]): Required<ChartSeries>[] {
  return series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
}

/** True when there is nothing to plot (no rows, or every value is null). */
export function isEmptySeries(data: readonly ChartRow[], keys: readonly string[]): boolean {
  return !data.some((row) => keys.some((k) => typeof row[k] === "number" && Number.isFinite(row[k] as number)));
}

export type DonutDatum = { label: string; value: number; color?: string };
export type DonutSegment = { key: string; label: string; value: number; share: number; fill: string };

/**
 * Prepare donut segments: drop non-positive values, keep the input order, fold everything past
 * `maxSegments - 1` into "Other" (the palette only validates 6 ring neighbours).
 */
export function toDonutSegments(data: readonly DonutDatum[], maxSegments = DONUT_MAX_SEGMENTS, otherLabel = "Other"): DonutSegment[] {
  const positive = data.filter((d) => Number.isFinite(d.value) && d.value > 0);
  const total = positive.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return [];
  const limit = Math.max(2, Math.min(maxSegments, DONUT_MAX_SEGMENTS));
  const head = positive.length > limit ? positive.slice(0, limit - 1) : positive;
  const tail = positive.length > limit ? positive.slice(limit - 1) : [];
  const segments: DonutSegment[] = head.map((d, i) => ({
    key: `s${i}`,
    label: d.label,
    value: d.value,
    share: d.value / total,
    fill: d.color ?? seriesColor(i),
  }));
  if (tail.length > 0) {
    const value = tail.reduce((sum, d) => sum + d.value, 0);
    segments.push({ key: "other", label: otherLabel, value, share: value / total, fill: CHART_OTHER });
  }
  return segments;
}
