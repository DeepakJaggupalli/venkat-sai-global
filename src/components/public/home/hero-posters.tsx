"use client";

import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { WhatsAppIcon } from "../contact-links";
import { POSTER_BUTTON_STYLES } from "../requirements/button-styles";

export type HeroPosterSlide = {
  id: string;
  href: string;
  applyHref: string;
  whatsappHref: string;
  title: string;
  countryName: string | null;
  /** Rendered on the server: the country flag and the poster image. */
  flag: ReactNode;
  image: ReactNode;
  /** First trades with pay, one line ("Welder · 1,800 AED"). */
  trades: string | null;
  applyLabel: string;
  whatsappLabel: string;
};

export type HeroPosterLabels = {
  eyebrow: string;
  nowHiring: string;
  apply: string;
  whatsapp: string;
  all: string;
  noFee: string;
  prev: string;
  next: string;
  pause: string;
  play: string;
  /** "Show requirement {n}" */
  goTo: string;
  /** "{n} of {total}" */
  slide: string;
};

/** How long each poster stays before the next one fades in. */
const SLIDE_MS = 4500;

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * Homepage hero card when requirement posters are published: the latest posters (whole, never cropped) fade one into
 * the next, with the requirement's country, title, trades and its own Apply and WhatsApp buttons. A thin line fills
 * while each poster shows; the line ending moves to the next poster, so hovering, focusing, Pause, being off screen
 * or a reduced-motion preference all simply hold the current one. Arrows and dots move by hand.
 */
export function HeroPosterSlider({ slides, labels, className }: { slides: readonly HeroPosterSlide[]; labels: HeroPosterLabels; className?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(true);
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const total = slides.length;
  const multi = total > 1;
  const running = multi && !reduced && !paused && !held && inView;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!total) return null;
  const slide = slides[active]!;
  const go = (index: number) => setActive((index + total) % total);

  return (
    <article
      ref={rootRef}
      aria-roledescription="carousel"
      aria-labelledby="hero-posters-title"
      className={className}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
      data-testid="hero-posters"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="hero-posters-title" className="label-dot">
          {labels.eyebrow}
        </h2>
        {multi ? (
          <div className="flex items-center gap-1.5">
            <span className="me-1 text-xs font-semibold tabular-nums text-muted-foreground" aria-hidden="true">
              {active + 1} / {total}
            </span>
            <button type="button" onClick={() => go(active - 1)} aria-label={labels.prev} className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-foreground transition-colors hover:border-foreground">
              <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </button>
            <button type="button" onClick={() => go(active + 1)} aria-label={labels.next} className="flex size-9 items-center justify-center rounded-full bg-foreground text-white transition-colors hover:bg-[#26262b]">
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative mt-5 h-[19rem] overflow-hidden rounded-2xl border border-border bg-surface-subtle sm:h-[22rem]">
        {slides.map((s, i) => (
          <Link
            key={s.id}
            href={s.href}
            tabIndex={i === active ? 0 : -1}
            aria-hidden={i === active ? undefined : true}
            aria-roledescription="slide"
            aria-label={`${fill(labels.slide, { n: i + 1, total })}: ${s.title}`}
            className={cn("absolute inset-0 transition-opacity duration-700 ease-out", i === active ? "z-10 opacity-100" : "pointer-events-none opacity-0")}
            data-testid="hero-poster-slide"
          >
            {s.image}
          </Link>
        ))}
        <span className="pointer-events-none absolute start-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-70 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          {labels.nowHiring}
        </span>
        {multi && !reduced ? (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 z-20 h-1 bg-black/10">
            <span
              key={`fill-${active}`}
              className="block h-full origin-left bg-teal rtl:origin-right"
              style={{ animation: `vsg-fill ${SLIDE_MS}ms linear forwards`, animationPlayState: running ? "running" : "paused" }}
              onAnimationEnd={() => go(active + 1)}
            />
          </span>
        ) : null}
      </div>

      <div key={slide.id} className="mt-5 min-h-[4.75rem] animate-in fade-in slide-in-from-bottom-1 duration-500" aria-live={running ? "off" : "polite"}>
        {slide.countryName ? (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {slide.flag}
            <bdi>{slide.countryName}</bdi>
          </p>
        ) : null}
        <p className="mt-1 line-clamp-1 font-heading text-lg font-bold tracking-tight text-foreground">
          <bdi>{slide.title}</bdi>
        </p>
        {slide.trades ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
            <bdi>{slide.trades}</bdi>
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={slide.applyHref} className={POSTER_BUTTON_STYLES.apply} aria-label={slide.applyLabel} data-testid="hero-poster-apply">
          {labels.apply}
          <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
        <a href={slide.whatsappHref} target="_blank" rel="noopener noreferrer" className={POSTER_BUTTON_STYLES.whatsapp} aria-label={slide.whatsappLabel} data-testid="hero-poster-whatsapp">
          <WhatsAppIcon className="text-green-strong" />
          {labels.whatsapp}
        </a>
      </div>

      {multi ? (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={fill(labels.goTo, { n: i + 1 })}
              aria-current={i === active ? "true" : undefined}
              className="flex h-6 items-center px-0.5"
            >
              <span className={cn("block h-1.5 rounded-full transition-all duration-300", i === active ? "w-6 bg-foreground" : "w-1.5 bg-border hover:bg-muted-foreground")} />
            </button>
          ))}
          {!reduced ? (
            <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? labels.play : labels.pause} className="ms-2 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground">
              {paused ? <Play aria-hidden="true" className="size-3.5" /> : <Pause aria-hidden="true" className="size-3.5" />}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{labels.noFee}</p>
        <Link href="/requirements" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
          {labels.all}
          <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      </div>
    </article>
  );
}
