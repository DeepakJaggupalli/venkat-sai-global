"use client";

import { useEffect, useState } from "react";

import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type RelativeTimeProps = {
  value: Date | string | null | undefined;
  /** IANA zone for the absolute date in the tooltip/title. */
  timeZone?: string;
  /** Re-render interval in ms (default one minute). Set 0 to disable live updates. */
  refreshMs?: number;
  fallback?: string;
  className?: string;
};

/**
 * "3 hours ago" with the exact timestamp in `title` and `dateTime`; refreshes itself every minute.
 * Server and client clocks differ slightly, so the text node opts out of hydration warnings.
 */
export function RelativeTime({ value, timeZone, refreshMs = 60_000, fallback = "—", className }: RelativeTimeProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!value || !refreshMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => window.clearInterval(id);
  }, [value, refreshMs]);

  if (!value) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date, { timeZone })} className={className} suppressHydrationWarning>
      {formatRelative(date)}
    </time>
  );
}
