import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { EmptyState } from "../empty-state";
import type { DataTableColumn, DataTableSortState, MobileLayout, RowLink, StackBreakpoint } from "./types";
import {
  alignClass,
  ariaSort,
  columnLabel,
  desktopColumns,
  isBlank,
  justifyClass,
  mobileCardColumns,
  nextSortDirection,
  resolveSortKey,
  sortHref,
  STACK_CLASSES,
} from "./utils";

/** A narrow leading cell (selection checkbox, drag handle). Shown first in the table and at the start of each mobile card. */
export type DataTableLeading<T> = {
  header: ReactNode;
  cell: (row: T, rowIndex: number) => ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Make each row (and mobile card) open a detail page. The label names the link for screen readers. */
  rowLink?: (row: T) => RowLink | null | undefined;
  /** Shorthand for rowLink: a URL per row, named by `rowLabel` (default "View details"). */
  rowHref?: (row: T) => string | null | undefined;
  rowLabel?: (row: T) => string;
  /** Describes the table for screen readers ("Job postings"). Visually hidden unless `captionVisible`. */
  caption: string;
  captionVisible?: boolean;
  /** URL-driven sorting (links keep the other search params and reset the page). */
  sort?: DataTableSortState;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  /** cards: stacked cards below `stackBelow`; scroll: the table scrolls inside its own container. */
  mobile?: MobileLayout;
  stackBelow?: StackBreakpoint;
  /** Draw the rounded card border (turn off when the table sits flush inside a SectionCard). */
  bordered?: boolean;
  /** Rendered above the rows inside the frame (bulk action bar, summary). */
  toolbar?: ReactNode;
  /** Rendered under the rows (pagination, totals). */
  footer?: ReactNode;
  /** Used by SelectableDataTable; available for custom leading controls. */
  leading?: DataTableLeading<T>;
  /** Marks rows as selected (adds data-state="selected" styling). */
  isRowSelected?: (row: T) => boolean;
  className?: string;
};

/** Interactive elements inside a linked row must sit above the stretched row link. */
export const LIFT_INTERACTIVE = "[&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-10 [&_button]:relative [&_button]:z-10";

/**
 * Server-component friendly table: typed column definitions with cell renderers, optional row
 * links, URL sorting, honest empty state and a stacked-card layout on small screens.
 *
 *   <DataTable caption="Job postings" rows={jobs} getRowId={(j) => j.id}
 *     rowLink={(j) => ({ href: `/employer/jobs/${j.id}`, label: `Open ${j.title}` })}
 *     columns={[
 *       { id: "title", header: "Job", cell: (j) => j.title, primary: true, sortKey: true },
 *       { id: "status", header: "Status", cell: (j) => <StatusBadge status={j.status} domain="job" /> },
 *       { id: "applications", header: "Applications", align: "right", cell: (j) => j.applicationCount },
 *     ]}
 *     sort={{ by: sort.by, dir: sort.dir, pathname: "/employer/jobs", searchParams: sp }}
 *     empty={<EmptyState title="No jobs yet" … />} />
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowLink,
  rowHref,
  rowLabel,
  caption,
  captionVisible = false,
  sort,
  empty,
  mobile = "cards",
  stackBelow = "md",
  bordered = true,
  toolbar,
  footer,
  leading,
  isRowSelected,
  className,
}: DataTableProps<T>) {
  const frame = cn("min-w-0 overflow-hidden", bordered && "rounded-xl border border-border bg-card shadow-xs", className);
  const linkFor = (row: T): RowLink | null => {
    const explicit = rowLink?.(row);
    if (explicit) return explicit;
    const href = rowHref?.(row);
    return href ? { href, label: rowLabel?.(row) ?? "View details" } : null;
  };

  if (rows.length === 0) {
    return (
      <div data-slot="data-table" className={frame}>
        {toolbar}
        {empty ?? <EmptyState variant="plain" title="Nothing to show" description="There are no records to display." />}
        {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    );
  }

  const tableCols = desktopColumns(columns);
  const { primary, fields } = mobileCardColumns(columns);
  const stack = mobile === "cards" ? STACK_CLASSES[stackBelow] : null;

  return (
    <div data-slot="data-table" className={frame}>
      {toolbar}
      <div className={cn(stack?.table)}>
        <Table>
          <TableCaption className={cn(captionVisible ? "mt-0 caption-top px-4 py-3 text-left" : "sr-only")}>{caption}</TableCaption>
          <TableHeader className="bg-surface-subtle">
            <TableRow className="hover:bg-transparent">
              {leading ? (
                <TableHead scope="col" className="h-10 w-10 pr-0 pl-4">
                  {leading.header}
                </TableHead>
              ) : null}
              {tableCols.map((col) => {
                const key = resolveSortKey(col);
                return (
                  <TableHead
                    key={col.id}
                    scope="col"
                    aria-sort={sort ? ariaSort(key, sort.by, sort.dir) : undefined}
                    className={cn("h-10 px-4 text-xs font-medium text-muted-foreground", alignClass(col.align), col.headerClassName)}
                  >
                    {key && sort ? <SortHeaderLink column={col} sortKey={key} sort={sort} /> : col.header}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const link = linkFor(row);
              const selected = isRowSelected?.(row) ?? false;
              return (
                <TableRow key={getRowId(row)} data-state={selected ? "selected" : undefined} className={cn(link && "relative cursor-pointer")}>
                  {leading ? <TableCell className={cn("w-10 pr-0 pl-4", link && LIFT_INTERACTIVE)}>{leading.cell(row, rowIndex)}</TableCell> : null}
                  {tableCols.map((col, colIndex) => {
                    const value = col.cell(row, rowIndex);
                    return (
                      <TableCell
                        key={col.id}
                        className={cn(
                          "px-4 py-3 align-middle",
                          col.nowrap === false || (!col.nowrap && col.align !== "right") ? "whitespace-normal" : "whitespace-nowrap",
                          col.align === "right" && "tabular-nums",
                          alignClass(col.align),
                          link && LIFT_INTERACTIVE,
                          col.className,
                        )}
                      >
                        {colIndex === 0 && link ? <RowOverlayLink link={link} /> : null}
                        {isBlank(value) ? <span className="text-muted-foreground">—</span> : value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {stack ? (
        <ul aria-label={caption} className={cn("divide-y divide-border", stack.cards)}>
          {rows.map((row, rowIndex) => {
            const link = linkFor(row);
            const selected = isRowSelected?.(row) ?? false;
            return (
              <li
                key={getRowId(row)}
                data-state={selected ? "selected" : undefined}
                className={cn("relative flex gap-3 px-4 py-4 data-[state=selected]:bg-muted", link && "transition-colors hover:bg-muted/50", link && LIFT_INTERACTIVE)}
              >
                {link ? <RowOverlayLink link={link} /> : null}
                {leading ? <div className="pt-0.5">{leading.cell(row, rowIndex)}</div> : null}
                <div className="min-w-0 flex-1">
                  {primary ? <div className="pr-2 text-sm font-medium text-foreground">{primary.cell(row, rowIndex)}</div> : null}
                  {fields.length > 0 ? (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      {fields.map((col) => {
                        const value = col.cell(row, rowIndex);
                        return (
                          <div key={col.id} className="min-w-0">
                            <dt className="text-xs text-muted-foreground">{columnLabel(col)}</dt>
                            <dd className="mt-0.5 text-sm break-words text-foreground">{isBlank(value) ? <span className="text-muted-foreground">—</span> : value}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
    </div>
  );
}

/** Invisible link stretched over the whole row/card; keyboard focus outlines the row. */
export function RowOverlayLink({ link }: { link: RowLink }) {
  return (
    <Link
      href={link.href}
      data-row-link=""
      className="absolute inset-0 z-0 rounded-[inherit] outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="sr-only">{link.label}</span>
    </Link>
  );
}

function SortHeaderLink<T>({ column, sortKey, sort }: { column: DataTableColumn<T>; sortKey: string; sort: DataTableSortState }) {
  const active = sort.by === sortKey;
  const next = nextSortDirection(sort.by, sort.dir, sortKey);
  const Icon = !active ? ChevronsUpDown : sort.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link
      href={sortHref(sortKey, sort)}
      scroll={false}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground",
        justifyClass(column.align),
        active && "text-foreground",
      )}
    >
      {column.header}
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", !active && "opacity-60")} />
      <span className="sr-only">
        , sort by {columnLabel(column)} {next === "asc" ? "ascending" : "descending"}
      </span>
    </Link>
  );
}
