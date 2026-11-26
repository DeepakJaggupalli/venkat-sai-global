/**
 * Dashboard greeting and date helpers (client-safe, pure — unit-tested in dashboard.test.tsx).
 * The business runs on India time, so every portal greets by the clock in Asia/Kolkata unless a caller
 * passes the viewer's own time zone.
 */

export const DASHBOARD_TIME_ZONE = "Asia/Kolkata";

export type TimeOfDay = "morning" | "afternoon" | "evening";

const GREETING: Record<TimeOfDay, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** Hour of the day (0–23) at `now` in `timeZone`; falls back to India time for an unknown zone. */
export function hourIn(now: Date, timeZone: string = DASHBOARD_TIME_ZONE): number {
  const read = (zone: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: zone }).format(now));
  try {
    return read(timeZone);
  } catch {
    return read(DASHBOARD_TIME_ZONE);
  }
}

/** 05:00–11:59 morning, 12:00–16:59 afternoon, otherwise evening (late night included). */
export function timeOfDay(now: Date, timeZone: string = DASHBOARD_TIME_ZONE): TimeOfDay {
  const hour = hourIn(now, timeZone);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/**
 * First name for a friendly greeting: the first word of the display name, without a title such as "Mr."
 * or "Dr.". Never an email address or phone number (those are not names). Null when nothing usable is left.
 */
export function firstNameOf(name: string | null | undefined): string | null {
  const cleaned = (name ?? "").trim();
  if (!cleaned || cleaned.includes("@") || /^[+\d\s()-]+$/.test(cleaned)) return null;
  const words = cleaned.split(/\s+/).filter((w) => !/^(mr|mrs|ms|miss|dr|sri|smt|shri)\.?$/i.test(w));
  const first = words[0];
  if (!first) return null;
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}

/** "Good morning, Ravi" (or just "Good morning" without a usable name). */
export function greetingFor(name: string | null | undefined, now: Date = new Date(), timeZone: string = DASHBOARD_TIME_ZONE): string {
  const hello = GREETING[timeOfDay(now, timeZone)];
  const first = firstNameOf(name);
  return first ? `${hello}, ${first}` : hello;
}

/** "Thursday, 26 November 2026" in the given zone (Indian English). */
export function formatDashboardDate(now: Date = new Date(), timeZone: string = DASHBOARD_TIME_ZONE): string {
  const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: DASHBOARD_TIME_ZONE }).format(now);
  }
}

/** yyyy-mm-dd of `now` in the zone, for a machine-readable <time dateTime>. */
export function isoDateIn(now: Date = new Date(), timeZone: string = DASHBOARD_TIME_ZONE): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: DASHBOARD_TIME_ZONE }).format(now);
  }
}
