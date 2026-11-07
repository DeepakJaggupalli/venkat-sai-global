/**
 * Reporting date ranges (client-safe, pure). Dashboards work in calendar days of the reporting timezone
 * (env DEFAULT_TIMEZONE, Asia/Kolkata by default); every range has an equally long previous period for
 * comparison.
 */
import { analyticsRangeInputSchema, type AnalyticsRangeInput, type RangePreset } from "./schemas";

export type AnalyticsRange = {
  preset: RangePreset;
  /** First day (YYYY-MM-DD, inclusive). */
  from: string;
  /** Last day (YYYY-MM-DD, inclusive). */
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
  timeZone: string;
};

/** Longest range a dashboard query accepts (days). */
export const MAX_RANGE_DAYS = 400;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Calendar date of `now` in `timeZone` (YYYY-MM-DD). Falls back to UTC for an unknown zone. */
export function localDate(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive number of days from `from` to `to`. */
export function daysInclusive(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const total = daysInclusive(from, to);
  for (let i = 0; i < total && i <= MAX_RANGE_DAYS; i++) out.push(addDays(from, i));
  return out;
}

const PRESET_DAYS: Record<Exclude<RangePreset, "custom" | "today" | "yesterday">, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

/**
 * Resolve a preset or custom range. Custom ranges are clamped to [today − 400 days, today], swapped when
 * reversed, and fall back to the last 30 days when incomplete.
 */
export function resolveAnalyticsRange(input: AnalyticsRangeInput | undefined, opts: { now?: Date; timeZone: string }): AnalyticsRange {
  const parsed = analyticsRangeInputSchema.parse(input ?? {});
  const today = localDate(opts.now ?? new Date(), opts.timeZone);
  let preset: RangePreset = parsed.range;
  let from: string;
  let to: string;
  if (preset === "today") {
    from = to = today;
  } else if (preset === "yesterday") {
    from = to = addDays(today, -1);
  } else if (preset === "custom" && parsed.from && parsed.to && isIsoDate(parsed.from) && isIsoDate(parsed.to)) {
    [from, to] = parsed.from <= parsed.to ? [parsed.from, parsed.to] : [parsed.to, parsed.from];
    const earliest = addDays(today, -MAX_RANGE_DAYS + 1);
    if (to > today) to = today;
    if (from > today) from = today;
    if (from < earliest) from = earliest;
    if (to < from) to = from;
  } else {
    if (preset === "custom") preset = "30d";
    const days = PRESET_DAYS[preset as keyof typeof PRESET_DAYS];
    to = today;
    from = addDays(today, -(days - 1));
  }
  const days = daysInclusive(from, to);
  return { preset, from, to, days, previousFrom: addDays(from, -days), previousTo: addDays(from, -1), timeZone: opts.timeZone };
}

/** Search params → range, e.g. `?range=custom&from=2026-10-01&to=2026-10-31`. */
export function parseAnalyticsRange(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  opts: { now?: Date; timeZone: string },
): AnalyticsRange {
  const first = (key: string): string | undefined => {
    const v = searchParams?.[key];
    return Array.isArray(v) ? v[0] : v;
  };
  return resolveAnalyticsRange({ range: first("range") as RangePreset | undefined, from: first("from"), to: first("to") }, opts);
}

/** Relative change between two values (null when the previous value is 0). */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
