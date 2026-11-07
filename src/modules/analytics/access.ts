import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { CONVERSION_EVENTS } from "./events";
import { isIsoDate, MAX_RANGE_DAYS, parseAnalyticsRange, type AnalyticsRange } from "./range";

/**
 * Shared server helpers for the analytics read/write API: permission checks, the reporting timezone,
 * range validation and SQL fragments.
 */

export type AnalyticsPermission = "analytics.view" | "analytics.sessions" | "analytics.export" | "analytics.configure";

const PERMISSION_MESSAGES: Record<AnalyticsPermission, string> = {
  "analytics.view": "You do not have permission to view analytics.",
  "analytics.sessions": "You do not have permission to open session diagnostics.",
  "analytics.export": "You do not have permission to export analytics data.",
  "analytics.configure": "You do not have permission to configure analytics.",
};

/** Throw ActionError (code "forbidden") unless the staff member holds the permission. */
export function assertAnalyticsPermission(staff: StaffContext, permission: AnalyticsPermission): void {
  if (!staffCan(staff, permission)) throw new ActionError(PERMISSION_MESSAGES[permission], { code: "forbidden" });
}

/** IANA timezone used for daily buckets (env DEFAULT_TIMEZONE). */
export function reportingTimeZone(): string {
  try {
    return env().DEFAULT_TIMEZONE;
  } catch {
    return "Asia/Kolkata";
  }
}

/** Search params → range in the reporting timezone (`?range=7d`, `?range=custom&from=…&to=…`). */
export function getAnalyticsRange(searchParams?: Record<string, string | string[] | undefined>, now?: Date): AnalyticsRange {
  return parseAnalyticsRange(searchParams, { timeZone: reportingTimeZone(), now });
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Reject hand-built ranges that are malformed or too long (queries interpolate them as parameters). */
export function assertRange(range: AnalyticsRange): void {
  const ok =
    isIsoDate(range.from) &&
    isIsoDate(range.to) &&
    range.from <= range.to &&
    isTimeZone(range.timeZone) &&
    (new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) / 86_400_000 < MAX_RANGE_DAYS;
  if (!ok) throw new ActionError("Choose a valid date range.", { code: "invalid_range" });
}

/** [start, end) timestamps of a calendar-day range in the range's timezone. */
export function rangeBounds(from: string, to: string, timeZone: string): { start: SQL; end: SQL } {
  return {
    start: sql`((${from}::date)::timestamp at time zone ${timeZone})`,
    end: sql`(((${to}::date) + 1)::timestamp at time zone ${timeZone})`,
  };
}

/** Parenthesised parameter list for `in (...)`. */
export function sqlList(values: readonly (string | number)[]): SQL {
  if (!values.length) return sql`(null)`;
  return sql`(${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`;
}

export const CONVERSION_LIST: SQL = sqlList(CONVERSION_EVENTS);

/** Traffic source: utm_source, else referrer domain, else (direct). */
export const SOURCE_SQL: SQL = sql`coalesce(s.utm_source, s.referrer_domain, '(direct)')`;
/** Medium: utm_medium, else referral / (none). */
export const MEDIUM_SQL: SQL = sql`coalesce(s.utm_medium, case when s.referrer_domain is not null then 'referral' else '(none)' end)`;

/** Number from a PostgreSQL numeric / bigint result (strings in node-postgres). */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** Escape LIKE wildcards in a literal prefix. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
