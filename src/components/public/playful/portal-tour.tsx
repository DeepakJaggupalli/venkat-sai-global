"use client";

import { Check, Lock, MousePointerClick, PartyPopper } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { CtaLink } from "../cta-link";

export type TourArea = { id: string; topic: string; summary: string; steps: readonly string[]; links: readonly string[]; icon: ReactNode };

export type TourLabels = {
  /** "You have looked at {n} of {total} areas" */
  explored: string;
  howTo: string;
  /** Shown once every area was opened. */
  allDone: string;
  /** Small label on the area list ("Click any area"). */
  clickHint: string;
  /** Badge on the browser bar ("Preview"). */
  preview: string;
  /** Where these appear ("Menu items in the portal"). */
  linksLabel: string;
};

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * A clickable preview of a portal (from the portal's "How to use" guide): a browser frame with the portal's areas
 * down the side and, for the open area, what it is for, how to use it step by step and the menu items it uses.
 * A pulsing dot marks the next area not yet opened and a bar counts how many have been explored. Nothing here
 * signs anyone in; it only explains what the portal holds.
 */
export function PortalTour({
  areas,
  path,
  labels,
  cta,
  location,
}: {
  areas: readonly TourArea[];
  /** Portal path shown in the address bar ("/talent"). */
  path: string;
  labels: TourLabels;
  cta: { label: string; href: string; id: string };
  location: string;
}) {
  const [active, setActive] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([0]));
  const baseId = useId();
  if (!areas.length) return null;
  const area = areas[active]!;
  const nextUnvisited = areas.findIndex((_, i) => !visited.has(i));
  const allSeen = nextUnvisited === -1;

  const open = (index: number, focus = false) => {
    const i = (index + areas.length) % areas.length;
    setActive(i);
    setVisited((prev) => (prev.has(i) ? prev : new Set([...prev, i])));
    if (focus) document.getElementById(`${baseId}-tab-${i}`)?.focus();
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: areas.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    open(keys[event.key]!, true);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-[0_30px_80px_-40px_rgb(10_10_11/0.45)]" data-testid="portal-tour">
      <div className="flex items-center gap-3 border-b border-border bg-surface-subtle px-4 py-3">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#f87171]" />
          <span className="size-3 rounded-full bg-[#fbbf24]" />
          <span className="size-3 rounded-full bg-[#34d399]" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate" dir="ltr">
            venkatsaiglobal{path}
          </span>
        </span>
        <span className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-strong">{labels.preview}</span>
      </div>

      <div className="grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="border-b border-border bg-surface-subtle/60 p-3 md:border-b-0 md:border-e">
          <p className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
            <MousePointerClick aria-hidden="true" className="size-3.5" />
            {labels.clickHint}
          </p>
          <div role="tablist" aria-orientation="vertical" className="grid gap-1">
            {areas.map((a, i) => {
              const selected = i === active;
              return (
                <button
                  key={a.id}
                  id={`${baseId}-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => open(i)}
                  onKeyDown={onKey}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm transition-colors",
                    selected ? "bg-white font-semibold text-navy shadow-sm ring-1 ring-teal/40" : "text-foreground/80 hover:bg-white hover:text-navy",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                      selected ? "bg-teal text-white" : "bg-white text-teal-strong ring-1 ring-border",
                    )}
                  >
                    {a.icon}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{a.topic}</span>
                  {visited.has(i) && !selected ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-teal-strong" /> : null}
                  {i === nextUnvisited ? (
                    <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-70" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-teal" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${active}`} className="flex min-h-[22rem] flex-col p-6 sm:p-8">
          <div key={active} className="flex-1 animate-in fade-in slide-in-from-right-4 duration-300 rtl:slide-in-from-left-4">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="vsg-pop flex size-12 items-center justify-center rounded-2xl bg-teal-soft text-teal-strong [&_svg]:size-6">
                {area.icon}
              </span>
              <div>
                <h3 className="font-heading text-xl font-bold tracking-tight text-navy">{area.topic}</h3>
                <p className="text-sm text-muted-foreground">{area.summary}</p>
              </div>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-teal-strong">{labels.howTo}</p>
            <ol className="mt-3 grid gap-2.5">
              {area.steps.map((s, i) => (
                <li
                  key={s}
                  className="flex gap-3 rounded-xl bg-surface-subtle/70 px-3.5 py-2.5 text-[15px] leading-relaxed text-foreground animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                  style={{ animationDelay: `${80 + i * 90}ms`, animationDuration: "380ms" }}
                >
                  <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white font-heading text-xs font-bold text-teal-strong ring-1 ring-teal/30">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {area.links.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{labels.linksLabel}</span>
                {area.links.map((l) => (
                  <span key={l} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-navy ring-1 ring-border">
                    {l}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-border pt-5">
            <div className="min-w-[12rem] flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground" aria-live="polite">
                {allSeen ? <PartyPopper aria-hidden="true" className="vsg-pop size-4 text-teal-strong" /> : null}
                {allSeen ? labels.allDone : fill(labels.explored, { n: visited.size, total: areas.length })}
              </p>
              <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                <span className="block h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${(visited.size / areas.length) * 100}%` }} />
              </span>
            </div>
            <CtaLink href={cta.href} cta={cta.id} location={`${location}_portal_tour`} variant={allSeen ? "accent" : "outline"} arrow>
              {cta.label}
            </CtaLink>
          </div>
        </div>
      </div>
    </div>
  );
}
