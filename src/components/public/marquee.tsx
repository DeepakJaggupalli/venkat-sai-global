import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Infinite horizontal rail (CSS only, server component). The list is rendered twice; the second copy is
 * hidden from assistive technology and, for reduced-motion visitors, not shown at all (the first copy wraps
 * into a static, centred row instead). Hovering or focusing inside pauses the motion, and a surrounding
 * `PausableRails` adds a pause button (WCAG 2.2.2). Edges fade out (mask).
 *
 * `speed` maps to a few fixed durations so no inline style is needed.
 */
const SPEED = {
  slow: "[--marquee-duration:90s]",
  normal: "[--marquee-duration:60s]",
  fast: "[--marquee-duration:40s]",
} as const;

export function Marquee<T>({
  items,
  render,
  itemKey,
  label,
  reverse = false,
  speed = "normal",
  className,
  itemClassName,
}: {
  items: readonly T[];
  render: (item: T) => ReactNode;
  itemKey: (item: T) => string;
  /** Accessible name for the list. */
  label: string;
  reverse?: boolean;
  speed?: keyof typeof SPEED;
  className?: string;
  itemClassName?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={cn("marquee-mask overflow-hidden", SPEED[speed], className)}>
      <div className="marquee-track" data-reverse={reverse ? "true" : undefined}>
        <ul aria-label={label} className="flex shrink-0 items-center motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center">
          {items.map((item) => (
            <li key={itemKey(item)} className={cn("shrink-0", itemClassName)}>
              {render(item)}
            </li>
          ))}
        </ul>
        <ul aria-hidden="true" data-marquee-copy className="flex shrink-0 items-center">
          {items.map((item) => (
            <li key={`copy-${itemKey(item)}`} className={cn("shrink-0", itemClassName)}>
              {render(item)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
