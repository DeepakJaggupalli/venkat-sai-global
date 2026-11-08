"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

import { isExternalHref } from "./nav-utils";
import { desktopNavBudgets, fitNavItems, isCurrentPage, isSectionActive } from "./public-nav";
import type { PublicNavItem, PublicNavLink } from "./types";

/** White header: plain grey text links that turn near-black on hover, focus and for the current section. */
const TOP_LEVEL =
  "group/top relative inline-flex h-10 items-center justify-center gap-1 rounded-full bg-transparent px-3.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground focus:bg-transparent focus:text-foreground data-open:bg-surface-subtle data-open:text-foreground data-active:bg-transparent data-active:text-foreground focus-visible:outline-solid! focus-visible:outline-2! focus-visible:outline-ring!";

/**
 * NavigationMenuContent strips outline/ring from links inside dropdowns, which would leave keyboard
 * focus marked only by a faint background. Restore a clear, inset outline (important wins over it).
 */
const CONTENT_LINK_FOCUS =
  "focus-visible:outline-solid! focus-visible:outline-2! focus-visible:outline-ring! focus-visible:-outline-offset-2!";

/** Small accent dot under the section that contains the current page (the text also turns near-black). */
function ActiveIndicator({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-teal transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function NavAnchor({
  link,
  pathname,
  className,
  children,
}: {
  link: PublicNavLink;
  pathname: string;
  className?: string;
  children: React.ReactNode;
}) {
  const external = isExternalHref(link.href);
  const current = isCurrentPage(link.href, pathname);
  // className goes on NavigationMenuLink (merged with its defaults via cn), not on the Slot child.
  return (
    <NavigationMenuLink asChild active={current} className={className}>
      <Link
        href={link.href}
        aria-current={current ? "page" : undefined}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
        {external && (
          <>
            <ExternalLink className="size-3.5 opacity-60" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </>
        )}
      </Link>
    </NavigationMenuLink>
  );
}

function DropdownLinks({ links, pathname, wide }: { links: readonly PublicNavLink[]; pathname: string; wide: boolean }) {
  return (
    <ul className={cn("grid gap-0.5 p-2", wide ? "w-[34rem] grid-cols-2" : "w-72")}>
      {links.map((link) => (
        <li key={link.href}>
          <NavAnchor
            link={link}
            pathname={pathname}
            className={cn(
              "group/link flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-subtle focus:bg-surface-subtle data-active:bg-teal-soft",
              CONTENT_LINK_FOCUS,
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{link.title}</span>
              {link.description && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{link.description}</span>}
            </span>
            <ArrowRight
              className="mt-0.5 size-4 shrink-0 -translate-x-1 text-teal-strong opacity-0 transition-all duration-150 group-hover/link:translate-x-0 group-hover/link:opacity-100"
              aria-hidden
            />
          </NavAnchor>
        </li>
      ))}
    </ul>
  );
}

function TopLevelItem({ item, pathname, className }: { item: PublicNavItem; pathname: string; className?: string }) {
  const sectionActive = isSectionActive(item, pathname);
  if (item.children?.length) {
    // Offer the section's landing page too when no child already points to it.
    const showOverview = !item.children.some((child) => child.href === item.href);
    return (
      <NavigationMenuItem className={className}>
        <NavigationMenuTrigger className={cn(TOP_LEVEL, "pr-2.5")}>
          {item.title}
          <ActiveIndicator active={sectionActive} />
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <DropdownLinks links={item.children} pathname={pathname} wide={item.children.length > 6} />
          {showOverview && (
            <div className="border-t border-border p-2">
              <NavAnchor
                link={{ title: item.title, href: item.href }}
                pathname={pathname}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-teal-strong hover:bg-surface-subtle focus:bg-surface-subtle",
                  CONTENT_LINK_FOCUS,
                )}
              >
                <span>Explore {item.title.toLowerCase()}</span>
                <ArrowRight className="size-4" aria-hidden />
              </NavAnchor>
            </div>
          )}
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
  }
  return (
    <NavigationMenuItem className={className}>
      <NavAnchor link={item} pathname={pathname} className={TOP_LEVEL}>
        {item.title}
        <ActiveIndicator active={sectionActive} />
      </NavAnchor>
    </NavigationMenuItem>
  );
}

function MoreItem({ items, pathname, className }: { items: readonly PublicNavItem[]; pathname: string; className?: string }) {
  const active = items.some((item) => isSectionActive(item, pathname));
  return (
    <NavigationMenuItem className={className}>
      <NavigationMenuTrigger className={cn(TOP_LEVEL, "pr-2.5")}>
        More
        <ActiveIndicator active={active} />
      </NavigationMenuTrigger>
      <NavigationMenuContent className="md:right-0 md:left-auto">
        <div className="w-72 space-y-1 p-2">
          {items.map((item) =>
            item.children?.length ? (
              <div key={item.href} className="pt-1">
                <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{item.title}</p>
                <DropdownLinks links={item.children} pathname={pathname} wide={false} />
              </div>
            ) : (
              <NavAnchor
                key={item.href}
                link={item}
                pathname={pathname}
                className={cn(
                  "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle focus:bg-surface-subtle data-active:bg-teal-soft",
                  CONTENT_LINK_FOCUS,
                )}
              >
                {item.title}
              </NavAnchor>
            ),
          )}
        </div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

/**
 * Desktop navigation (xl+). Top-level items that do not fit the bar at the current breakpoint move
 * into a "More" menu, so CMS-edited labels can never push the header into a horizontal scroll.
 */
export function PublicDesktopNav({
  items,
  pathname,
  signedIn,
  className,
}: {
  items: readonly PublicNavItem[];
  pathname: string;
  signedIn: boolean;
  className?: string;
}) {
  const budgets = desktopNavBudgets(signedIn);
  const fitXl = fitNavItems(items, budgets.xl);
  const fitWide = Math.max(fitXl, fitNavItems(items, budgets.wide));
  const overflowXl = items.slice(fitXl);
  const overflowWide = items.slice(fitWide);
  // fitWide >= fitXl, so the wide overflow is a tail of the xl overflow; equal length means identical lists.
  const sameOverflow = overflowWide.length === overflowXl.length;

  return (
    <NavigationMenu viewport={false} aria-label="Main navigation" className={cn("max-w-none justify-start", className)}>
      <NavigationMenuList className="gap-0.5">
        {items.map((item, index) => (
          <TopLevelItem
            key={item.href}
            item={item}
            pathname={pathname}
            className={index < fitXl ? undefined : index < fitWide ? "hidden min-[1536px]:block" : "hidden"}
          />
        ))}
        {overflowXl.length > 0 && (
          <MoreItem items={overflowXl} pathname={pathname} className={sameOverflow ? undefined : "min-[1536px]:hidden"} />
        )}
        {overflowWide.length > 0 && !sameOverflow && (
          <MoreItem items={overflowWide} pathname={pathname} className="hidden min-[1536px]:block" />
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
