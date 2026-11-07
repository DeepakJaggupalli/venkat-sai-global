import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { DateText } from "./date-text";
import { EmptyState } from "./empty-state";
import { RelativeTime } from "./relative-time";
import { TONE_STYLES, type Tone } from "./tones";

export type TimelineItem = {
  id: string;
  /** What happened, e.g. "Moved to Interview". */
  title: ReactNode;
  at: Date | string;
  /** Who did it. `role` is shown muted after the name (e.g. "Venkat Sai staff"). */
  actor?: { name: string; role?: string } | null;
  /** Free-text note. Never pass internal notes to candidate-facing timelines. */
  note?: ReactNode;
  /** Small icon inside the marker. */
  icon?: ReactNode;
  tone?: Tone;
};

type TimelineProps = {
  items: TimelineItem[];
  /** "relative" shows "3 hours ago" with the exact time on hover; "absolute" shows the date and time. */
  timeFormat?: "relative" | "absolute";
  timeZone?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Accessible name of the list, e.g. "Application history". */
  label?: string;
  className?: string;
};

/**
 * Chronological history (newest first is the caller's choice — items render in the given order).
 *
 *   <Timeline label="Application history" items={history.map((h) => ({ id: h.id, title: `Moved to ${h.stage}`, at: h.createdAt, actor: { name: h.by } }))} />
 */
export function Timeline({
  items,
  timeFormat = "relative",
  timeZone,
  emptyTitle = "No activity yet",
  emptyDescription = "Updates will appear here as they happen.",
  label,
  className,
}: TimelineProps) {
  if (items.length === 0) {
    return <EmptyState variant="plain" size="sm" title={emptyTitle} description={emptyDescription} className={className} />;
  }
  return (
    <ol aria-label={label} data-slot="timeline" className={cn("relative space-y-5", className)}>
      {items.map((item, index) => {
        const styles = TONE_STYLES[item.tone ?? "neutral"];
        const isLast = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3">
            {!isLast ? <span aria-hidden="true" className="absolute top-7 bottom-[-1.25rem] left-[0.6875rem] w-px bg-border" /> : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card [&_svg]:size-3.5",
                item.icon ? styles.soft : "border border-border bg-card",
              )}
            >
              {item.icon ?? <span className={cn("size-2 rounded-full", styles.dot)} />}
            </span>
            <div className="min-w-0 flex-1 pb-0.5">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeFormat === "relative" ? (
                    <RelativeTime value={item.at} timeZone={timeZone} />
                  ) : (
                    <DateText value={item.at} mode="datetime" timeZone={timeZone} />
                  )}
                </span>
              </div>
              {item.actor ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{item.actor.name}</span>
                  {item.actor.role ? <span> · {item.actor.role}</span> : null}
                </p>
              ) : null}
              {item.note ? (
                <div className="mt-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-pretty whitespace-pre-line text-foreground/90">
                  {item.note}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
