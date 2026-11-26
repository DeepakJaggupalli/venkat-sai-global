import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DateText } from "@/components/shared/date-text";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

import { batchStatus } from "./labels";

/**
 * Small server-rendered panels of the Institution Portal dashboard (batch rows with seat bars, outcome rate bars).
 * The cards around them come from the dashboard kit (src/components/dashboard).
 */

export type DashboardBatchRow = {
  id: string;
  code: string;
  title: string;
  courseTitle: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  enrolledCount: number;
  capacity: number | null;
};

/** Seat bar: "12 of 20 seats" with a filled track, or "12 enrolled" when the batch has no seat limit. */
export function SeatBar({ enrolled, capacity, className }: { enrolled: number; capacity: number | null; className?: string }) {
  const limited = typeof capacity === "number" && capacity > 0;
  const percent = limited ? Math.min(100, Math.max(0, Math.round((enrolled / capacity) * 100))) : null;
  const label = limited ? `${enrolled} of ${capacity} seats` : `${enrolled} enrolled`;
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {percent !== null ? (
        <span aria-hidden="true" className="relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-subtle">
          <span className={cn("absolute inset-y-0 left-0 rounded-full", percent >= 100 ? "bg-foreground" : "bg-accent-fill")} style={{ width: `${percent}%` }} />
        </span>
      ) : null}
      <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">{label}</span>
    </span>
  );
}

/** Rows of batches with dates, seats and status. Rows link to the batch when the member may open it. */
export function BatchRows({ items, kind, canOpen }: { items: readonly DashboardBatchRow[]; kind: "running" | "upcoming"; canOpen: boolean }) {
  return (
    <ul className="divide-y divide-border border-t border-border">
      {items.map((b) => {
        const status = batchStatus(b.status);
        const date = kind === "running" ? b.endsOn : b.startsOn;
        const inner: ReactNode = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-snug font-semibold text-foreground">{b.title}</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                {b.courseTitle} · {b.code}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <SeatBar enrolled={b.enrolledCount} capacity={b.capacity} />
                <span className="text-[13px] whitespace-nowrap text-muted-foreground">
                  {kind === "running" ? "Ends " : "Starts "}
                  {date ? <DateText value={date} dateOnly /> : "date not set"}
                </span>
              </span>
            </span>
            <StatusBadge tone={status.tone} size="sm" className="shrink-0">
              {status.label}
            </StatusBadge>
            {canOpen ? <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" /> : null}
          </>
        );
        const base = "flex min-h-11 items-center gap-3 px-4 py-3 sm:px-5";
        return (
          <li key={b.id}>
            {canOpen ? (
              <Link
                href={`/institution/batches/${b.id}`}
                aria-label={`Open batch ${b.title}`}
                className={cn(base, "hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
              >
                {inner}
              </Link>
            ) : (
              <div className={base}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type RateRow = { label: string; percent: number | null; detail: string };

/** Horizontal rate bars ("Attendance 92%"). A rate with nothing to divide by shows "—" and says why. */
export function RateBars({ rows }: { rows: readonly RateRow[] }) {
  return (
    <dl className="space-y-4">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold text-foreground">{r.label}</dt>
            <dd className="font-heading text-lg leading-none font-extrabold text-foreground tabular-nums">{r.percent === null ? "—" : `${r.percent}%`}</dd>
          </div>
          <div aria-hidden="true" className="relative h-2 overflow-hidden rounded-full bg-surface-subtle">
            {r.percent !== null ? <span className="absolute inset-y-0 left-0 rounded-full bg-accent-fill" style={{ width: `${r.percent}%` }} /> : null}
          </div>
          <p className="text-[13px] text-muted-foreground">{r.detail}</p>
        </div>
      ))}
    </dl>
  );
}

/** A label / value line for small summary cards. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-semibold text-foreground tabular-nums">{children}</dd>
    </div>
  );
}
