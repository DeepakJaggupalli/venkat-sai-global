import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

import { barPercent } from "./format";

export type RankedRow = { key: string; label: ReactNode; value: number; display?: string; hint?: ReactNode };

/**
 * Ranked horizontal bars for "parts of a whole" breakdowns (devices, categories, filters). One hue, thin
 * bars, values always printed as text next to the label — the bar is decoration (aria-hidden), so the
 * list reads correctly without colour or sight.
 */
export function RankedList({
  rows,
  label,
  valueLabel,
  emptyTitle = "No data in this period",
  emptyDescription,
  className,
}: {
  rows: readonly RankedRow[];
  /** Accessible name of the list. */
  label: string;
  /** Unit read after each value, e.g. "sessions". */
  valueLabel: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  if (!rows.length) return <EmptyState size="sm" variant="plain" title={emptyTitle} description={emptyDescription} />;
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <ol aria-label={label} className={cn("space-y-3", className)}>
      {rows.map((row) => (
        <li key={row.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              {row.display ?? row.value.toLocaleString("en-IN")}
              <span className="sr-only"> {valueLabel}</span>
              {row.hint ? <span className="ml-2 text-xs text-muted-foreground">{row.hint}</span> : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary" aria-hidden="true">
            <div className={cn("h-1.5 rounded-full bg-teal", widthClass(barPercent(row.value, max)))} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Width classes in 5% steps (static strings so Tailwind generates them; no inline styles). */
export const WIDTH_CLASSES = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
] as const;

/** Width class for a 0–100 percentage (rounded to 5%, tiny non-zero values stay visible). */
export function widthClass(percent: number): string {
  if (!(percent > 0)) return WIDTH_CLASSES[0];
  return WIDTH_CLASSES[Math.max(1, Math.min(20, Math.round(percent / 5)))]!;
}
