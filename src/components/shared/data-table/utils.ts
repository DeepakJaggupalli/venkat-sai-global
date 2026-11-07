import { isValidElement, type ReactNode } from "react";

import { withParams, type SearchParams } from "@/lib/http";

import type { ColumnAlign, DataTableColumn, SortDirection, StackBreakpoint } from "./types";

/**
 * Pure DataTable helpers (client-safe, unit-tested): column visibility, mobile card layout,
 * alignment classes and sort links/state.
 */

/** Columns shown in the wide table. */
export function desktopColumns<T>(columns: DataTableColumn<T>[]): DataTableColumn<T>[] {
  return columns.filter((c) => !c.hideOnDesktop);
}

/** Split columns for the stacked mobile card: one title column + labelled fields. */
export function mobileCardColumns<T>(columns: DataTableColumn<T>[]): { primary: DataTableColumn<T> | undefined; fields: DataTableColumn<T>[] } {
  const visible = columns.filter((c) => !c.hideOnMobile);
  const primary = visible.find((c) => c.primary) ?? visible[0];
  return { primary, fields: visible.filter((c) => c !== primary) };
}

/** Text label for a column in places that need a string (mobile cards, sort link names). */
export function columnLabel<T>(column: DataTableColumn<T>): string {
  if (column.mobileLabel) return column.mobileLabel;
  if (typeof column.header === "string" || typeof column.header === "number") return String(column.header);
  if (isValidElement(column.header)) return column.id;
  return column.id;
}

export function alignClass(align: ColumnAlign | undefined): string {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}

export function justifyClass(align: ColumnAlign | undefined): string {
  return align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
}

/** Static class strings per breakpoint (Tailwind must see full class names). */
export const STACK_CLASSES: Record<StackBreakpoint, { table: string; cards: string }> = {
  sm: { table: "hidden sm:block", cards: "sm:hidden" },
  md: { table: "hidden md:block", cards: "md:hidden" },
  lg: { table: "hidden lg:block", cards: "lg:hidden" },
};

export function resolveSortKey<T>(column: DataTableColumn<T>): string | null {
  if (!column.sortKey) return null;
  return column.sortKey === true ? column.id : column.sortKey;
}

/**
 * Validate sort params from the URL against a whitelist (use in the page before querying).
 *
 *   const sort = parseSort(sp, ["createdAt", "title"], { by: "createdAt", dir: "desc" });
 */
export function parseSort<K extends string>(
  params: SearchParams | undefined,
  allowed: readonly K[],
  fallback: { by: K; dir: SortDirection },
  names: { param?: string; dirParam?: string } = {},
): { by: K; dir: SortDirection } {
  const read = (key: string) => {
    const v = params?.[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const by = read(names.param ?? "sort");
  const dir = read(names.dirParam ?? "dir");
  const validBy = by && (allowed as readonly string[]).includes(by) ? (by as K) : fallback.by;
  const validDir: SortDirection = dir === "asc" || dir === "desc" ? dir : validBy === fallback.by ? fallback.dir : "asc";
  return { by: validBy, dir: validDir };
}

/** Clicking a header: first click ascending, clicking the active column flips direction. */
export function nextSortDirection(currentBy: string | null | undefined, currentDir: SortDirection | null | undefined, key: string): SortDirection {
  if (currentBy !== key) return "asc";
  return currentDir === "asc" ? "desc" : "asc";
}

export function sortHref(
  key: string,
  state: { by?: string | null; dir?: SortDirection | null; pathname: string; searchParams?: SearchParams; param?: string; dirParam?: string },
): string {
  const dir = nextSortDirection(state.by, state.dir, key);
  return withParams(state.pathname, state.searchParams, {
    [state.param ?? "sort"]: key,
    [state.dirParam ?? "dir"]: dir,
    page: null,
  });
}

export function ariaSort(key: string | null, by: string | null | undefined, dir: SortDirection | null | undefined): "ascending" | "descending" | "none" | undefined {
  if (!key) return undefined;
  if (by !== key) return "none";
  return dir === "desc" ? "descending" : "ascending";
}

/** Is a cell value "empty" for display purposes (renders a muted dash)? */
export function isBlank(value: ReactNode): boolean {
  return value === null || value === undefined || value === false || (typeof value === "string" && value.trim() === "");
}
