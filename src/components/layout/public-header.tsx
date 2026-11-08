"use client";

import { Menu, UserRound } from "lucide-react";
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
  /** Signed-in visitor: swaps "Sign in / Sign up" for a link to their portal. */
  account?: HeaderAccount | null;
};

const SCROLL_THRESHOLD = 24;

/** Routes whose first band is a dark hero that the header floats over (the hero pulls itself up underneath). */
const OVER_HERO_ROUTES = new Set(["/"]);

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
 * Public website header: one navy row with the logo, seven top-level links and Sign in / Sign up. Sticky.
 * Over the homepage hero it starts transparent and turns solid navy once the page scrolls; on every other
 * page it is solid from the start. Below xl the navigation moves into a sheet.
 */
export function PublicHeader({ navItems, announcement = null, account = null }: PublicHeaderProps) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useMemo(() => sanitizeNavItems(navItems ?? DEFAULT_PUBLIC_NAV), [navItems]);
  const transparent = OVER_HERO_ROUTES.has(pathname) && !scrolled && !menuOpen;

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      {announcement && <AnnouncementBar announcement={announcement} />}
      <header
        data-transparent={transparent ? "true" : undefined}
        className={cn(
          "band-dark sticky top-0 z-40 text-white transition-[background-color,box-shadow,border-color] duration-300 motion-reduce:transition-none",
          transparent
            ? "border-b border-transparent bg-transparent"
            : "border-b border-white/10 bg-navy-deep/95 shadow-[0_10px_30px_-18px_rgb(6_18_58/0.8)] backdrop-blur-lg supports-[backdrop-filter]:bg-navy-deep/85",
        )}
      >
        <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-3 px-4 sm:px-6 lg:px-8 xl:h-[4.5rem] xl:gap-6">
          <Link href="/" className="shrink-0 rounded-md">
            <span className="sr-only">{`${BRAND.name} home`}</span>
            <Logo variant="onDark" decorative className="h-8 w-auto xl:h-9" />
          </Link>

          <PublicDesktopNav items={items} pathname={pathname} signedIn={!!account} className="hidden min-w-0 flex-1 justify-center xl:flex" />

          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            {account ? (
              <>
                <Link
                  href="/account"
                  className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white xl:inline-flex"
                >
                  <UserRound className="size-4" aria-hidden />
                  <span className="max-w-[10rem] truncate">{account.name}</span>
                </Link>
                <Button asChild className="hidden h-10 rounded-lg bg-yellow px-4 font-semibold text-navy hover:bg-yellow/90 sm:inline-flex">
                  <Link href={account.href}>Go to {account.portalLabel}</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden h-10 rounded-lg px-3.5 font-semibold text-white hover:bg-white/10 hover:text-white sm:inline-flex">
                  <Link href={PUBLIC_CTA.signIn}>Sign in</Link>
                </Button>
                <Button asChild className="hidden h-10 rounded-lg bg-yellow px-5 font-semibold text-navy shadow-[0_6px_18px_-8px_rgb(255_208_0/0.7)] hover:bg-yellow/90 sm:inline-flex">
                  <Link href={PUBLIC_CTA.join}>Sign up</Link>
                </Button>
              </>
            )}
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 size-11 rounded-full text-white hover:bg-white/10 hover:text-white xl:hidden [&_svg:not([class*='size-'])]:size-6"
                aria-label="Open menu"
              >
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
          </div>
        </div>
      </header>
      <PublicMobileNav items={items} pathname={pathname} account={account} onNavigate={() => setMenuOpen(false)} />
    </Sheet>
  );
}
