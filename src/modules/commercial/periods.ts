/**
 * Billing-period and allowance-window date math (client-safe, pure, UTC).
 *
 * Months are added calendar-wise with end-of-month clamping, always counted from the anchor (not chained), so a
 * subscription started on 31 January renews on 28/29 February, then 31 March, 30 April…
 */
import type { BillingInterval, PlanFeaturePeriod } from "@/db/schema/commercial";

export const DAY_MS = 86_400_000;

function daysInMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Add calendar months in UTC, clamping the day to the target month's length; time of day is kept. */
export function addMonthsUtc(date: Date, months: number): Date {
  if (!Number.isInteger(months)) throw new RangeError("months must be an integer");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export const INTERVAL_MONTHS: Record<Exclude<BillingInterval, "one_time">, number> = { month: 1, quarter: 3, year: 12 };

export const FEATURE_PERIOD_MONTHS: Record<Exclude<PlanFeaturePeriod, "none">, number> = { month: 1, year: 12 };

/** End of a billing period that starts at `start` (one_time has no period: null). */
export function billingPeriodEnd(start: Date, interval: BillingInterval | null | undefined): Date | null {
  if (!interval || interval === "one_time") return null;
  return addMonthsUtc(start, INTERVAL_MONTHS[interval]);
}

/** The `index`-th billing period after `anchor` (index 0 = the first period). */
export function nthPeriodStart(anchor: Date, months: number, index: number): Date {
  return addMonthsUtc(anchor, months * index);
}

export type Window = { start: Date; end: Date };

/**
 * The window of `months` length, anchored at `anchor`, that contains `at` (start ≤ at < end).
 * Before the anchor, the first window is returned.
 */
export function windowContaining(anchor: Date, months: number, at: Date): Window {
  if (months <= 0) throw new RangeError("months must be positive");
  if (at.getTime() < anchor.getTime()) return { start: anchor, end: addMonthsUtc(anchor, months) };
  const elapsedMonths = (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (at.getUTCMonth() - anchor.getUTCMonth());
  let index = Math.max(0, Math.floor(elapsedMonths / months));
  // Clamping and time of day can put the estimate one window off in either direction.
  while (index > 0 && nthPeriodStart(anchor, months, index).getTime() > at.getTime()) index -= 1;
  while (nthPeriodStart(anchor, months, index + 1).getTime() <= at.getTime()) index += 1;
  return { start: nthPeriodStart(anchor, months, index), end: nthPeriodStart(anchor, months, index + 1) };
}

/** Allowance window of a plan feature period ("month" | "year") anchored at the subscription start. */
export function featureWindow(anchor: Date, period: Exclude<PlanFeaturePeriod, "none">, at: Date): Window {
  return windowContaining(anchor, FEATURE_PERIOD_MONTHS[period], at);
}

/** Calendar month (UTC) containing `at` — the usage window of organisations without a subscription. */
export function calendarMonth(at: Date): Window {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return { start, end: addMonthsUtc(start, 1) };
}

/** Whole days from `from` until `to` (rounded up; negative when `to` is in the past). */
export function daysUntil(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

/** YYYY-MM-DD (UTC) for template data and date columns. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
