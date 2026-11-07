"use client";

import { Pie, PieChart as RechartsPieChart, Tooltip } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { usePrefersReducedMotion } from "./cartesian-shared";
import { formatValue, toDonutSegments, type DonutDatum } from "./chart-format";
import { ChartFrame, type ChartSize } from "./chart-frame";
import { ChartTooltipPanel } from "./chart-tooltip";
import { CHART_INK, DONUT_MAX_SEGMENTS } from "./palette";

type DonutChartProps = {
  data: DonutDatum[];
  title: string;
  description?: string;
  showTitle?: boolean;
  size?: ChartSize;
  /** Text under the total in the centre, e.g. "Applications". */
  centerLabel?: string;
  /** Header for the category column in the data table. */
  categoryLabel?: string;
  numberFormat?: Intl.NumberFormatOptions;
  valueFormatter?: (value: number) => string;
  /** Segments before the tail folds into "Other" (max 6 — the validated ring size). */
  maxSegments?: number;
  otherLabel?: string;
  emptyText?: string;
  className?: string;
};

const percent = (share: number) => new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(share);

/**
 * One whole split into a few parts, read at a glance (≤ 6 segments, tail folded into "Other").
 * The legend lists every part with its value and share, so nothing depends on hovering. To compare
 * parts precisely, prefer a horizontal BarChart.
 *
 *   <DonutChart title="Applications by source" centerLabel="Applications" data={[{ label: "Direct", value: 120 }, { label: "Partners", value: 45 }]} />
 */
export function DonutChart({
  data,
  title,
  description,
  showTitle,
  size = "md",
  centerLabel,
  categoryLabel = "Category",
  numberFormat,
  valueFormatter,
  maxSegments = DONUT_MAX_SEGMENTS,
  otherLabel = "Other",
  emptyText,
  className,
}: DonutChartProps) {
  const segments = toDonutSegments(data, maxSegments, otherLabel);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const reduceMotion = usePrefersReducedMotion();
  const format = (v: number) => (valueFormatter ? valueFormatter(v) : formatValue(v, numberFormat));
  const labels = Object.fromEntries(segments.map((s) => [s.key, s.label]));
  const config: ChartConfig = Object.fromEntries(segments.map((s) => [s.key, { label: s.label }]));

  return (
    <div className={cn("grid gap-4", className)}>
      <ChartFrame
        title={title}
        description={description}
        showTitle={showTitle}
        size={size}
        empty={segments.length === 0}
        emptyText={emptyText}
        table={{
          columns: [
            { key: "label", label: categoryLabel },
            { key: "value", label: "Value", numeric: true },
            { key: "share", label: "Share", numeric: true },
          ],
          rows: segments.map((s) => ({ label: s.label, value: format(s.value), share: percent(s.share) })),
        }}
        overlay={
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-semibold tracking-tight text-foreground">{format(total)}</span>
            {centerLabel ? <span className="text-xs text-muted-foreground">{centerLabel}</span> : null}
          </div>
        }
      >
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <RechartsPieChart title={title} desc={description}>
            <Tooltip
              isAnimationActive={false}
              content={({ active, payload }) => (
                <ChartTooltipPanel
                  active={active}
                  payload={payload}
                  labels={labels}
                  numberFormat={numberFormat}
                  valueFormatter={valueFormatter}
                  keyShape="rect"
                  hideLabel
                />
              )}
            />
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke={CHART_INK.surface}
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
            />
          </RechartsPieChart>
        </ChartContainer>
      </ChartFrame>
      {segments.length > 0 ? (
        <ul aria-label={`${title} breakdown`} className="grid gap-1.5 text-sm">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                <rect width="10" height="10" rx="2.5" fill={s.fill} />
              </svg>
              <span className="min-w-0 flex-1 truncate text-foreground/90">{s.label}</span>
              <span className="font-medium text-foreground tabular-nums">{format(s.value)}</span>
              <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">{percent(s.share)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
