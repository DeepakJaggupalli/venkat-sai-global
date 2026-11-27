"use client";

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { CtaLink } from "../cta-link";

export type FitLabels = {
  /** Above the options ("Tap everything that describes you"). */
  hint: string;
  /** Before anything is ticked. */
  none: string;
  /** Once one or more are ticked. */
  yes: string;
};

/**
 * "Who can join" as a quick self-check: tap the lines that describe you; a meter fills and, from the first tick,
 * an encouraging line and the start button pop in. Purely a guide on the page: nothing is saved or sent.
 */
export function FitChecker({ items, labels, cta, location }: { items: readonly string[]; labels: FitLabels; cta: { label: string; href: string; id: string }; location: string }) {
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set());
  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const count = picked.size;
  return (
    <div className="rounded-3xl border border-border bg-white p-5 shadow-[0_20px_50px_-35px_rgb(10_10_11/0.4)] sm:p-6" data-testid="fit-checker">
      <p className="text-sm font-medium text-muted-foreground">{labels.hint}</p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map((item, i) => {
          const on = picked.has(i);
          return (
            <li key={item}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i)}
                className={cn(
                  "flex h-full w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-start text-[15px] leading-snug transition-all duration-200",
                  on ? "border-teal bg-teal-soft text-navy" : "border-border bg-white text-foreground hover:-translate-y-0.5 hover:border-teal/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    on ? "border-teal bg-teal text-white" : "border-border bg-white",
                  )}
                >
                  {on ? <Check className="vsg-pop size-3.5" /> : null}
                </span>
                <span>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex items-center gap-3">
        <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-subtle">
          <span className="block h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${items.length ? (count / items.length) * 100 : 0}%` }} />
        </span>
        <span aria-hidden="true" className="font-heading text-sm font-bold tabular-nums text-teal-strong">
          {count}/{items.length}
        </span>
      </div>
      <div aria-live="polite" className="mt-4 min-h-12">
        {count ? (
          <div key="yes" className="vsg-pop flex flex-wrap items-center gap-3 rounded-2xl bg-navy p-4 text-white">
            <Sparkles aria-hidden="true" className="size-5 shrink-0 text-teal-soft" />
            <p className="flex-1 text-[15px] font-semibold">{labels.yes}</p>
            <CtaLink href={cta.href} cta={cta.id} location={`${location}_fit_checker`} variant="accent" arrow>
              {cta.label}
            </CtaLink>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{labels.none}</p>
        )}
      </div>
    </div>
  );
}
