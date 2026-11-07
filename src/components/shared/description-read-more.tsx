"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SafeHtml } from "./safe-html";

const CLAMP_CLASSES = { 3: "line-clamp-3", 4: "line-clamp-4", 6: "line-clamp-6", 8: "line-clamp-[8]" } as const;
const MAX_HEIGHT_CLASSES = { 3: "max-h-[4.5rem]", 4: "max-h-24", 6: "max-h-36", 8: "max-h-48" } as const;

type DescriptionWithReadMoreProps = {
  /** Sanitised HTML (rendered with SafeHtml). Use `children` for plain text instead. */
  html?: string | null;
  children?: ReactNode;
  /** Collapsed height in lines. */
  lines?: keyof typeof CLAMP_CLASSES;
  labels?: { more?: string; less?: string };
  className?: string;
};

/**
 * Long descriptions collapsed to a few lines with a "Read more" toggle. The toggle only appears when
 * the content actually overflows; the full text is always in the DOM (find-in-page and screen readers).
 *
 *   <DescriptionWithReadMore html={job.descriptionHtml} lines={6} />
 */
export function DescriptionWithReadMore({ html, children, lines = 4, labels, className }: DescriptionWithReadMoreProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, html, children]);

  // Rich text has block children, so a max-height mask works better than line-clamp for HTML.
  const collapsedClass = html ? cn(MAX_HEIGHT_CLASSES[lines], "overflow-hidden") : CLAMP_CLASSES[lines];

  return (
    <div data-slot="read-more" className={className}>
      <div
        id={contentId}
        ref={ref}
        className={cn("relative", !expanded && collapsedClass, !expanded && overflowing && html && "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]")}
      >
        {html ? <SafeHtml html={html} className="[&>*:first-child]:mt-0" /> : <div className="text-sm leading-6 whitespace-pre-line text-foreground/90">{children}</div>}
      </div>
      {overflowing || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 rounded-md text-sm font-medium text-teal-strong underline-offset-2 hover:underline"
        >
          {expanded ? (labels?.less ?? "Show less") : (labels?.more ?? "Read more")}
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      ) : null}
    </div>
  );
}
