"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { CtaLink } from "../cta-link";

export type FinderPath = {
  key: string;
  label: string;
  tagline: string;
  steps: readonly string[];
  cta: { label: string; href: string; id: string };
  guide: { label: string; href: string };
  icon: ReactNode;
  photo: ReactNode;
};

/**
 * Homepage "Who are you?" chooser: one big button per kind of visitor (job seeker, company, travel agency,
 * recruitment partner, institution). Picking one shows, in plain words, what they get, their first three steps,
 * the button to start and a link to the full guide page. Keyboard: arrows move between the choices.
 */
export function PathFinder({ paths, labels, location }: { paths: readonly FinderPath[]; labels: { hint: string; steps: string }; location: string }) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const baseId = useId();
  if (!paths.length) return null;
  const path = paths[active]!;

  const pick = (index: number, focus = false) => {
    const i = (index + paths.length) % paths.length;
    setActive(i);
    setTouched(true);
    if (focus) document.getElementById(`${baseId}-tab-${i}`)?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const rtl = document.documentElement.dir === "rtl" || event.currentTarget.closest("[dir=rtl]") !== null;
    const step = (forward: boolean) => (forward !== rtl ? 1 : -1);
    const keys: Record<string, number> = {
      ArrowRight: active + step(true),
      ArrowLeft: active + step(false),
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      Home: 0,
      End: paths.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    pick(keys[event.key]!, true);
  };

  return (
    <div data-testid="path-finder">
      <div role="tablist" aria-label={labels.hint} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {paths.map((p, i) => {
          const selected = i === active;
          return (
            <button
              key={p.key}
              id={`${baseId}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => pick(i)}
              onKeyDown={onKey}
              data-path={p.key}
              className={cn(
                "group relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-start transition-all duration-200",
                selected
                  ? "-translate-y-1 border-navy bg-navy text-white shadow-[0_18px_40px_-18px_rgb(10_10_11/0.6)]"
                  : "border-border bg-white text-navy hover:-translate-y-1 hover:border-teal hover:shadow-[0_14px_30px_-20px_rgb(13_148_136/0.6)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 [&_svg]:size-5",
                  selected ? "bg-white/15 text-white" : "bg-teal-soft text-teal-strong",
                )}
              >
                {p.icon}
              </span>
              <span className="font-heading text-[15px] font-bold leading-snug">{p.label}</span>
              {!touched && i === 0 ? (
                <span aria-hidden="true" className="absolute end-3 top-3 flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-teal" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="mt-6 overflow-hidden rounded-3xl border border-border bg-white"
      >
        <div key={path.key} className="grid animate-in fade-in duration-300 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <div className="p-6 sm:p-9">
            <p className="font-heading text-2xl font-bold leading-tight tracking-tight text-navy sm:text-[1.75rem]">{path.tagline}</p>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-teal-strong">{labels.steps}</p>
            <ol className="relative mt-4 grid gap-3 sm:grid-cols-3">
              <span aria-hidden="true" className="absolute inset-x-8 top-5 hidden border-t-2 border-dashed border-teal/40 sm:block" />
              {path.steps.map((s, i) => (
                <li
                  key={s}
                  className="relative rounded-2xl bg-surface-subtle p-4 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
                  style={{ animationDelay: `${100 + i * 120}ms`, animationDuration: "420ms" }}
                >
                  <span aria-hidden="true" className="relative flex size-10 items-center justify-center rounded-full bg-teal font-heading text-sm font-bold text-white ring-4 ring-white">
                    {i + 1}
                  </span>
                  <p className="mt-3 text-[15px] font-medium leading-snug text-foreground">{s}</p>
                </li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CtaLink href={path.cta.href} cta={path.cta.id} location={`${location}_${path.key}`} variant="accent" arrow className="min-h-12 px-6 text-[15px]">
                {path.cta.label}
              </CtaLink>
              <CtaLink href={path.guide.href} cta={`${path.key}_guide`} location={`${location}_${path.key}`} variant="link" arrow>
                {path.guide.label}
              </CtaLink>
            </div>
          </div>
          <div className="relative hidden min-h-[20rem] lg:block">
            {path.photo}
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-navy/50 via-transparent to-transparent" />
            <span className="vsg-float absolute bottom-6 start-6 flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-navy shadow-lg [&_svg]:size-4 [&_svg]:text-teal-strong">
              {path.icon}
              {path.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
