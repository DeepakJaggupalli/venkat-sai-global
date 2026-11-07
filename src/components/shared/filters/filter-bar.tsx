"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { countActiveParams } from "../url-state";
import { useUrlFilters } from "./use-url-filters";

type FilterBarProps = {
  /** Usually a <SearchInput />; always visible. */
  search?: ReactNode;
  /** Filter controls (FilterSelect, DateRangeFilter…). Collapsed behind a "Filters" button on phones. */
  children?: ReactNode;
  /** Every param the bar controls — used for the active count and "Reset filters". */
  paramKeys: readonly string[];
  /** Trailing actions (export, saved views). */
  actions?: ReactNode;
  /** Accessible name of the filter region, e.g. "Filter applications". */
  label?: string;
  labels?: { filters?: string; reset?: string; updating?: string };
  className?: string;
};

/**
 * One filter row above the content it scopes (search first, then filters, reset at the end).
 * Wrap the bar and the results in <FilterScope> to dim results while they reload.
 *
 *   <FilterBar paramKeys={["q", "status", "from", "to"]} search={<SearchInput label="Search jobs" />}>
 *     <FilterSelect param="status" label="Status" options={statusOptions} allLabel="All statuses" />
 *     <DateRangeFilter label="Posted" />
 *   </FilterBar>
 */
export function FilterBar({ search, children, paramKeys, actions, label = "Filters", labels, className }: FilterBarProps) {
  const filters = useUrlFilters();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const activeCount = countActiveParams(filters.searchParams, paramKeys);
  const filtersText = labels?.filters ?? "Filters";

  return (
    <div role="region" aria-label={label} data-slot="filter-bar" className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search ? <div className="min-w-0 flex-1 basis-56">{search}</div> : null}
        {children ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 bg-card md:hidden"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            <SlidersHorizontal aria-hidden="true" />
            {filtersText}
            {activeCount > 0 ? (
              <span className="rounded-full bg-navy px-1.5 text-xs font-semibold text-white tabular-nums">
                {activeCount}
                <span className="sr-only"> active</span>
              </span>
            ) : null}
          </Button>
        ) : null}
        {filters.isPending ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Spinner aria-hidden="true" role="presentation" />
            <span className="sr-only">{labels?.updating ?? "Updating results"}</span>
          </span>
        ) : null}
        {activeCount > 0 ? (
          <Button type="button" variant="ghost" className="h-9 text-muted-foreground" onClick={() => filters.reset(paramKeys)}>
            <RotateCcw aria-hidden="true" />
            {labels?.reset ?? "Reset filters"}
          </Button>
        ) : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {children ? (
        <div id={panelId} className={cn("flex-col items-stretch gap-2 md:flex md:flex-row md:flex-wrap md:items-end", expanded ? "flex" : "hidden")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
