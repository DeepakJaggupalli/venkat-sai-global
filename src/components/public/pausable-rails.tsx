"use client";

import { Pause, Play } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Wraps one or more scrolling rails (`Marquee`) with a small pause/play button, so the motion can be stopped by
 * keyboard and touch users too (WCAG 2.2.2). The rails also pause on hover and focus; the button is hidden for
 * visitors who prefer reduced motion, because the rails are static for them already.
 */
export function PausableRails({ children, className, label = "scrolling lists" }: { children: ReactNode; className?: string; label?: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={cn("relative", className)} data-paused={paused ? "true" : undefined}>
      {children}
      <div className="container-page mt-6 flex justify-end motion-reduce:hidden">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {paused ? <Play aria-hidden="true" className="size-3.5" /> : <Pause aria-hidden="true" className="size-3.5" />}
          <span className="sr-only">{paused ? `Play the ${label}` : `Pause the ${label}`}</span>
        </button>
      </div>
    </div>
  );
}
