"use client";

import { Bar, BarChart as RechartsBarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";

import { AXIS_TICK, buildCartesianTable, chartConfigFor, labelMap, usePrefersReducedMotion, type CartesianChartProps } from "./cartesian-shared";
import { formatTick, formatX, isEmptySeries, maxValue, withSeriesColors } from "./chart-format";
import { ChartFrame } from "./chart-frame";
import { ChartTooltipPanel } from "./chart-tooltip";
import { CHART_INK } from "./palette";

type BarChartProps = CartesianChartProps & {
  /** "vertical" columns (default) or "horizontal" bars (better for long category names / rankings). */
  orientation?: "vertical" | "horizontal";
  stacked?: boolean;
};

/**
 * Compare magnitudes. Thin bars (≤ 24px), 4px rounded data end and square baseline, 2px gaps,
 * one colour per series (nominal categories share slot 1 — never a value ramp).
 *
 *   <BarChart title="Open positions by trade" index="trade" orientation="horizontal" data={rows} series={[{ key: "positions", label: "Positions" }]} />
 */
export function BarChart(props: BarChartProps) {
  const { data, index, series: rawSeries, title, description, showTitle, size = "md", xFormat, numberFormat, valueFormatter, xFormatter, emptyText, className, orientation = "vertical", stacked = false } = props;
  const series = withSeriesColors(rawSeries);
  const keys = series.map((s) => s.key);
  const reduceMotion = usePrefersReducedMotion();
  const max = maxValue(data, keys, stacked);
  const labels = labelMap(series);
  const horizontal = orientation === "horizontal";
  const formatCategory = (v: unknown) => (xFormatter ? xFormatter(String(v)) : formatX(v, xFormat));

  return (
    <ChartFrame
      title={title}
      description={description}
      showTitle={showTitle}
      size={size}
      className={className}
      empty={isEmptySeries(data, keys)}
      emptyText={emptyText}
      legend={series.map((s) => ({ label: s.label, color: s.color, shape: "rect" as const }))}
      table={buildCartesianTable(props)}
    >
      <ChartContainer config={chartConfigFor(series)} className="aspect-auto h-full w-full">
        <RechartsBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barGap={2}
          barCategoryGap="24%"
          title={title}
          desc={description}
        >
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={CHART_INK.grid} />
          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => formatTick(v, max)} />
              <YAxis type="category" dataKey={index} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} width={112} tick={AXIS_TICK} tickFormatter={formatCategory} />
            </>
          ) : (
            <>
              <XAxis dataKey={index} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} tickMargin={8} minTickGap={12} tick={AXIS_TICK} tickFormatter={formatCategory} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={AXIS_TICK} tickFormatter={(v: number) => formatTick(v, max)} />
            </>
          )}
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: CHART_INK.cursorFill, fillOpacity: 0.7 }}
            content={({ active, payload, label }) => (
              <ChartTooltipPanel active={active} payload={payload} label={label} labels={labels} xFormat={xFormat} numberFormat={numberFormat} valueFormatter={valueFormatter} keyShape="rect" />
            )}
          />
          {series.map((s, i) => {
            // Only the data end is rounded; in a stack that is the last segment.
            const rounded = !stacked || i === series.length - 1;
            const radius: [number, number, number, number] = rounded ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : [0, 0, 0, 0];
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                maxBarSize={24}
                radius={radius}
                stackId={stacked ? "stack" : undefined}
                // 2px surface gap between stacked segments (a surface-coloured edge, not a border).
                stroke={stacked ? CHART_INK.surface : undefined}
                strokeWidth={stacked ? 2 : 0}
                activeBar={{ fillOpacity: 0.85 }}
                isAnimationActive={!reduceMotion}
              />
            );
          })}
        </RechartsBarChart>
      </ChartContainer>
    </ChartFrame>
  );
}
