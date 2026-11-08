"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated counter for approved public metrics. Server HTML (and assistive technology, via the sr-only copy)
 * always carries the real value; the visible digits count up once when scrolled into view, unless the visitor
 * prefers reduced motion.
 */
export function CountUp({ value, locale = "en-IN" }: { value: number; locale?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const nf = new Intl.NumberFormat(locale);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1400;
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref}>
      <span aria-hidden="true" className="tabular-nums">
        {nf.format(shown)}
      </span>
      <span className="sr-only">{nf.format(value)}</span>
    </span>
  );
}
