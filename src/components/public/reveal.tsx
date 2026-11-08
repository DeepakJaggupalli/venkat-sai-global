"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Scroll-reveal scope. Descendants marked `data-reveal` (optionally `data-reveal="2"`…`"4"` for a stagger)
 * fade and rise into view once they enter the viewport. Content is fully visible without JavaScript and
 * for visitors who prefer reduced motion: the hiding class is only added after mount, and the global
 * reduced-motion CSS keeps revealed state static.
 */
export function RevealScope({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!targets.length) return;
    root.classList.add("js-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => {
      observer.disconnect();
      root.classList.remove("js-reveal");
    };
  }, []);
  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
