import { Info } from "lucide-react";

import type { PublicMetric } from "@/modules/content/types";

import { EN_MARKETING, intlLocale, type MarketingT } from "../marketing-i18n";
import { Section, SectionHeading, type SectionTone } from "../section";
import { CountUp } from "./count-up";

function formatAsOf(asOf: string, locale: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T00:00:00Z`) : new Date(asOf);
  if (Number.isNaN(date.getTime())) return asOf;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * Credibility figures. Renders ONLY values returned by `getPublicMetrics()` (live counts above their threshold
 * or admin-approved figures), each with its definition and "as of" date. Nothing renders when the list is empty.
 */
export function MetricsSection({ tone = "white", metrics, heading, intro, t = EN_MARKETING }: { metrics: readonly PublicMetric[]; heading?: string | null; intro?: string | null; t?: MarketingT } & { tone?: SectionTone }) {
  if (!metrics.length) return null;
  return (
    <Section tone={tone} labelledBy="home-metrics-title" data-testid="home-metrics" className="py-14 sm:py-16 lg:py-20">
      <div data-reveal>
        <SectionHeading
          id="home-metrics-title"
          eyebrow={t("metrics.eyebrow")}
          title={heading || t("metrics.title")}
          intro={intro || t("metrics.intro")}
        />
      </div>
      <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <div key={m.key} data-reveal={String(Math.min(i + 1, 4))} className="card-surface flex flex-col rounded-2xl p-6 sm:p-7">
            <dt className="order-2 mt-3 font-heading text-base font-bold text-foreground">{m.label}</dt>
            <dd className="order-1 font-display text-5xl text-foreground tabular-nums sm:text-6xl">
              <CountUp value={m.value} />
            </dd>
            <dd className="order-3 mt-2 text-sm leading-relaxed text-muted-foreground">{m.definition}</dd>
            <dd className="order-4 mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info aria-hidden="true" className="size-3.5" />
              {t(m.mode === "live" ? "metrics.liveAsOf" : "metrics.asOf", { date: formatAsOf(m.asOf, intlLocale(t.locale)) })}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
