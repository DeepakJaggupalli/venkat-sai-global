import type { Tone } from "./tones";

/**
 * Pure helpers for StatCard (client-safe, unit-tested). Stat values always come from props — these
 * functions only format; they never invent or default a number.
 */
export type DeltaFormat = "percent" | "number" | "points";
export type GoodDirection = "up" | "down" | "neutral";
export type DeltaDirection = "up" | "down" | "flat";

export type StatDelta = {
  /** Change vs the comparison period. For `percent`, pass a ratio (0.125 = +12.5%). */
  value: number;
  format?: DeltaFormat;
  /** Comparison period, e.g. "vs last month". Shown after the value. */
  period?: string;
  /** Which direction is good news (drives colour). Defaults to "up". */
  goodDirection?: GoodDirection;
  fractionDigits?: number;
};

const MINUS = "−";

export function deltaDirection(value: number): DeltaDirection {
  if (!Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export function deltaTone(direction: DeltaDirection, good: GoodDirection = "up"): Tone {
  if (direction === "flat" || good === "neutral") return "neutral";
  return direction === good ? "success" : "danger";
}

/** "+12.5%", "−3", "+1.2 pts". Uses a true minus sign for legibility. */
export function formatDelta(delta: Pick<StatDelta, "value" | "format" | "fractionDigits">, locale = "en-IN"): string {
  const { value, format = "percent" } = delta;
  if (!Number.isFinite(value)) return "—";
  const digits = delta.fractionDigits ?? (format === "number" ? 0 : 1);
  const magnitude = format === "percent" ? Math.abs(value) * 100 : Math.abs(value);
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(magnitude);
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  const suffix = format === "percent" ? "%" : format === "points" ? " pts" : "";
  return `${sign}${formatted}${suffix}`;
}

/** Screen-reader sentence for a delta, e.g. "Increased by 12.5% vs last month". */
export function describeDelta(delta: StatDelta, locale = "en-IN"): string {
  const direction = deltaDirection(delta.value);
  const amount = formatDelta({ ...delta, value: Math.abs(delta.value) }, locale).replace(/^\+/, "");
  const period = delta.period ? ` ${delta.period}` : "";
  if (direction === "flat") return `No change${period}`;
  return `${direction === "up" ? "Increased" : "Decreased"} by ${amount}${period}`;
}

/**
 * Stat value: full figures below 10,000 and compact above (12.9K / 1.2L depending on locale), per
 * the data-viz figure contract. Strings pass through untouched; null/undefined render as an em dash.
 */
export function formatStatValue(
  value: number | string | null | undefined,
  opts: { compact?: boolean | "auto"; locale?: string; maximumFractionDigits?: number } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";
  const locale = opts.locale ?? "en-IN";
  const compact = opts.compact === true || ((opts.compact ?? "auto") === "auto" && Math.abs(value) >= 10_000);
  return new Intl.NumberFormat(locale, {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: opts.maximumFractionDigits ?? (compact ? 1 : 2),
  }).format(value);
}
