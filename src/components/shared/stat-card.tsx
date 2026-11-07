import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { deltaDirection, deltaTone, describeDelta, formatDelta, formatStatValue, type StatDelta } from "./stat-utils";
import { TONE_STYLES } from "./tones";

type StatCardProps = {
  /** Sentence case, no trailing colon (e.g. "Open jobs"). */
  label: string;
  /** The figure — always from props (live counts or admin-approved entries). null renders "—". */
  value: number | string | null | undefined;
  /** Unit after the value, e.g. "days" or "%". */
  unit?: string;
  /** Compact large numbers: "auto" (≥ 10,000), always, or never. */
  compact?: boolean | "auto";
  delta?: StatDelta;
  /** Short helper line, e.g. definition or source. */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Makes the whole card a link to the underlying list. */
  href?: string;
  /** "As of" date for curated figures (public metrics must carry one). */
  asOf?: Date | string | null;
  locale?: string;
  className?: string;
};

/**
 * KPI tile: label · value · optional delta (direction × whether up is good) · hint.
 * Values use proportional figures (no tabular-nums) per the figure contract.
 *
 *   <StatCard label="Applications this week" value={counts.week} delta={{ value: 0.12, period: "vs last week" }} href="/employer/applications" />
 */
export function StatCard({ label, value, unit, compact = "auto", delta, hint, icon, href, asOf, locale, className }: StatCardProps) {
  const display = formatStatValue(value, { compact, locale });
  const missing = display === "—";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-strong [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5 text-foreground">
        <span className="font-sans text-[1.75rem] leading-none font-semibold tracking-tight">{display}</span>
        {missing ? <span className="sr-only">Not available</span> : null}
        {unit && !missing ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {delta ? <StatDeltaLine delta={delta} locale={locale} /> : null}
      {hint || asOf ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {hint}
          {hint && asOf ? " · " : null}
          {asOf ? `As of ${formatDate(asOf)}` : null}
        </p>
      ) : null}
      {href ? <ChevronRight aria-hidden="true" className="absolute right-3 bottom-3 size-4 text-muted-foreground transition-transform group-hover/stat:translate-x-0.5" /> : null}
    </>
  );
  const shell = cn(
    "group/stat relative flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs sm:p-5",
    href && "transition-colors hover:border-teal/40 hover:bg-surface-subtle/60 focus-visible:outline-2 focus-visible:outline-offset-2",
    className,
  );
  if (href) {
    return (
      <Link href={href} data-slot="stat-card" className={shell}>
        {body}
      </Link>
    );
  }
  return (
    <div data-slot="stat-card" className={shell}>
      {body}
    </div>
  );
}

function StatDeltaLine({ delta, locale }: { delta: StatDelta; locale?: string }) {
  const direction = deltaDirection(delta.value);
  const tone = deltaTone(direction, delta.goodDirection);
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", TONE_STYLES[tone].text)}>
        <Icon aria-hidden="true" className="size-3.5" />
        <span aria-hidden="true">{formatDelta(delta, locale)}</span>
      </span>
      {delta.period ? (
        <span aria-hidden="true" className="text-muted-foreground">
          {delta.period}
        </span>
      ) : null}
      <span className="sr-only">{describeDelta(delta, locale)}</span>
    </p>
  );
}

type StatGridProps = { children: ReactNode; columns?: 2 | 3 | 4; className?: string };

const GRID_COLUMNS: Record<NonNullable<StatGridProps["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
};

/** Responsive grid for StatCards: one column on phones, up to `columns` on wide screens. */
export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  return <div className={cn("grid grid-cols-1 gap-4", GRID_COLUMNS[columns], className)}>{children}</div>;
}
