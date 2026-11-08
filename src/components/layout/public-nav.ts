/**
 * Public website navigation helpers (client-safe, pure): defaults derived from PUBLIC_NAV, sanitising
 * of CMS-supplied links, active-state matching and the "priority+" split that moves top-level items
 * that do not fit the desktop bar into a "More" menu.
 */
import { PUBLIC_NAV } from "@/config/navigation";

import { isExternalHref, safeInternalHref } from "./nav-utils";
import { PUBLIC_CTA } from "./portal-config";
import type { FooterColumn, FooterLink, PublicNavItem, PublicNavLink } from "./types";

export const DEFAULT_PUBLIC_NAV: readonly PublicNavItem[] = PUBLIC_NAV;

/** Internal path or absolute http(s) URL; anything else (javascript:, data:, //host) is rejected. */
export function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (isExternalHref(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }
  return safeInternalHref(trimmed);
}

function cleanLink<T extends PublicNavLink>(link: T): T | null {
  const href = sanitizeHref(link.href);
  const title = link.title?.trim();
  return href && title ? { ...link, title, href } : null;
}

/** Drop items with unsafe or empty links (CMS data is admin-entered but still untrusted input). */
export function sanitizeNavItems(items: readonly PublicNavItem[]): PublicNavItem[] {
  const out: PublicNavItem[] = [];
  for (const item of items) {
    const children = item.children?.map(cleanLink).filter((child): child is PublicNavLink => child !== null);
    const clean = cleanLink(item);
    if (!clean) continue;
    out.push(
      children && children.length > 0 ? { ...clean, children } : { title: clean.title, href: clean.href, description: clean.description },
    );
  }
  return out;
}

export function sanitizeFooterLinks(links: readonly FooterLink[]): FooterLink[] {
  return links.map(cleanLink).filter((link): link is FooterLink => link !== null);
}

function pathOf(href: string): string {
  const path = href.split(/[?#]/)[0] ?? "";
  return path.length > 1 ? path.replace(/\/+$/, "") : path || "/";
}

/** Exact page match (query-string links such as "/jobs?overseas=1" never claim aria-current). */
export function isCurrentPage(href: string, pathname: string): boolean {
  if (isExternalHref(href) || href.includes("?")) return false;
  return pathOf(href) === pathOf(pathname);
}

/** Section match for the top-level indicator: the item, or one of its children, contains the current page. */
export function isSectionActive(item: PublicNavItem, pathname: string): boolean {
  const current = pathOf(pathname);
  const within = (href: string) => {
    if (isExternalHref(href)) return false;
    const path = pathOf(href);
    return path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`);
  };
  return within(item.href) || (item.children ?? []).some((child) => within(child.href));
}

// ---------------------------------------------------------------------------
// Priority+ desktop navigation
// ---------------------------------------------------------------------------

/** Rough rendered width of a top-level item: 15px Inter medium (~8.2px per glyph) + padding + chevron. */
export function estimateNavItemWidth(item: Pick<PublicNavItem, "title" | "children">): number {
  return Math.ceil(item.title.length * 8.2) + 28 + (item.children?.length ? 18 : 0);
}

export const MORE_TRIGGER_WIDTH = 74;

/** How many leading items fit in `budget` px, reserving room for the "More" trigger when something overflows. */
export function fitNavItems(items: readonly Pick<PublicNavItem, "title" | "children">[], budget: number): number {
  const widths = items.map(estimateNavItemWidth);
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= budget) return items.length;
  let used = MORE_TRIGGER_WIDTH;
  let count = 0;
  for (const width of widths) {
    if (used + width > budget) break;
    used += width;
    count += 1;
  }
  return count;
}

/**
 * Desktop nav budgets (px available to top-level items after the logo, the header actions and gaps):
 * `xl` at a 1280px viewport and `wide` at 1536px. The header uses the page container (1200px content
 * at both widths). Signed-in visitors see a longer action group.
 */
export function desktopNavBudgets(signedIn: boolean): { xl: number; wide: number } {
  // "Sign in" + "Send your CV" pills ≈ 245px; account name + "Go to <portal>" up to ≈ 330px.
  const cta = signedIn ? 330 : 250;
  // Logo lockup at h-8 (32px tall ≈ 179px wide) + the two 16px gaps either side of the nav.
  const logoAndGaps = 179 + 32;
  const content = 1200;
  return { xl: content - logoAndGaps - cta, wide: content - logoAndGaps - cta };
}

// ---------------------------------------------------------------------------
// Footer defaults
// ---------------------------------------------------------------------------

/**
 * Used until the CMS footer settings are wired in (kept identical to NAVIGATION_SEED in
 * src/modules/content/seed-content/site.ts; seed-content.test.ts fails if they drift apart).
 */
export const DEFAULT_FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    title: "Find work",
    links: [
      { title: "Jobs", href: "/jobs" },
      { title: "Overseas jobs", href: "/jobs?overseas=1" },
      { title: "Latest requirements", href: "/requirements" },
      { title: "Send your CV", href: "/send-cv" },
      { title: "Training courses", href: "/training" },
    ],
  },
  {
    title: "Services",
    links: [
      { title: "Overseas employment", href: "/services/overseas-employment" },
      { title: "Training", href: "/services/technical-training" },
      { title: "Manpower supply", href: "/services/bulk-manpower-supply" },
      { title: "All services", href: "/services" },
    ],
  },
  {
    title: "Company",
    links: [
      { title: "About us", href: "/about" },
      { title: "Contact", href: "/contact" },
      { title: "For employers", href: "/employers" },
      { title: "Request workers", href: PUBLIC_CTA.postRequirement },
      { title: "We never charge candidates", href: "/safe-recruitment" },
      { title: "Verify a certificate", href: "/verify-certificate" },
    ],
  },
];
