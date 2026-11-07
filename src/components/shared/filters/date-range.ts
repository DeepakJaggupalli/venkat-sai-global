/**
 * Pure date-range helpers for DateRangeFilter (client-safe, unit-tested). Dates travel in the URL as
 * ISO calendar dates (YYYY-MM-DD, inclusive). Servers must validate them (`/^\d{4}-\d{2}-\d{2}$/`)
 * and interpret them in the viewer's or platform time zone.
 */
export const DATE_RANGE_PRESETS = ["today", "7d", "30d", "90d", "mtd", "ytd"] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "Month to date",
  ytd: "Year to date",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date → "YYYY-MM-DD" (no UTC shift). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Valid "YYYY-MM-DD" that is a real calendar date. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Inclusive range for a preset relative to `today` (local time). "Last 7 days" includes today. */
export function presetRange(preset: DateRangePreset, today: Date = new Date()): { from: string; to: string } {
  const to = toIsoDate(today);
  switch (preset) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: toIsoDate(addDays(today, -6)), to };
    case "30d":
      return { from: toIsoDate(addDays(today, -29)), to };
    case "90d":
      return { from: toIsoDate(addDays(today, -89)), to };
    case "mtd":
      return { from: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case "ytd":
      return { from: toIsoDate(new Date(today.getFullYear(), 0, 1)), to };
  }
}

/** Which preset (if any) the current range corresponds to. */
export function detectPreset(
  from: string | undefined,
  to: string | undefined,
  presets: readonly DateRangePreset[] = DATE_RANGE_PRESETS,
  today: Date = new Date(),
): DateRangePreset | null {
  if (!from || !to) return null;
  return presets.find((p) => {
    const r = presetRange(p, today);
    return r.from === from && r.to === to;
  }) ?? null;
}

/** "12 Nov 2026" for an ISO date, formatted in UTC so the calendar day never shifts. */
export function formatIsoDateLabel(value: string, locale = "en-IN"): string {
  if (!isIsoDate(value)) return value;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Trigger label: preset name, "1 Nov 2026 – 7 Nov 2026", "From 1 Nov 2026", or the empty label. */
export function rangeLabel(from: string | undefined, to: string | undefined, emptyLabel = "Any time", today: Date = new Date()): string {
  const preset = detectPreset(from, to, DATE_RANGE_PRESETS, today);
  if (preset) return PRESET_LABELS[preset];
  if (from && to) return from === to ? formatIsoDateLabel(from) : `${formatIsoDateLabel(from)} – ${formatIsoDateLabel(to)}`;
  if (from) return `From ${formatIsoDateLabel(from)}`;
  if (to) return `Until ${formatIsoDateLabel(to)}`;
  return emptyLabel;
}

/** Validate a custom range typed by the user. Returns an error message or null. */
export function validateRange(from: string, to: string): string | null {
  if (!from && !to) return "Choose a start or end date.";
  if (from && !isIsoDate(from)) return "Enter a valid start date.";
  if (to && !isIsoDate(to)) return "Enter a valid end date.";
  if (from && to && from > to) return "The start date must be on or before the end date.";
  return null;
}
