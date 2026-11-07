"use client";

import { CartesianGrid, Line, LineChart as RechartsLineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";

import { AXIS_TICK, buildCartesianTable, chartConfigFor, labelMap, usePrefersReducedMotion, type CartesianChartProps } from "./cartesian-shared";
import { formatTick, formatX, isEmptySeries, maxValue, withSeriesColors } from "./chart-format";
import { ChartFrame } from "./chart-frame";
import { ChartTooltipPanel } from "./chart-tooltip";
import { CHART_INK } from "./palette";

type LineChartProps = CartesianChartProps & {
  /** Show ≥ 8px markers on every point (useful for sparse data and print). */
  showDots?: boolean;
};

/**
 * Trend over time. 2px lines, crosshair tooltip listing every series, recessive grid, one y axis.
 *
 *   <LineChart title="Applications per week" index="week" xFormat="date" indexLabel="Week"
 *     data={rows} series={[{ key: "applications", label: "Applications" }]} />
 */
export function LineChart(props: LineChartProps) {
  const { data, index, series: rawSeries, title, description, showTitle, size = "md", xFormat, numberFormat, valueFormatter, xFormatter, emptyText, className, showDots = false } = props;
  const series = withSeriesColors(rawSeries);
  const keys = series.map((s) => s.key);
  const reduceMotion = usePrefersReducedMotion();
  const max = maxValue(data, keys);
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
      legend={series.map((s) => ({ label: s.label, color: s.color, shape: "line" as const }))}
      table={buildCartesianTable(props)}
    >
      <ChartContainer config={chartConfigFor(series)} className="aspect-auto h-full w-full">
        <RechartsLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} title={title} desc={description}>
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
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={showDots ? { r: 4, fill: s.color, stroke: CHART_INK.surface, strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: s.color, stroke: CHART_INK.surface, strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
            />
          ))}
        </RechartsLineChart>
      </ChartContainer>
    </ChartFrame>
  );
}
