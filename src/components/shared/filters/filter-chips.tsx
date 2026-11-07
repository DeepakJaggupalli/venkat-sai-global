"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { activeChips, type FilterChipSource } from "./filter-utils";
import { useUrlFilters } from "./use-url-filters";

export type { FilterChipSource } from "./filter-utils";

type FilterChipsProps = {
  filters: FilterChipSource[];
  clearLabel?: string;
  className?: string;
};

/**
 * Removable chips for the active filters, plus "Clear all". Renders nothing when no filter is set.
 *
 *   <FilterChips filters={[{ param: "status", label: "Status", options: statusOptions }, { param: "q", label: "Search" }]} />
 */
export function FilterChips({ filters: sources, clearLabel = "Clear all", className }: FilterChipsProps) {
  const filters = useUrlFilters();
  const chips = activeChips(sources, filters.getAll);
  if (chips.length === 0) return null;

  const remove = (param: string, value: string) => {
    const remaining = filters.getAll(param).filter((v) => v !== value);
    filters.setParam(param, remaining.length > 0 ? remaining : null);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="sr-only">Active filters:</span>
      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <li key={`${chip.param}:${chip.value}`}>
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card pr-1 pl-3 text-xs">
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className="max-w-48 truncate font-medium text-foreground">{chip.text}</span>
              <button
                type="button"
                onClick={() => remove(chip.param, chip.value)}
                aria-label={`Remove filter ${chip.label}: ${chip.text}`}
                className="ml-0.5 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {chips.length > 1 ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-7 px-1 text-teal-strong"
          onClick={() => filters.reset(Array.from(new Set(sources.map((s) => s.param))))}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
