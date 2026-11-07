import { ArrowDown } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatPercent } from "@/lib/format";
import type { FunnelResult, FunnelStepResult } from "@/modules/analytics/types";

import { widthClass } from "./ranked-list";

/** "event page_view on /jobs/*" — what a step matches, in words. */
export function describeStepMatch(match: FunnelStepResult["match"]): string {
  const parts: string[] = [];
  if (match.event) parts.push(`event ${match.event}`);
  if (match.path) parts.push(match.path.endsWith("*") ? `path starting ${match.path.slice(0, -1)}` : `path ${match.path}`);
  if (match.props && Object.keys(match.props).length) {
    parts.push(
      `where ${Object.entries(match.props)
        .map(([k, v]) => `${k} = ${String(v)}`)
        .join(", ")}`,
    );
  }
  return parts.join(" · ");
}

/**
 * Funnel visualisation: one bar per step (share of the people who entered), with the drop-off between
 * steps spelled out. Bars use a single hue; every number is printed, so nothing depends on colour.
 */
export function FunnelChart({ result, unit }: { result: FunnelResult; unit?: string }) {
  const noun = unit ?? (result.groupBy === "session" ? "sessions" : "visitors");
  if (!result.entered) {
    return (
      <EmptyState
        size="sm"
        title="Nobody entered this funnel in the period"
        description="Choose a longer period, or check that the first step matches an event or page that is being recorded."
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{result.entered.toLocaleString("en-IN")}</span> {noun} entered ·{" "}
        <span className="font-semibold text-foreground tabular-nums">{result.completed.toLocaleString("en-IN")}</span> completed ·{" "}
        <span className="font-semibold text-foreground tabular-nums">{formatPercent(result.overallConversion)}</span> overall conversion · steps within{" "}
        {result.windowDays} {result.windowDays === 1 ? "day" : "days"} of the first
      </p>
      <ol aria-label="Funnel steps" className="space-y-1">
        {result.steps.map((step) => (
          <li key={step.index}>
            {step.index > 0 ? (
              <p className="flex items-center gap-2 py-1 pl-1 text-xs text-muted-foreground">
                <ArrowDown className="size-3.5" aria-hidden="true" />
                {step.dropOff.toLocaleString("en-IN")} dropped off ({formatPercent(step.dropOffRate)}) · {formatPercent(step.conversionFromPrevious)} continued
              </p>
            ) : null}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">
                  <span className="mr-2 text-muted-foreground tabular-nums">{step.index + 1}.</span>
                  {step.label}
                </p>
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">{step.count.toLocaleString("en-IN")}</span> {noun} ·{" "}
                  <span className="text-muted-foreground">{formatPercent(step.conversionFromStart)} of entrants</span>
                </p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{describeStepMatch(step.match)}</p>
              <div className="mt-2 h-2.5 rounded-full bg-secondary" aria-hidden="true">
                <div className={`h-2.5 rounded-full bg-teal ${widthClass(step.conversionFromStart * 100)}`} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
