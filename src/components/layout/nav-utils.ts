/**
 * Pure navigation helpers for the shells (client-safe, unit-tested in nav-utils.test.ts).
 */
import type { NavItem, NavSection } from "@/config/navigation";
import { safeReturnTo } from "@/lib/http";

import type { BreadcrumbEntry } from "./types";

/** Anything with `get(name)` — `URLSearchParams`, `ReadonlyURLSearchParams`. */
export type SearchParamsLike = { get(name: string): string | null } | null | undefined;

const EMPTY_PERMISSIONS: readonly string[] = [];

/**
 * Items the viewer may see. Items without a `permission` are always shown; sections left
 * without items are dropped.
 */
export function filterNavSections(sections: readonly NavSection[], permissions: readonly string[] = EMPTY_PERMISSIONS): NavSection[] {
  const allowed = new Set(permissions);
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.permission || allowed.has(item.permission)) }))
    .filter((section) => section.items.length > 0);
}

function normalizePath(path: string): string {
  const withoutHash = path.split("#")[0] ?? "";
  return withoutHash.length > 1 ? withoutHash.replace(/\/+$/, "") : withoutHash || "/";
}

/** Split "/admin/organizations?type=employer" into its path and query. */
export function splitHref(href: string): { path: string; query: URLSearchParams } {
  const index = href.indexOf("?");
  const path = index === -1 ? href : href.slice(0, index);
  const query = new URLSearchParams(index === -1 ? "" : href.slice(index + 1));
  return { path: normalizePath(path), query };
}

function queryMatches(query: URLSearchParams, searchParams: SearchParamsLike): boolean {
  for (const [key, value] of query) {
    if ((searchParams?.get(key) ?? null) !== value) return false;
  }
  return true;
}

/**
 * Is the item the current page or (unless `matchNested: false`) an ancestor of it?
 * Query-string hrefs (e.g. `/admin/organizations?type=employer`) only match when every
 * parameter in the href is present with the same value.
 */
export function isNavItemActive(item: Pick<NavItem, "href" | "matchNested">, pathname: string, searchParams?: SearchParamsLike): boolean {
  const { path, query } = splitHref(item.href);
  const current = normalizePath(pathname);
  const nested = item.matchNested ?? true;
  const pathMatches = current === path || (nested && path !== "/" && current.startsWith(`${path}/`));
  return pathMatches && queryMatches(query, searchParams);
}

/** True when the item points at exactly the current page (not just an ancestor). */
export function isNavItemExact(item: Pick<NavItem, "href">, pathname: string, searchParams?: SearchParamsLike): boolean {
  const { path, query } = splitHref(item.href);
  return normalizePath(pathname) === path && queryMatches(query, searchParams);
}

/**
 * The single best-matching item across all sections (most specific path wins, then the
 * most query constraints), so `/admin/commercial/invoices` highlights "Invoices" and not
 * "Revenue & billing" as well.
 */
export function findActiveNavItem(sections: readonly NavSection[], pathname: string, searchParams?: SearchParamsLike): NavItem | null {
  let best: { item: NavItem; score: number } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (!isNavItemActive(item, pathname, searchParams)) continue;
      const { path, query } = splitHref(item.href);
      const score = path.length * 100 + Array.from(query.keys()).length;
      if (!best || score > best.score) best = { item, score };
    }
  }
  return best?.item ?? null;
}

/** i18n key for a navigation section title (People Portal), e.g. "Skills & growth" → "nav.section.skills-growth". */
export function navSectionI18nKey(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `nav.section.${slug}`;
}

/**
 * Default breadcrumb when a page has not registered its own: portal home → active section.
 * The last entry has no `href` (current page).
 */
export function buildAutoTrail(opts: {
  homeLabel: string;
  homeHref: string;
  activeItem: NavItem | null;
  activeLabel?: string;
  isExact: boolean;
}): BreadcrumbEntry[] {
  const { homeLabel, homeHref, activeItem, activeLabel, isExact } = opts;
  const isHomeItem = activeItem !== null && splitHref(activeItem.href).path === normalizePath(homeHref);
  if (!activeItem || isHomeItem) {
    // On the portal home itself the portal name is the current page; elsewhere it links home.
    return isHomeItem && isExact ? [{ label: homeLabel }] : [{ label: homeLabel, href: homeHref }];
  }
  const label = activeLabel ?? activeItem.title;
  return [{ label: homeLabel, href: homeHref }, isExact ? { label } : { label, href: activeItem.href }];
}

/** Portal "quick links" for dashboards: visible items except the home page itself. */
export function quickLinks(sections: readonly NavSection[], homeHref: string, limit = 6): NavItem[] {
  const home = normalizePath(homeHref);
  return sections
    .flatMap((section) => section.items)
    .filter((item) => splitHref(item.href).path !== home)
    .slice(0, limit);
}

/** Relative in-app link, or null for anything that could leave the site (protocol, //host, backslashes). */
export function safeInternalHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const safe = safeReturnTo(href, "");
  return safe === "" ? null : safe;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
