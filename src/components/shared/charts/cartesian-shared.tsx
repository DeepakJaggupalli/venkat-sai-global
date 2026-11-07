"use client";

import { useSyncExternalStore } from "react";

import type { ChartConfig } from "@/components/ui/chart";

import { formatValue, formatX, type ChartRow, type ChartSeries, type XFormat } from "./chart-format";
import type { ChartSize, ChartTable } from "./chart-frame";

/** Props shared by LineChart, AreaChart and BarChart. Everything except the *Formatter callbacks is serialisable. */
export type CartesianChartProps = {
  data: ChartRow[];
  /** Key of the category / time field on each row (x axis). */
  index: string;
  /** Header for the index column in the data table, e.g. "Week". */
  indexLabel?: string;
  /** Series in a fixed order — colour follows position, so keep the order stable across filters. */
  series: ChartSeries[];
  /** Accessible name (and visible title when `showTitle`). */
  title: string;
  description?: string;
  showTitle?: boolean;
  size?: ChartSize;
  /** How to print x values: ISO dates as "7 Nov" (date) or "Nov 2026" (month). */
  xFormat?: XFormat;
  /** Intl.NumberFormat options for values (e.g. { style: "percent" } or { style: "currency", currency }). */
  numberFormat?: Intl.NumberFormatOptions;
  /** Client-only alternatives to the serialisable format options. */
  valueFormatter?: (value: number) => string;
  xFormatter?: (value: string) => string;
  emptyText?: string;
  className?: string;
};

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(callback: () => void): () => void {
  const mql = window.matchMedia(reducedMotionQuery);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/** Recharts animates in JS, so the global CSS reduced-motion rule does not reach it. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => true,
  );
}

/** Labels only: colours are passed to the marks directly, so ChartContainer injects no <style> tag. */
export function chartConfigFor(series: readonly ChartSeries[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label }]));
}

export function labelMap(series: readonly ChartSeries[]): Record<string, string> {
  return Object.fromEntries(series.map((s) => [s.key, s.label]));
}

/** The chart's table twin: one row per x value, one column per series. */
export function buildCartesianTable(props: Pick<CartesianChartProps, "data" | "index" | "indexLabel" | "series" | "xFormat" | "numberFormat" | "valueFormatter" | "xFormatter">): ChartTable {
  const { data, index, indexLabel, series, xFormat, numberFormat, valueFormatter, xFormatter } = props;
  return {
    columns: [{ key: "__x", label: indexLabel ?? "Category" }, ...series.map((s) => ({ key: s.key, label: s.label, numeric: true }))],
    rows: data.map((row) => {
      const x = row[index];
      const out: Record<string, string> = { __x: xFormatter ? xFormatter(String(x ?? "")) : formatX(x, xFormat) };
      for (const s of series) {
        const v = row[s.key];
        out[s.key] = typeof v === "number" ? (valueFormatter ? valueFormatter(v) : formatValue(v, numberFormat)) : "—";
      }
      return out;
    }),
  };
}

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;
