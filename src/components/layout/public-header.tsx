"use client";

import { ArrowRight, Menu, UserRound } from "lucide-react";
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
  /** Signed-in visitor: swaps "Sign in" for a link to their portal. */
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

/** Black pill / white outline pill used in the header (kept small: h-10). */
const PILL = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Public website header: white and sticky, with a hairline bottom border once the page scrolls. Logo left, the
 * main links in the centre (xl+), "Sign in" (outline pill) and "Send your CV" (black pill) on the right.
 * Below xl the links move into a sheet. The logo is the way home, so a "Home" item is not repeated in the bar.
 */
export function PublicHeader({ navItems, announcement = null, account = null }: PublicHeaderProps) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useMemo(() => sanitizeNavItems(navItems ?? DEFAULT_PUBLIC_NAV), [navItems]);
  const barItems = useMemo(() => items.filter((item) => item.href !== "/"), [items]);

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      {announcement && <AnnouncementBar announcement={announcement} />}
      <header
        data-scrolled={scrolled ? "true" : undefined}
        className={cn(
          "sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md transition-[border-color,background-color] duration-200 supports-[backdrop-filter]:bg-white/80 motion-reduce:transition-none",
          scrolled || menuOpen ? "border-border" : "border-transparent",
        )}
      >
        <div className="container-page flex h-16 items-center gap-4 xl:h-[4.5rem]">
          <Link href="/" className="shrink-0 rounded-md">
            <span className="sr-only">{`${BRAND.name} home`}</span>
            <Logo decorative className="h-8 w-auto" />
          </Link>

          <PublicDesktopNav items={barItems} pathname={pathname} signedIn={!!account} className="hidden min-w-0 flex-1 justify-center xl:flex" />

          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            {account ? (
              <>
                <Link
                  href="/account"
                  className={cn(PILL, "hidden text-muted-foreground hover:bg-surface-subtle hover:text-foreground xl:inline-flex")}
                >
                  <UserRound className="size-4" aria-hidden />
                  <span className="max-w-[9rem] truncate">{account.name}</span>
                </Link>
                <Link href={account.href} className={cn(PILL, "hidden bg-foreground text-white hover:bg-[#26262b] sm:inline-flex")}>
                  Go to {account.portalLabel}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </>
            ) : (
              <>
                <Link href={PUBLIC_CTA.signIn} className={cn(PILL, "hidden border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle sm:inline-flex")}>
                  Sign in
                </Link>
                <Link
                  href="/send-cv"
                  className={cn(PILL, "group/cv hidden bg-foreground text-white hover:bg-[#26262b] min-[420px]:inline-flex")}
                  data-testid="header-send-cv"
                >
                  Send your CV
                  <ArrowRight className="size-4 transition-transform duration-150 group-hover/cv:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </Link>
              </>
            )}
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 size-11 rounded-full text-foreground hover:bg-surface-subtle xl:hidden [&_svg:not([class*='size-'])]:size-6"
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
