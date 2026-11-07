/**
 * Locale-aware relative time ("5 minutes ago", "5 मिनट पहले", "5 నిమిషాల క్రితం") using the
 * platform Intl API, so the People Portal shows times in the reader's language.
 * Client-safe and pure (pass `now` for deterministic output).
 */
const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

function formatter(locale: string): Intl.RelativeTimeFormat {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
}

export function formatRelativeTime(value: Date | string | number, locale: string, now: number = Date.now()): string {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const diffSeconds = Math.round((time - now) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = formatter(locale);
  if (abs < 45) return rtf.format(0, "second");
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds || unit === "minute") {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return rtf.format(0, "second");
}
