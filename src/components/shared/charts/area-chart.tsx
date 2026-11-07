"use client";

import { Area, AreaChart as RechartsAreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";

import { AXIS_TICK, buildCartesianTable, chartConfigFor, labelMap, usePrefersReducedMotion, type CartesianChartProps } from "./cartesian-shared";
import { formatTick, formatX, isEmptySeries, maxValue, withSeriesColors } from "./chart-format";
import { ChartFrame } from "./chart-frame";
import { ChartTooltipPanel } from "./chart-tooltip";
import { CHART_INK } from "./palette";

type AreaChartProps = CartesianChartProps & {
  /** Stack the series (part-to-whole over time). */
  stacked?: boolean;
};

/**
 * Volume over time: a 2px line with a ~10% wash under it (never a saturated block).
 *
 *   <AreaChart title="Visits" index="day" xFormat="date" data={rows} series={[{ key: "visits", label: "Visits" }]} />
 */
export function AreaChart(props: AreaChartProps) {
  const { data, index, series: rawSeries, title, description, showTitle, size = "md", xFormat, numberFormat, valueFormatter, xFormatter, emptyText, className, stacked = false } = props;
  const series = withSeriesColors(rawSeries);
  const keys = series.map((s) => s.key);
  const reduceMotion = usePrefersReducedMotion();
  const max = maxValue(data, keys, stacked);
  const labels = labelMap(series);

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
        <RechartsAreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} title={title} desc={description}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey={index}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.axis }}
            tickMargin={8}
            minTickGap={20}
            tick={AXIS_TICK}
            tickFormatter={(v) => (xFormatter ? xFormatter(String(v)) : formatX(v, xFormat))}
          />
          <YAxis tickLine={false} axisLine={false} width={48} tick={AXIS_TICK} tickFormatter={(v: number) => formatTick(v, max)} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => (
              <ChartTooltipPanel active={active} payload={payload} label={label} labels={labels} xFormat={xFormat} numberFormat={numberFormat} valueFormatter={valueFormatter} keyShape="line" />
            )}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "stack" : undefined}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 5, fill: s.color, stroke: CHART_INK.surface, strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
            />
          ))}
        </RechartsAreaChart>
      </ChartContainer>
    </ChartFrame>
  );
}
