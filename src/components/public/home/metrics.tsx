import { Info } from "lucide-react";

import type { PublicMetric } from "@/modules/content/types";

import { Section, SectionHeading } from "../section";
import { CountUp } from "./count-up";

function formatAsOf(asOf: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T00:00:00Z`) : new Date(asOf);
  if (Number.isNaN(date.getTime())) return asOf;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * Credibility figures. Renders ONLY values returned by `getPublicMetrics()` (live counts above their threshold
 * or admin-approved figures), each with its definition and "as of" date. Nothing renders when the list is empty.
 */
export function MetricsSection({ metrics, heading, intro }: { metrics: readonly PublicMetric[]; heading?: string | null; intro?: string | null }) {
  if (!metrics.length) return null;
  return (
    <Section tone="white" labelledBy="home-metrics-title" data-testid="home-metrics" className="py-14 sm:py-16 lg:py-20">
      <div data-reveal>
        <SectionHeading
          id="home-metrics-title"
          eyebrow="Venkat Sai in numbers"
          title={<span className="uppercase">{heading || "Measured, not claimed"}</span>}
          intro={intro || "Every figure below is counted from our platform records or approved against evidence, and shows the date it applies to."}
        />
      </div>
      <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <div key={m.key} data-reveal={String(Math.min(i + 1, 4))} className="lift flex flex-col rounded-2xl border-2 border-navy/10 border-t-yellow bg-white p-6">
            <dt className="order-2 mt-2 font-heading text-base font-bold text-navy">{m.label}</dt>
            <dd className="order-1 font-display text-5xl text-royal sm:text-6xl">
              <CountUp value={m.value} />
            </dd>
            <dd className="order-3 mt-2 text-sm leading-relaxed text-muted-foreground">{m.definition}</dd>
            <dd className="order-4 mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info aria-hidden="true" className="size-3.5" />
              {m.mode === "live" ? "Live count as of " : "As of "}
              {formatAsOf(m.asOf)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
