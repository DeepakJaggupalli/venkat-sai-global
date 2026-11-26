"use client";

import { BarChart3, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

import { isEmptyChart, summarizeChart } from "./chart-summary";
import { EmptyState } from "./empty-state";
import { SectionCard, type SectionCardLink } from "./section-card";
import type { ChartDatum } from "./types";

export type ChartCardProps = {
  title: string;
  description?: string;
  /** Real values only, oldest first ("16 Nov" → value). */
  data: readonly ChartDatum[];
  type?: "bar" | "line";
  /** What one value counts, for the tooltip and the screen-reader summary: "applications". */
  unit?: string;
  /** Replaces the automatic screen-reader summary. */
  summary?: string;
  /** "See more" link in the header. */
  link?: SectionCardLink;
  emptyTitle?: string;
  emptyDescription?: string;
  headingLevel?: "h2" | "h3";
  className?: string;
};

/** The single accent (DESIGN.md): series colour passed straight to the marks, so no <style> tag is injected. */
const ACCENT = "var(--accent-fill)";
const TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;

/**
 * Small bar or line chart in a dashboard card: one accent colour, quiet axes, a tooltip, and a text summary
 * for screen readers (the drawing itself is hidden from them). Drawn without animation: it is there the moment
 * the card scrolls into view, on any phone. Empty data shows an honest empty state.
 * Client component (recharts); pass plain data from the server page.
 */
export function ChartCard({ title, description, data, type = "bar", unit, summary, link, emptyTitle = "Nothing to show yet", emptyDescription, headingLevel, className }: ChartCardProps) {
  const empty = isEmptyChart(data);
  const config: ChartConfig = { value: { label: unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : title } };
  const rows = data.map((d) => ({ label: d.label, value: Number.isFinite(d.value) ? d.value : 0 }));
  const icon: LucideIcon = BarChart3;

  return (
    <SectionCard title={title} description={description} action={link} headingLevel={headingLevel} className={className}>
      {empty ? (
        <EmptyState size="sm" icon={icon} title={emptyTitle} description={emptyDescription ?? "The chart fills in as real activity comes in."} />
      ) : (
        <figure className="m-0">
          <figcaption className="sr-only">{summary ?? summarizeChart(title, rows, { unit })}</figcaption>
          <div aria-hidden="true">
            <ChartContainer config={config} className="aspect-auto h-[180px] w-full sm:h-[220px]">
              {type === "line" ? (
                <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} accessibilityLayer={false}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tick={TICK} />
                  <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={TICK} />
                  <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent indicator="line" />} />
                  <Line dataKey="value" type="monotone" stroke={ACCENT} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: ACCENT }} isAnimationActive={false} />
                </LineChart>
              ) : (
                <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} accessibilityLayer={false}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} tick={TICK} />
                  <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={TICK} />
                  <ChartTooltip cursor={{ fill: "var(--surface-subtle)" }} content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="value" fill={ACCENT} radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              )}
            </ChartContainer>
          </div>
        </figure>
      )}
    </SectionCard>
  );
}
