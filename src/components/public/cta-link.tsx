"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";

export type CtaVariant = "primary" | "accent" | "outline" | "onDark" | "link" | "linkOnDark";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 [&_svg]:size-4 [&_svg]:shrink-0";

/** Call-to-action styles for the marketing pages (sizes larger than portal buttons; AA contrast on each surface). */
export const CTA_STYLES: Record<CtaVariant, string> = {
  primary: `${BASE} bg-navy text-white hover:bg-navy-deep`,
  // Navy text on gold: 7.7:1.
  accent: `${BASE} bg-gold text-navy hover:bg-[color-mix(in_oklab,var(--brand-gold),white_18%)]`,
  outline: `${BASE} border border-navy/20 bg-white text-navy hover:border-navy/40 hover:bg-surface-subtle`,
  onDark: `${BASE} border border-white/30 bg-white/5 text-white hover:border-white/60 hover:bg-white/10`,
  link: "inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-teal-strong underline-offset-4 hover:underline [&_svg]:size-4",
  linkOnDark: "inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-white underline-offset-4 hover:underline [&_svg]:size-4",
};

export function isExternalLink(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export type CtaLinkProps = {
  href: string;
  children: ReactNode;
  /** Stable, non-personal identifier for analytics (e.g. "hire_through_venkat_sai"). */
  cta: string;
  /** Where on the page the CTA sits (e.g. "hero", "cta_band"). */
  location: string;
  variant?: CtaVariant;
  /** Show a trailing arrow (default for link variants). */
  arrow?: boolean;
  className?: string;
  "data-testid"?: string;
};

/**
 * A tracked call-to-action link: records `cta_click { cta, location }` (consent-gated by the analytics tracker)
 * and navigates. External http(s) links open in a new tab with an announced hint.
 */
export function CtaLink({ href, children, cta, location, variant = "primary", arrow, className, ...rest }: CtaLinkProps) {
  const external = isExternalLink(href);
  const showArrow = arrow ?? (variant === "link" || variant === "linkOnDark");
  const onClick = () => track("cta_click", { cta, location });
  const content = (
    <>
      {children}
      {external ? (
        <>
          <ArrowUpRight aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      ) : showArrow ? (
        <ArrowRight aria-hidden="true" />
      ) : null}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cn(CTA_STYLES[variant], className)} data-testid={rest["data-testid"]}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={cn(CTA_STYLES[variant], className)} data-testid={rest["data-testid"]}>
      {content}
    </Link>
  );
}
