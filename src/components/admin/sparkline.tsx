import { CHART_COLORS } from "@/components/shared/charts/palette";

/**
 * Tiny single-series trend line for KPI tiles (inline SVG, server-friendly, CSP-safe — no inline styles).
 * One series → no legend; the tile label names it. The values are summarised for screen readers.
 * Renders nothing when there are fewer than two points.
 */
export function Sparkline({
  values,
  label,
  width = 120,
  height = 28,
  color = CHART_COLORS[0],
}: {
  values: readonly number[];
  label: string;
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => [pad + i * step, height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${points.at(-1)![0].toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  const last = points.at(-1)!;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <span className="mt-1 block">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className="block max-w-full overflow-visible">
        <path d={area} fill={color} fillOpacity={0.1} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
      </svg>
      <span className="sr-only">
        {label}: {values.length} periods, {total} in total, latest {values.at(-1)}, peak {max}.
      </span>
    </span>
  );
}
