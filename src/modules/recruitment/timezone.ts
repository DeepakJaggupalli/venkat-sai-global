/**
 * Time-zone helpers for interviews (pure, client-safe, Intl only — no dependencies).
 * Interviews are scheduled as a wall-clock time in an IANA zone ("2026-12-01T10:30" in
 * "Asia/Dubai") and stored as UTC instants plus the zone; nothing assumes India time.
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Is `timeZone` an IANA zone this runtime knows? */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at instant `epochMs`, in minutes (local − UTC). */
export function timeZoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  // Drop the milliseconds the formatter cannot show before comparing.
  const truncated = Math.floor(epochMs / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60_000);
}

/**
 * Convert a wall-clock time ("YYYY-MM-DDTHH:mm[:ss]") in `timeZone` to the UTC instant.
 * Throws on malformed input or unknown zones. For times skipped by a daylight-saving jump the result
 * moves forward by the gap; for repeated times the earlier instant is used.
 */
export function zonedLocalToUtc(localDateTime: string, timeZone: string): Date {
  const m = LOCAL_DATE_TIME.exec(localDateTime.trim());
  if (!m) throw new Error("Invalid local date-time");
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid time zone");
  const [, y, mo, d, h, mi, s] = m;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? "0"));
  const check = new Date(wallAsUtc);
  if (check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) {
    throw new Error("Invalid local date-time");
  }
  // The offsets in force around that wall time (before / at / after a possible transition).
  const offsets = [...new Set([-DAY_MS, 0, DAY_MS].map((delta) => timeZoneOffsetMinutes(wallAsUtc + delta, timeZone)))];
  const candidates = offsets.map((offset) => ({ instant: wallAsUtc - offset * 60_000, offset }));
  const valid = candidates.filter((c) => timeZoneOffsetMinutes(c.instant, timeZone) === c.offset).map((c) => c.instant);
  // Normal and repeated wall times (clocks go back): the earliest valid instant. Skipped wall times
  // (clocks go forward): no candidate round-trips; the later instant moves the time forward by the gap.
  const instant = valid.length ? Math.min(...valid) : Math.max(...candidates.map((c) => c.instant));
  return new Date(instant);
}

/** Format an instant as "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone` (for editing forms). */
export function utcToZonedLocal(instant: Date, timeZone: string): string {
  const offset = timeZoneOffsetMinutes(instant.getTime(), timeZone);
  return new Date(instant.getTime() + offset * 60_000).toISOString().slice(0, 16);
}

/** Human display of an instant in a zone, e.g. "1 Dec 2026, 10:30 GST". */
export function formatInTimeZone(instant: Date, timeZone: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" }).format(instant);
}
