import type { ReactNode } from "react";

import type { SearchParams } from "@/lib/http";

export type ColumnAlign = "left" | "center" | "right";
export type SortDirection = "asc" | "desc";

export type DataTableColumn<T> = {
  /** Unique column id (also the default sort key). */
  id: string;
  /** Column heading. Plain strings are reused as labels in the stacked mobile cards. */
  header: ReactNode;
  /** Cell renderer. Runs wherever the table renders (server for DataTable, client for SelectableDataTable). */
  cell: (row: T, rowIndex: number) => ReactNode;
  align?: ColumnAlign;
  /** Hide in the stacked mobile cards (keep the card short: 3–5 fields). */
  hideOnMobile?: boolean;
  /** Hide in the wide table (e.g. data that only matters on the card layout). */
  hideOnDesktop?: boolean;
  /** The card title on mobile (first column by default). */
  primary?: boolean;
  /** Label in the mobile card when `header` is not a plain string. */
  mobileLabel?: string;
  /** Sort key sent in the URL; `true` uses the column id. Server queries must whitelist keys. */
  sortKey?: string | true;
  /** Extra classes for the body cells / header cell (set widths here, e.g. "w-40"). */
  className?: string;
  headerClassName?: string;
  /** Keep cell content on one line (default true for numbers/right-aligned). */
  nowrap?: boolean;
};

export type DataTableSortState = {
  /** Current sort key (already validated by the page against its whitelist). */
  by?: string | null;
  dir?: SortDirection | null;
  pathname: string;
  searchParams?: SearchParams;
  /** Search param names. */
  param?: string;
  dirParam?: string;
};

export type RowLink = { href: string; label: string };

export type MobileLayout = "cards" | "scroll";
export type StackBreakpoint = "sm" | "md" | "lg";
