import type { ChartDatum } from "./types";

/** True when there is nothing to draw (no points, or every value is zero / not a number). */
export function isEmptyChart(data: readonly ChartDatum[]): boolean {
  return data.length === 0 || data.every((d) => !Number.isFinite(d.value) || d.value === 0);
}

/**
 * Plain-English text twin of a small chart for screen readers:
 * "Applications per week. 6 points, total 42. Highest: 12 in 16 Nov. Latest: 9 in 23 Nov."
 */
export function summarizeChart(title: string, data: readonly ChartDatum[], options: { unit?: string; locale?: string } = {}): string {
  const nf = new Intl.NumberFormat(options.locale ?? "en-IN");
  const unit = options.unit ? ` ${options.unit}` : "";
  if (isEmptyChart(data)) return `${title}. No data yet.`;
  const values = data.filter((d) => Number.isFinite(d.value));
  const total = values.reduce((sum, d) => sum + d.value, 0);
  const highest = values.reduce((best, d) => (d.value > best.value ? d : best), values[0]!);
  const latest = values[values.length - 1]!;
  const parts = [
    `${title}.`,
    `${values.length} ${values.length === 1 ? "point" : "points"}, total ${nf.format(total)}${unit}.`,
    `Highest: ${nf.format(highest.value)}${unit} in ${highest.label}.`,
  ];
  if (latest !== highest) parts.push(`Latest: ${nf.format(latest.value)}${unit} in ${latest.label}.`);
  return parts.join(" ");
}
