/**
 * Pure helpers for the analytics dashboards (client-safe, unit-tested in format.test.ts).
 */
import type { AnalyticsRange } from "@/modules/analytics/range";

/** Seconds → "45s", "2m 05s", "1h 03m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Visitors that were not new in the period (never negative). */
export function returningVisitors(visitors: number, newVisitors: number): number {
  return Math.max(0, visitors - newVisitors);
}

/** Search params that reproduce a reporting range in links (`?range=7d` or `?range=custom&from=&to=`). */
export function rangeParams(range: Pick<AnalyticsRange, "preset" | "from" | "to">): Record<string, string> {
  if (range.preset === "custom") return { range: "custom", from: range.from, to: range.to };
  return { range: range.preset };
}

/** Build an href with the reporting range plus extra params (empty values dropped). */
export function analyticsHref(
  pathname: string,
  range: Pick<AnalyticsRange, "preset" | "from" | "to"> | null,
  extra: Record<string, string | number | null | undefined> = {},
): string {
  const params = new URLSearchParams(range ? rangeParams(range) : {});
  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Digits after the decimal point for a currency (JPY 0, INR 2, KWD 3); 2 for unknown codes. */
export function currencyFractionDigits(currency: string | null | undefined): number {
  if (!currency) return 2;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Integer minor units → major-unit string for an input field ("125000" INR → "1250.00"). */
export function minorToMajorInput(amountMinor: number | null | undefined, currency: string | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined) return "";
  const digits = currencyFractionDigits(currency);
  return (amountMinor / 10 ** digits).toFixed(digits);
}

/** A tracked path that still contains a replaced identifier ("/jobs/[id]") cannot be opened as a live page. */
export function isPreviewablePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !/[[\]]/.test(path) && !/^\/(admin|api|dev)(\/|$)/.test(path);
}

/** Share 0–1 → whole-percent width for a bar, keeping tiny non-zero values visible. */
export function barPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(2, Math.min(100, Math.round((value / max) * 100)));
}

/** "2026-11-01" → "1 Nov 2026" (calendar dates, no timezone shift). */
export function formatIsoDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Human description of a range: "1 Oct 2026 – 30 Oct 2026". */
export function describeRange(from: string, to: string): string {
  return from === to ? formatIsoDay(from) : `${formatIsoDay(from)} – ${formatIsoDay(to)}`;
}

/** Event props → "key: value" strings for display (already sanitised by the collector). */
export function propEntries(props: Record<string, string | number | boolean | null> | null | undefined): string[] {
  if (!props) return [];
  return Object.entries(props)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`);
}
