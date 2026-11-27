"use client";

import { ArrowLeft, ArrowRight, Check, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { CtaLink } from "../cta-link";

export type WalkthroughStep = { title: string; description: string; icon: ReactNode };

export type WalkthroughLabels = {
  /** "Step {n} of {total}" */
  stepOf: string;
  next: string;
  back: string;
  pause: string;
  play: string;
  /** Shown on the last step above the finish button. */
  ready: string;
  /** Small hint above the step list. */
  hint: string;
};

/** How long each step stays before the walkthrough moves on by itself. */
const STEP_MS = 5200;

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * "How it works" as a guided walkthrough: the steps on the start side (tabs), the open step on the end side with a
 * big icon, what happens, a mini checklist of the steps done so far and Back / Next. It moves on by itself while
 * on screen (a progress line fills under the open step; the line ending is what advances it, so pausing pauses
 * both), stops on the last step and never runs for reduced-motion visitors. Hover, focus or Pause hold it.
 */
export function StepWalkthrough({
  steps,
  labels,
  finish,
  location,
}: {
  steps: readonly WalkthroughStep[];
  labels: WalkthroughLabels;
  finish: { label: string; href: string; id: string };
  location: string;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(false);
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const last = steps.length - 1;
  const running = !reduced && !paused && !held && inView && active < last;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!steps.length) return null;
  const step = steps[active]!;

  const go = (index: number, focus = false) => {
    const next = Math.max(0, Math.min(last, index));
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowDown: active + 1, ArrowRight: active + 1, ArrowUp: active - 1, ArrowLeft: active - 1, Home: 0, End: last };
    if (!(event.key in keys)) return;
    event.preventDefault();
    go(keys[event.key]!, true);
  };

  return (
    <div
      ref={rootRef}
      className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
      data-testid="step-walkthrough"
    >
      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">{labels.hint}</p>
        <div role="tablist" aria-orientation="vertical" className="grid gap-2.5">
          {steps.map((s, i) => {
            const selected = i === active;
            const done = i < active;
            return (
              <button
                key={s.title}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${i}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => go(i)}
                onKeyDown={onTabKey}
                className={cn(
                  "group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border px-4 py-3.5 text-start transition-all duration-200",
                  selected
                    ? "border-teal bg-white shadow-[0_10px_30px_-12px_rgb(13_148_136/0.45)]"
                    : "border-border bg-white/70 hover:-translate-y-0.5 hover:border-teal/50 hover:bg-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold transition-colors",
                    selected ? "bg-teal text-white" : done ? "bg-teal-soft text-teal-strong" : "bg-surface-subtle text-muted-foreground group-hover:bg-teal-soft group-hover:text-teal-strong",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("font-heading text-[15px] font-semibold leading-snug", selected ? "text-navy" : "text-foreground")}>{s.title}</span>
                {selected && !reduced && active < last ? (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-teal-soft">
                    <span
                      key={`fill-${active}`}
                      className="block h-full origin-left bg-teal rtl:origin-right"
                      style={{ animation: `vsg-fill ${STEP_MS}ms linear forwards`, animationPlayState: running ? "running" : "paused" }}
                      onAnimationEnd={() => go(active + 1)}
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-teal-soft via-white to-white p-7 sm:p-9"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-teal/10 blur-2xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -start-10 size-48 rounded-full bg-teal/5 blur-2xl" />
        <div key={active} className="relative animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="vsg-float flex size-16 items-center justify-center rounded-2xl bg-white text-teal-strong shadow-[0_12px_30px_-14px_rgb(13_148_136/0.6)] [&_svg]:size-8">
              {step.icon}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-strong ring-1 ring-teal/30">
              {fill(labels.stepOf, { n: active + 1, total: steps.length })}
            </span>
          </div>
          <h3 className="mt-6 font-heading text-2xl font-bold tracking-tight text-navy sm:text-[1.7rem]">{step.title}</h3>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-foreground/80">{step.description}</p>

          <ol aria-hidden="true" className="mt-7 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  i < active ? "bg-teal text-white" : i === active ? "bg-white text-navy ring-2 ring-teal" : "bg-white/70 text-muted-foreground ring-1 ring-border",
                )}
              >
                {i < active ? <Check className="size-3" /> : <span className="font-bold">{i + 1}</span>}
                <span className="max-w-[11rem] truncate">{s.title}</span>
              </li>
            ))}
          </ol>

          {active === last ? (
            <div className="vsg-pop mt-8 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-teal/30">
              <Sparkles aria-hidden="true" className="size-6 text-teal-strong" />
              <p className="flex-1 font-heading text-base font-semibold text-navy">{labels.ready}</p>
              <CtaLink href={finish.href} cta={finish.id} location={`${location}_walkthrough`} variant="accent" arrow>
                {finish.label}
              </CtaLink>
            </div>
          ) : null}
        </div>

        <div className="relative mt-8 flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition-colors hover:border-teal disabled:opacity-40"
          >
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            {labels.back}
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            disabled={active === last}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-navy px-4 text-sm font-semibold text-white transition-colors hover:bg-foreground disabled:opacity-40"
          >
            {labels.next}
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </button>
          {!reduced && active < last ? (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="ms-auto inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
              {paused ? labels.play : labels.pause}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
