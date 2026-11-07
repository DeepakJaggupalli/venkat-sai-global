import "server-only";

import type { Locale } from "@/i18n/config";
import { env } from "@/lib/env";

/** Server-side date labels in the viewer's language and time zone (no hydration differences). */
const INTL_LOCALE: Record<Locale, string> = { en: "en-IN", hi: "hi-IN", te: "te-IN" };

export function viewerTimeZone(timezone: string | null | undefined): string {
  const candidate = timezone || env().DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

export function makeDateFormatters(locale: Locale, timezone: string | null | undefined) {
  const timeZone = viewerTimeZone(timezone);
  const intlLocale = INTL_LOCALE[locale] ?? "en-IN";
  const dateTime = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short", timeZone });
  const date = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone });
  const relative = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });

  function relativeTime(value: Date, now: number = Date.now()): string {
    const seconds = Math.round((value.getTime() - now) / 1000);
    const abs = Math.abs(seconds);
    if (abs < 60) return relative.format(Math.round(seconds), "second");
    if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
    if (abs < 30 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
    return date.format(value);
  }

  return {
    timeZone,
    dateTime: (value: Date | null | undefined) => (value ? dateTime.format(value) : null),
    date: (value: Date | null | undefined) => (value ? date.format(value) : null),
    relative: (value: Date | null | undefined) => (value ? relativeTime(value) : null),
  };
}
