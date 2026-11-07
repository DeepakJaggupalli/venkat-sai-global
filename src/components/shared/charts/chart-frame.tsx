"use client";

import { Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChartSize = "sm" | "md" | "lg";

/** Fixed plot heights (include the x-axis band) as static classes — no inline styles (CSP-friendly). */
export const CHART_HEIGHT: Record<ChartSize, string> = {
  sm: "h-[200px]",
  md: "h-[260px]",
  lg: "h-[340px]",
};

export type LegendEntry = { label: string; color: string; shape: "line" | "rect" };

export type ChartTable = {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string>[];
};

type ChartFrameProps = {
  /** Accessible name of the chart (also the visible title when `showTitle`). */
  title: string;
  description?: string;
  showTitle?: boolean;
  /** Legend entries — rendered for two or more series (one series is named by the title). */
  legend?: LegendEntry[];
  /** The table twin: every value in the chart is reachable without hovering. */
  table: ChartTable;
  size: ChartSize;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
  className?: string;
  /** Extra content positioned over the plot (e.g. donut centre label). */
  overlay?: ReactNode;
};

/**
 * Chart container shared by the chart wrappers: <figure> with an accessible name, an HTML legend,
 * the plot, and a "View data table" toggle. The table stays available to screen readers when hidden.
 */
export function ChartFrame({ title, description, showTitle = false, legend, table, size, empty = false, emptyText = "No data for this period yet.", children, className, overlay }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const tableId = useId();

  return (
    <figure aria-labelledby={titleId} data-slot="chart" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className={cn(!showTitle && "sr-only")}>
        <span id={titleId} className="block font-heading text-sm font-semibold text-navy">
          {title}
        </span>
        {description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}
      </figcaption>

      {legend && legend.length > 1 && !empty ? (
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {legend.map((entry) => (
            <li key={entry.label} className="inline-flex items-center gap-1.5">
              {entry.shape === "line" ? (
                <svg aria-hidden="true" width="14" height="4" viewBox="0 0 14 4" className="shrink-0">
                  <line x1="1" y1="2" x2="13" y2="2" stroke={entry.color} strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                  <rect width="10" height="10" rx="2.5" fill={entry.color} />
                </svg>
              )}
              <span className="text-foreground/80">{entry.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {empty ? (
        <div className={cn("flex items-center justify-center rounded-lg border border-dashed border-border bg-surface-subtle/60 px-4 text-center text-sm text-muted-foreground", CHART_HEIGHT[size])}>
          {emptyText}
        </div>
      ) : (
        <div className={cn("relative w-full", CHART_HEIGHT[size])}>
          {children}
          {overlay}
        </div>
      )}

      {!empty ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-fit text-muted-foreground"
            aria-expanded={showTable}
            aria-controls={tableId}
            onClick={() => setShowTable((v) => !v)}
          >
            <Table2 aria-hidden="true" />
            {showTable ? "Hide data table" : "View data table"}
          </Button>
          <div id={tableId} className={cn(showTable ? "max-h-80 overflow-auto rounded-lg border border-border" : "sr-only")}>
            <table className="w-full text-sm">
              <caption className="sr-only">{title} — data</caption>
              <thead className="sticky top-0 bg-surface-subtle">
                <tr>
                  {table.columns.map((col) => (
                    <th key={col.key} scope="col" className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", col.numeric ? "text-right" : "text-left")}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {table.columns.map((col, c) =>
                      c === 0 ? (
                        <th key={col.key} scope="row" className="px-3 py-1.5 text-left font-normal text-foreground">
                          {row[col.key]}
                        </th>
                      ) : (
                        <td key={col.key} className={cn("px-3 py-1.5 text-foreground", col.numeric && "text-right tabular-nums")}>
                          {row[col.key]}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </figure>
  );
}
