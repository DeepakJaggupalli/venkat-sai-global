import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { DashboardAction } from "./types";

/** Class strings of the DESIGN.md pills (44px tall: a comfortable phone target). */
export const PILL_BASE =
  "group/pill inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-center text-[15px] leading-tight font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0";
export const PILL_PRIMARY = "bg-foreground text-white hover:bg-navy-deep";
export const PILL_SECONDARY = "border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle";

/**
 * Black (primary) or white (secondary) pill link from DESIGN.md, with the arrow that nudges on hover.
 * Server-component friendly. External links open in a new tab and say so to screen readers.
 */
export function PillLink({ action, className, arrow = true }: { action: DashboardAction; className?: string; arrow?: boolean }) {
  const { label, href, icon: Icon, variant = "primary", external } = action;
  const classes = cn(PILL_BASE, variant === "primary" ? PILL_PRIMARY : PILL_SECONDARY, className);
  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="min-w-0">{label}</span>
      {external ? (
        <>
          <ArrowUpRight aria-hidden="true" className="opacity-70" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      ) : arrow ? (
        <ArrowRight aria-hidden="true" className="transition-transform duration-150 group-hover/pill:translate-x-0.5 motion-reduce:transition-none" />
      ) : null}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
