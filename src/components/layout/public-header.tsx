"use client";

import { ArrowUpRight, Globe, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { BRAND } from "@/config/site";
import { cn } from "@/lib/utils";

import { AnnouncementBar } from "./announcement-bar";
import { PUBLIC_CTA } from "./portal-config";
import { PublicDesktopNav } from "./public-desktop-nav";
import { PublicMobileNav } from "./public-mobile-nav";
import { DEFAULT_PUBLIC_NAV, sanitizeNavItems } from "./public-nav";
import type { Announcement, HeaderAccount, PublicNavItem } from "./types";

export type PublicHeaderProps = {
  /** Top-level items (dropdown groups via `children`). Defaults to PUBLIC_NAV until the CMS supplies them. */
  navItems?: readonly PublicNavItem[];
  /** Optional site-wide announcement shown above the header. */
  announcement?: Announcement | null;
  /** Signed-in visitor: swaps "Sign in / Join" for a link to their portal. */
  account?: HeaderAccount | null;
};

const SCROLL_THRESHOLD = 8;

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function useScrolled(): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > SCROLL_THRESHOLD,
    () => false,
  );
}

/**
 * Public website header: navy utility row (xl+) with "Post a Requirement" and "Sign in", then the main
 * row with logo, dropdown navigation and the primary call to action. Sticky; turns translucent once the
 * page scrolls. Below xl the navigation moves into a sheet.
 */
export function PublicHeader({ navItems, announcement = null, account = null }: PublicHeaderProps) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useMemo(() => sanitizeNavItems(navItems ?? DEFAULT_PUBLIC_NAV), [navItems]);

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      {announcement && <AnnouncementBar announcement={announcement} />}
      {/* At xl the utility row (h-9) scrolls away and the main row sticks to the top. */}
      <header className="sticky top-0 z-40 xl:-top-9">
        <div className="hidden h-9 bg-navy text-[13px] text-white/75 xl:block">
          <div className="mx-auto flex h-full max-w-[96rem] items-center justify-between gap-6 px-8">
            <p className="flex items-center gap-2">
              <Globe className="size-3.5 text-teal" aria-hidden />
              <span>{BRAND.category}</span>
            </p>
            <ul role="list" className="flex items-center gap-1">
              <li>
                <Link
                  href={PUBLIC_CTA.postRequirement}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-white transition-colors hover:bg-white/10"
                >
                  Post a Requirement
                  <ArrowUpRight className="size-3.5 text-teal" aria-hidden />
                </Link>
              </li>
              <li aria-hidden className="h-4 w-px bg-white/15" />
              <li>
                {account ? (
                  <Link
                    href="/account"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <UserRound className="size-3.5" aria-hidden />
                    <span className="max-w-[14rem] truncate">{account.name}</span>
                  </Link>
                ) : (
                  <Link
                    href={PUBLIC_CTA.signIn}
                    className="inline-flex h-7 items-center rounded-md px-2.5 font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Sign in
                  </Link>
                )}
              </li>
            </ul>
          </div>
        </div>

        <div
          className={cn(
            "border-b transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none",
            scrolled
              ? "border-border/70 bg-white/85 shadow-[0_8px_24px_-18px_rgba(16,28,53,0.45)] backdrop-blur-lg supports-[backdrop-filter]:bg-white/72"
              : "border-transparent bg-white",
          )}
        >
          <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-3 px-4 sm:px-6 lg:px-8 xl:h-[4.5rem] xl:gap-6">
            <Link href="/" className="shrink-0 rounded-md">
              <span className="sr-only">{`${BRAND.name} home`}</span>
              <Logo decorative className="h-8 w-auto xl:h-9" />
            </Link>

            <PublicDesktopNav items={items} pathname={pathname} signedIn={!!account} className="hidden min-w-0 flex-1 xl:flex" />

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* xl+ shows this in the utility row; below md it lives in the menu sheet. */}
              <Button asChild variant="outline" className="hidden h-10 rounded-lg px-3.5 text-navy md:inline-flex xl:hidden">
                <Link href={PUBLIC_CTA.postRequirement}>Post a Requirement</Link>
              </Button>
              {account ? (
                <Button asChild className="hidden h-10 rounded-lg px-4 sm:inline-flex">
                  <Link href={account.href}>Go to {account.portalLabel}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="ghost" className="hidden h-10 rounded-lg px-3.5 text-navy sm:inline-flex xl:hidden">
                    <Link href={PUBLIC_CTA.signIn}>Sign in</Link>
                  </Button>
                  <Button asChild className="hidden h-10 rounded-lg px-4 sm:inline-flex">
                    <Link href={PUBLIC_CTA.join}>Join Venkat Sai</Link>
                  </Button>
                </>
              )}
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 size-11 rounded-full text-navy xl:hidden [&_svg:not([class*='size-'])]:size-6"
                  aria-label="Open menu"
                >
                  <Menu aria-hidden />
                </Button>
              </SheetTrigger>
            </div>
          </div>
        </div>
      </header>
      <PublicMobileNav items={items} pathname={pathname} account={account} onNavigate={() => setMenuOpen(false)} />
    </Sheet>
  );
}
