"use client";

import { Bell, Lock, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { isNavItemActive } from "./nav-utils";

type AccountTab = { label: string; href: string; icon: LucideIcon; matchNested?: boolean };

export const ACCOUNT_TABS: readonly AccountTab[] = [
  { label: "Profile", href: "/account", icon: UserRound, matchNested: false },
  { label: "Security", href: "/account/security", icon: ShieldCheck },
  { label: "Notifications", href: "/account/notifications", icon: Bell },
  { label: "Privacy", href: "/account/privacy", icon: Lock },
];

/** Account section tabs (links). Scrolls horizontally inside its own row on narrow screens. */
export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account sections" className="-mb-px">
      <ul role="list" className="no-scrollbar flex gap-1 overflow-x-auto">
        {ACCOUNT_TABS.map((tab) => {
          const active = isNavItemActive(tab, pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-2",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                  active ? "text-navy after:bg-teal" : "text-muted-foreground after:bg-transparent hover:text-navy",
                )}
              >
                <Icon className={cn("size-4", active ? "text-teal-strong" : "text-muted-foreground")} aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
