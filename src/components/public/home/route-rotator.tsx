"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { ARC, ARC_PATH, FLIGHT_START_MS, PLANE_PATH, VIEW_H, VIEW_W, flightFrame, planeTransform } from "./flight-path";

export type RouteDestination = { id: string; city: string; country: string; flag: ReactNode };

/** Longest frame step counted (a background tab or a slow phone never makes the plane jump ahead). */
const MAX_FRAME_MS = 64;

/** Where the plane rests when nothing moves (server render, reduced motion): mid-route, level. */
const STATIC_PLANE = planeTransform(0.5);

/**
 * The hero route card frame (an <article>): the header, then the route. A small plane flies along a dashed arc from
 * the origin (start edge) to the destination (end edge); as it lands, the next city, country and flag crossfade in.
 * One destination every ~2.2 s (flight-path.ts has the timing and the curve).
 *
 * - The plane moves with an SVG transform from requestAnimationFrame (transform and opacity only); the cities sit in
 *   one grid cell (the cell keeps the size of the longest), so nothing on the page moves or jumps.
 * - It pauses while the card is hovered or focused and while it is off screen, and never runs for reduced-motion
 *   visitors (or before hydration): they see the plane mid-route and the first destination.
 * - The route is decorative (aria-hidden); screen readers get the static `srText` list instead of live announcements.
 * - Right-to-left pages mirror the arc, so the plane still flies from the origin to the destination.
 */
export function RouteRotator({
  destinations,
  srText,
  className,
  header,
  origin,
  footer,
}: {
  destinations: readonly RouteDestination[];
  srText: string;
  className?: string;
  header: ReactNode;
  /** Origin label (flag first, at the start edge, under the start of the arc). */
  origin: ReactNode;
  footer: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const planeRef = useRef<SVGGElement>(null);
  const elapsed = useRef(FLIGHT_START_MS);
  const shown = useRef(0);
  const count = destinations.length;
  const running = !held && !reduced && onScreen && count > 1;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) elapsed.current += Math.min(Math.max(now - last, 0), MAX_FRAME_MS);
      last = now;
      const state = flightFrame(elapsed.current);
      const plane = planeRef.current;
      if (plane) {
        plane.setAttribute("transform", planeTransform(state.progress));
        plane.style.opacity = state.opacity.toFixed(3);
      }
      const next = state.step % count;
      if (next !== shown.current) {
        shown.current = next;
        setIndex(next);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [running, count]);

  const active = index < count ? index : 0;

  return (
    <article
      ref={cardRef}
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
      <div className="mt-5 sm:mt-6">
        {/* The arc runs from the centre of the origin flag to the centre of the destination flag (12px in from each edge). */}
        <div aria-hidden="true" className="relative mx-3 aspect-[6/1] rtl:-scale-x-100" data-testid="route-flight">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 size-full overflow-visible" focusable="false">
            <path d={ARC_PATH} fill="none" stroke="#c9cdd5" strokeWidth={1.5} strokeDasharray="4 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <circle cx={ARC.start.x} cy={ARC.start.y} r={6} fill="#0a0a0b" />
            <circle cx={ARC.end.x} cy={ARC.end.y} r={6} fill="#0ea5e9" />
            <g ref={planeRef} transform={STATIC_PLANE}>
              <path d={PLANE_PATH} transform="scale(1.25)" fill="#0369a1" stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" />
            </g>
          </svg>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">{origin}</div>
          <div className="grid min-w-0 justify-items-end text-end" aria-hidden="true">
            {destinations.map((d, i) => (
              <div
                key={d.id}
                className={cn(
                  "col-start-1 row-start-1 transition-[opacity,translate] ease-out motion-reduce:transition-none",
                  i === active ? "translate-y-0 opacity-100 delay-100 duration-300" : "pointer-events-none translate-y-1 opacity-0 delay-0 duration-150",
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
      </div>
      <p className="sr-only">{srText}</p>
      {footer}
    </article>
  );
}
