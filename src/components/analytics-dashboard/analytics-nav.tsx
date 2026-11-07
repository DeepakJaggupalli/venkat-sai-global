"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type AnalyticsNavItem = { href: string; label: string };

const RANGE_KEYS = ["range", "from", "to"] as const;

/**
 * Section navigation for /admin/analytics. Links keep the selected reporting range so moving between
 * reports compares the same period. Scrolls horizontally inside itself on phones.
 */
export function AnalyticsNav({ items }: { items: readonly AnalyticsNavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const keep = new URLSearchParams();
  for (const key of RANGE_KEYS) {
    const value = searchParams.get(key);
    if (value) keep.set(key, value);
  }
  const suffix = keep.toString() ? `?${keep.toString()}` : "";

  return (
    <nav aria-label="Analytics reports" className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1 px-1">
        {items.map((item) => {
          const active = item.href === "/admin/analytics" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={`${item.href}${suffix}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  active ? "bg-navy text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
