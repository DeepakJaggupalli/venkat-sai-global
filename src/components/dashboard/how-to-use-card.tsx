"use client";

import { ArrowRight, BookOpenText, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { browserStorage, readHowToUseState, writeHowToUseState, type HowToUseState } from "./how-to-use-storage";

export type HowToUseCardStep = { title: string; description: string; href: string; icon?: ReactNode };

export type HowToUseCardProps = {
  /** Storage key: the choice to hide is remembered per portal. */
  portal: string;
  steps: readonly HowToUseCardStep[];
  guideHref: string;
  title: string;
  description: string;
};

// The remembered choice lives in localStorage; components re-read it when it changes (here or in another tab).
const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Client part of <HowToUse>: numbered steps, "Hide" / "Show how to use" remembered in localStorage. Expanded on a
 * first visit and whenever storage is unavailable. Use <HowToUse> (server) from pages; it fills in the steps.
 */
export function HowToUseCard({ portal, steps, guideHref, title, description }: HowToUseCardProps) {
  // The server (and the first client render) always shows the expanded card; the remembered choice follows.
  const remembered = useSyncExternalStore(
    subscribe,
    () => readHowToUseState(browserStorage(), portal),
    () => "shown" as HowToUseState,
  );
  // A choice made on this page wins, even when the browser refuses to store it.
  const [choice, setChoice] = useState<HowToUseState | null>(null);
  const state = choice ?? remembered;
  const panelId = useId();
  const headingId = useId();

  function toggle() {
    const next: HowToUseState = state === "shown" ? "hidden" : "shown";
    setChoice(next);
    if (writeHowToUseState(browserStorage(), portal, next)) listeners.forEach((listener) => listener());
  }

  const open = state === "shown";

  return (
    <section aria-labelledby={headingId} data-slot="how-to-use" data-state={state} className="@container rounded-[22px] border border-border bg-white shadow-card">
      <div className={cn("flex items-start gap-3 px-4 sm:px-5", open ? "pt-4 sm:pt-5" : "py-3 sm:py-3.5")}>
        <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-[18px]">
          <Lightbulb />
        </span>
        <div className="min-w-0 flex-1 self-center">
          <h2 id={headingId} className="font-heading text-lg leading-snug font-bold text-foreground">
            {title}
          </h2>
          {open ? <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-accent-text hover:bg-accent-soft/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {open ? "Hide" : "Show how to use"}
          {open ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
        </button>
      </div>

      <div id={panelId} hidden={!open}>
        {open ? (
          <div className="px-4 pt-4 pb-4 sm:px-5 sm:pb-5">
            <ol className="grid gap-2.5 @lg:grid-cols-2 @4xl:grid-cols-3">
              {steps.map((step, index) => (
                <li key={`${step.href}-${step.title}`} className="min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
                  <Link
                    href={step.href}
                    className="group/step flex h-full min-h-16 items-start gap-3 rounded-2xl border border-border bg-surface-subtle/60 p-3.5 transition-[background-color,border-color] duration-150 hover:border-[#d5dae2] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                  >
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-white tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[15px] leading-snug font-bold text-foreground">
                        {step.icon ? (
                          <span aria-hidden="true" className="text-accent-text [&_svg]:size-4">
                            {step.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 text-pretty">
                          <span className="sr-only">Step {index + 1}: </span>
                          {step.title}
                        </span>
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug text-pretty text-muted-foreground">{step.description}</span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/step:translate-x-0.5 group-hover/step:text-foreground motion-reduce:transition-none"
                    />
                  </Link>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={guideHref}
                className="group/guide inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <BookOpenText aria-hidden="true" className="size-4" />
                Open the full guide
              </Link>
            </div>
          </div>
        ) : null}
      </div>
      {!open ? (
        <div className="-mt-1 px-4 pb-3 sm:px-5">
          <Link href={guideHref} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-text hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <BookOpenText aria-hidden="true" className="size-4" />
            Open the full guide
          </Link>
        </div>
      ) : null}
    </section>
  );
}
