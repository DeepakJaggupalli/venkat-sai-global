/**
 * Pure URL/search-param helpers shared by LinkTabs, FilterBar controls and sort links (client-safe).
 * Server components build links with `withParams` from src/lib/http.ts; client controls use these
 * on a URLSearchParams snapshot from `useSearchParams()`.
 */
import type { SearchParams } from "@/lib/http";

export type ParamValue = string | string[] | null | undefined;
export type ParamPatch = Record<string, ParamValue>;

/** Keys reset whenever a filter changes, so users never land on an empty page 7 of a narrower result. */
export const DEFAULT_RESET_KEYS = ["page"] as const;

/** Copy URLSearchParams (or a query string) and apply a patch. null/undefined/""/[] delete the key. */
export function patchSearchParams(
  current: URLSearchParams | string | null | undefined,
  patch: ParamPatch,
  opts: { resetKeys?: readonly string[] } = {},
): URLSearchParams {
  const next = new URLSearchParams(typeof current === "string" ? current : (current?.toString() ?? ""));
  for (const [key, value] of Object.entries(patch)) {
    next.delete(key);
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== "") next.append(key, v);
    } else if (value !== "") {
      next.set(key, value);
    }
  }
  for (const key of opts.resetKeys ?? DEFAULT_RESET_KEYS) {
    if (!(key in patch)) next.delete(key);
  }
  return next;
}

/** "/path" + "?a=1" (omits the "?" when there are no params). */
export function buildHref(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Convert a Next.js `searchParams` object into URLSearchParams (repeated keys preserved). */
export function toURLSearchParams(params: SearchParams | undefined): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => usp.append(key, v));
    else usp.set(key, value);
  }
  return usp;
}

/** Number of the given keys that currently carry a value (for "Filters (3)" badges). */
export function countActiveParams(params: URLSearchParams, keys: readonly string[]): number {
  return keys.reduce((n, key) => (params.getAll(key).some((v) => v.trim() !== "") ? n + 1 : n), 0);
}

/** Add or remove one value of a multi-value param. */
export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/**
 * Is a tab/nav href active for the current location?
 *  - `match: "exact"` compares paths exactly; `"prefix"` also matches nested routes.
 *  - `keys` are the query params that distinguish sibling tabs (e.g. ["status"]): each key's value in
 *    the href must equal the current value (absent == absent), so an "All" tab (no status) is not
 *    active while "Drafts" (?status=draft) is.
 */
export function isHrefActive(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
  opts: { match?: "exact" | "prefix"; keys?: readonly string[] } = {},
): boolean {
  const url = new URL(href, "http://local.invalid");
  const target = normalizePath(url.pathname);
  const here = normalizePath(pathname);
  const pathOk = opts.match === "prefix" ? here === target || here.startsWith(`${target === "/" ? "" : target}/`) : here === target;
  if (!pathOk) return false;
  const keys = opts.keys ?? Array.from(new Set(url.searchParams.keys()));
  return keys.every((key) => (url.searchParams.get(key) ?? null) === (searchParams.get(key) ?? null));
}

/** Union of query keys used across a set of hrefs (the keys that distinguish sibling tabs). */
export function distinguishingKeys(hrefs: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const href of hrefs) {
    for (const key of new URL(href, "http://local.invalid").searchParams.keys()) keys.add(key);
  }
  return [...keys];
}
