"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { SelectOption } from "../types";
import { groupOptions } from "./filter-utils";
import { useUrlFilters } from "./use-url-filters";

/** Radix Select items cannot use "" as a value, so "all" is represented by a sentinel. */
const ALL = "__all__";

type FilterSelectProps = {
  /** Search param to sync, e.g. "status". */
  param: string;
  label: string;
  /** Show the label above the control (default: visually hidden, the trigger shows the value). */
  showLabel?: boolean;
  options: SelectOption[];
  /** Text for the "no filter" option, e.g. "All statuses". */
  allLabel?: string;
  className?: string;
  triggerClassName?: string;
};

/**
 * Single-value filter synced to a URL param. Options come from the server (enum labels, taxonomy).
 *
 *   <FilterSelect param="status" label="Status" allLabel="All statuses" options={[{ value: "published", label: "Published" }]} />
 */
export function FilterSelect({ param, label, showLabel = false, options, allLabel = "All", className, triggerClassName }: FilterSelectProps) {
  const filters = useUrlFilters();
  const id = useId();
  const current = filters.get(param);
  const value = current && options.some((o) => o.value === current) ? current : ALL;
  const groups = groupOptions(options);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={cn(!showLabel && "sr-only")}>
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => filters.setParam(param, next === ALL ? null : next)}>
        <SelectTrigger id={id} className={cn("h-9 w-full min-w-40 bg-card sm:w-auto", value !== ALL && "border-teal/50", triggerClassName)}>
          {!showLabel ? (
            <span aria-hidden="true" className="text-muted-foreground">
              {label}:
            </span>
          ) : null}
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          <SelectSeparator />
          {groups.map(([group, items]) =>
            group ? (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : (
              items.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))
            ),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
