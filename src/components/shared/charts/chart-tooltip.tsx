"use client";

import type { TooltipPayloadEntry } from "recharts";

import { formatValue, formatX, type XFormat } from "./chart-format";

type ChartTooltipPanelProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: string | number;
  labels: Record<string, string>;
  xFormat?: XFormat;
  numberFormat?: Intl.NumberFormatOptions;
  valueFormatter?: (value: number) => string;
  /** Key the series by a short stroke (lines) or a small square (bars/areas). */
  keyShape?: "line" | "rect";
  hideLabel?: boolean;
};

/**
 * Tooltip readout per the data-viz rules: one tooltip lists every series at the hovered position;
 * the value leads (strong ink), the series name follows (muted); identity comes from a small key in
 * the series colour, never from coloured text. Values are also in the chart's table view.
 */
export function ChartTooltipPanel({ active, payload, label, labels, xFormat = "text", numberFormat, valueFormatter, keyShape = "line", hideLabel }: ChartTooltipPanelProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => p.type !== "none" && !p.hide);
  if (rows.length === 0) return null;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      {!hideLabel && label !== undefined && label !== "" ? <p className="font-medium text-muted-foreground">{formatX(label, xFormat)}</p> : null}
      <ul className="grid gap-1">
        {rows.map((entry, i) => {
          const key = String(entry.dataKey ?? entry.name ?? i);
          // Prefer the mark's fill: stacked bars and donut segments carry a surface-coloured stroke.
          const payloadFill = (entry.payload as { fill?: unknown } | undefined)?.fill;
          const color = entry.color ?? (typeof payloadFill === "string" ? payloadFill : undefined) ?? entry.fill ?? entry.stroke ?? "currentColor";
          const raw = typeof entry.value === "number" ? entry.value : Number(entry.value);
          const value = Number.isFinite(raw) ? (valueFormatter ? valueFormatter(raw) : formatValue(raw, numberFormat)) : "—";
          return (
            <li key={key} className="flex items-center gap-2">
              {keyShape === "line" ? (
                <svg aria-hidden="true" width="12" height="4" viewBox="0 0 12 4" className="shrink-0">
                  <line x1="1" y1="2" x2="11" y2="2" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
                  <rect width="8" height="8" rx="2" fill={color} />
                </svg>
              )}
              <span className="font-semibold text-foreground tabular-nums">{value}</span>
              <span className="text-muted-foreground">{labels[key] ?? String(entry.name ?? key)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
