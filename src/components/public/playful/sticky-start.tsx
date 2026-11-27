"use client";

import { Rocket } from "lucide-react";
import { useEffect, useState } from "react";

import { CtaLink } from "../cta-link";

/**
 * A small "Ready to start?" pill at the bottom of a landing page. It appears once the visitor has scrolled past the
 * first screen and steps aside while the closing call-to-action band (marked `data-sticky-stop`) is on screen,
 * so it never covers the same button twice. Bottom-centre, clear of the WhatsApp button on the end side.
 */
export function StickyStart({ prompt, cta, location }: { prompt: string; cta: { label: string; href: string; id: string }; location: string }) {
  const [past, setPast] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const stops = Array.from(document.querySelectorAll("[data-sticky-stop]"));
    let observer: IntersectionObserver | null = null;
    if (stops.length && typeof IntersectionObserver !== "undefined") {
      const visible = new Set<Element>();
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setAtEnd(visible.size > 0);
      });
      stops.forEach((s) => observer!.observe(s));
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  if (!past || atEnd) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-20 print:hidden" data-testid="sticky-start">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-white/95 py-1.5 ps-4 pe-1.5 shadow-[0_12px_40px_-12px_rgb(10_10_11/0.35)] backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Rocket aria-hidden="true" className="hidden size-4 text-teal-strong sm:block" />
        <span className="hidden text-sm font-semibold text-navy sm:inline">{prompt}</span>
        <CtaLink href={cta.href} cta={cta.id} location={`${location}_sticky`} variant="accent" arrow className="min-h-10 px-4 text-sm">
          {cta.label}
        </CtaLink>
      </div>
    </div>
  );
}
