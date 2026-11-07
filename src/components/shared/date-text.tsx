import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DateTextProps = {
  value: Date | string | null | undefined;
  /** date: "12 Nov 2026"; datetime: "12 Nov 2026, 3:45 pm". */
  mode?: "date" | "datetime";
  /**
   * IANA zone to render in. Pass the viewer's zone (`user.timezone ?? env().DEFAULT_TIMEZONE`) for
   * timestamps. Date-only columns (stored as UTC midnight) should use `dateOnly`.
   */
  timeZone?: string;
  /** The value is a calendar date stored as UTC midnight (e.g. from `f.date()`): render in UTC so the day never shifts. */
  dateOnly?: boolean;
  locale?: string;
  fallback?: string;
  className?: string;
};

function toIso(value: Date | string): string | undefined {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Semantic <time> element with a consistent format (server-component friendly).
 *
 *   <DateText value={job.publishedAt} timeZone={viewerTz} />
 *   <DateText value={candidate.availableFrom} dateOnly />
 */
export function DateText({ value, mode = "date", timeZone, dateOnly = false, locale, fallback = "—", className }: DateTextProps) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  const iso = toIso(value);
  if (!iso) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  const zone = dateOnly ? "UTC" : timeZone;
  const text = mode === "datetime" && !dateOnly ? formatDateTime(value, { timeZone: zone, locale }) : formatDate(value, { timeZone: zone, locale });
  return (
    <time dateTime={dateOnly ? iso.slice(0, 10) : iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
