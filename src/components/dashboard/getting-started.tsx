import { ArrowRight, Check, Rocket } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { checklistProgress, nextChecklistItem } from "./checklist";
import { SectionCard } from "./section-card";
import type { ChecklistItem } from "./types";

export type GettingStartedProps = {
  /** Steps with `done` computed by the caller from real data (profile filled, first job posted…). */
  items: readonly ChecklistItem[];
  title?: string;
  description?: string;
  headingLevel?: "h2" | "h3";
  className?: string;
};

/**
 * Set-up checklist with a progress bar; each step links to where it is done. Hides itself once every
 * step is done (and when there are none). Server component.
 */
export function GettingStarted({ items, title = "Getting started", description, headingLevel, className }: GettingStartedProps) {
  const progress = checklistProgress(items);
  if (progress.complete) return null;
  const next = nextChecklistItem(items);
  return (
    <SectionCard
      title={title}
      icon={Rocket}
      headingLevel={headingLevel}
      description={description ?? `${progress.done} of ${progress.total} done. Finish these so everything works for you.`}
      className={className}
    >
      <div className="flex items-center gap-3">
        <progress
          value={progress.done}
          max={progress.total}
          aria-label={`${title}: ${progress.done} of ${progress.total} done`}
          className="h-2 w-full flex-1 appearance-none overflow-hidden rounded-full bg-surface-subtle [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent-fill [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-subtle [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent-fill"
        />
        <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{progress.percent}%</span>
      </div>
      <ol className="mt-4 divide-y divide-border">
        {items.map((item) => {
          const isNext = item === next;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group/gs -mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    item.done ? "border-accent-fill bg-accent-fill text-white" : isNext ? "border-foreground" : "border-[#c9cdd5]",
                  )}
                >
                  {item.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[15px] leading-snug font-semibold text-pretty", item.done ? "text-muted-foreground" : "text-foreground")}>
                    {item.label}
                    <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                  </span>
                  {item.description && !item.done ? <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{item.description}</span> : null}
                </span>
                {isNext ? (
                  <span className="hidden shrink-0 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-white sm:inline">Next step</span>
                ) : null}
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-hover/gs:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
