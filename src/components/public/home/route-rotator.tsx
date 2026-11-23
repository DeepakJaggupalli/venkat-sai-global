"use client";

import { useEffect, useState, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export type RouteDestination = { id: string; city: string; country: string; flag: ReactNode };

const INTERVAL_MS = 3500;

/**
 * The hero route card frame (an <article>) with its rotating destination: one city at a time with a gentle
 * crossfade every ~3.5 s, between the origin and connector slots and the footer.
 * All cities sit in the same grid cell (the cell keeps the size of the longest), so nothing jumps. Rotation pauses
 * while the card is hovered or focused and never runs for reduced-motion visitors. The visible text is
 * decorative (aria-hidden); screen readers get the static `srText` list instead of live announcements.
 */
export function RouteRotator({
  destinations,
  srText,
  className,
  header,
  origin,
  connector,
  footer,
}: {
  destinations: readonly RouteDestination[];
  srText: string;
  className?: string;
  header: ReactNode;
  origin: ReactNode;
  connector: ReactNode;
  footer: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (held || reduced || destinations.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % destinations.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [held, reduced, destinations.length]);

  return (
    <article
      className={className}
      aria-labelledby="hero-card-title"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
      data-testid="hero-route-card"
    >
      {header}
      <div className="mt-8 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        {origin}
        {connector}
        <div className="grid text-end" aria-hidden="true">
          {destinations.map((d, i) => (
            <div
              key={d.id}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-700 ease-out motion-reduce:transition-none",
                i === index ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <p className="flex items-center justify-end gap-2 font-display text-xl text-foreground">
                {d.city}
                {d.flag}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{d.country}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">{srText}</p>
      {footer}
    </article>
  );
}
