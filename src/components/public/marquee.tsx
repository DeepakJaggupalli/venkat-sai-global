import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ScrollRail, type RAIL_SPEED } from "./scroll-rail";

/**
 * Infinite horizontal rail (server wrapper around the client `ScrollRail`): the items are rendered here and handed
 * over as <li> children, so callers can keep passing render functions. The rail scrolls on its own, slowly, and
 * visitors can swipe, drag or scroll it; the duplicate copy is hidden from assistive technology. A surrounding
 * `PausableRails` adds a pause button (WCAG 2.2.2).
 */
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
  /** Accessible name for the rail. */
  label: string;
  reverse?: boolean;
  speed?: keyof typeof RAIL_SPEED;
  className?: string;
  itemClassName?: string;
}) {
  if (!items.length) return null;
  return (
    <ScrollRail label={label} reverse={reverse} speed={speed} className={className}>
      {items.map((item) => (
        <li key={itemKey(item)} className={cn("shrink-0", itemClassName)}>
          {render(item)}
        </li>
      ))}
    </ScrollRail>
  );
}
