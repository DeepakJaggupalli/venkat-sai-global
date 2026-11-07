"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { TONE_STYLES } from "./tones";
import { distinguishingKeys, isHrefActive } from "./url-state";

export type LinkTabItem = {
  href: string;
  label: string;
  /** Count badge (e.g. number of applications in this view). */
  count?: number | null;
  icon?: ReactNode;
  /** Match nested routes as active (e.g. /employer/jobs/123/applicants/…). */
  match?: "exact" | "prefix";
};

type LinkTabsProps = {
  items: LinkTabItem[];
  /** Accessible name of the navigation, e.g. "Job sections". */
  label: string;
  /** Force the active tab (href). By default the active tab is derived from the current URL. */
  activeHref?: string;
  className?: string;
};

/**
 * URL-driven tabs: each tab is a real link (shareable, works without JS) marked with aria-current.
 * Use for page sections and list views; use the Radix Tabs primitive only for in-page panels.
 *
 *   <LinkTabs label="Applications views" items={[{ href: "/employer/applications", label: "All" }, { href: "/employer/applications?status=active", label: "In progress", count: 12 }]} />
 */
export function LinkTabs({ items, label, activeHref, className }: LinkTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const keys = distinguishingKeys(items.map((i) => i.href));

  return (
    <nav aria-label={label} data-slot="link-tabs" className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex min-w-max items-center gap-1 border-b border-border">
        {items.map((item) => {
          const active = activeHref
            ? activeHref === item.href
            : isHrefActive(item.href, pathname, new URLSearchParams(searchParams.toString()), { match: item.match ?? "exact", keys });
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative -mb-px inline-flex h-10 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
                  active
                    ? "border-teal-strong text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {item.icon ? (
                  <span aria-hidden="true" className="contents">
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
                {typeof item.count === "number" ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
                      active ? TONE_STYLES.brand.soft : TONE_STYLES.neutral.soft,
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
