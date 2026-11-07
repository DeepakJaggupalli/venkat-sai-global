"use client";

import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { TONE_STYLES } from "../tones";
import { DATE_RANGE_PRESETS, detectPreset, isIsoDate, PRESET_LABELS, presetRange, rangeLabel, validateRange, type DateRangePreset } from "./date-range";
import { useUrlFilters } from "./use-url-filters";

type DateRangeFilterProps = {
  label?: string;
  fromParam?: string;
  toParam?: string;
  presets?: readonly DateRangePreset[];
  /** Trigger text when no range is set. */
  emptyLabel?: string;
  /** Allow choosing a custom range below the presets. */
  allowCustom?: boolean;
  className?: string;
};

/**
 * Date range filter synced to two URL params (inclusive ISO dates). Presets first (nobody fights a
 * calendar grid for "last 30 days"), custom range below a divider, native date inputs for
 * accessibility and mobile keyboards.
 *
 *   <DateRangeFilter label="Applied" fromParam="from" toParam="to" />
 */
export function DateRangeFilter({
  label = "Date range",
  fromParam = "from",
  toParam = "to",
  presets = DATE_RANGE_PRESETS,
  emptyLabel = "Any time",
  allowCustom = true,
  className,
}: DateRangeFilterProps) {
  const filters = useUrlFilters();
  const rawFrom = filters.get(fromParam);
  const rawTo = filters.get(toParam);
  const from = isIsoDate(rawFrom) ? rawFrom : undefined;
  const to = isIsoDate(rawTo) ? rawTo : undefined;
  const active = detectPreset(from, to, presets);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const [error, setError] = useState<string | null>(null);
  const fromId = useId();
  const toId = useId();
  const errorId = useId();

  const apply = (next: { from?: string | null; to?: string | null }) => {
    filters.setParams({ [fromParam]: next.from ?? null, [toParam]: next.to ?? null });
    setOpen(false);
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraftFrom(from ?? "");
      setDraftTo(to ?? "");
      setError(null);
    }
    setOpen(next);
  };

  const hasValue = Boolean(from || to);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 justify-between gap-2 bg-card font-normal", hasValue && "border-teal/50", className)}>
          <CalendarRange aria-hidden="true" className="text-muted-foreground" />
          <span className="sr-only">{label}: </span>
          {/* Preset detection depends on "today", which can differ between server and browser time zones. */}
          <span className="truncate" suppressHydrationWarning>
            {rangeLabel(from, to, emptyLabel)}
          </span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-1.5">
        <p className="px-2 pt-1.5 pb-2 text-xs font-medium text-muted-foreground">{label}</p>
        <ul aria-label="Presets" className="grid gap-0.5">
          {presets.map((preset) => {
            const selected = preset === active;
            return (
              <li key={preset}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => apply(presetRange(preset))}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    selected && "font-semibold",
                  )}
                >
                  {PRESET_LABELS[preset]}
                  {selected ? <Check aria-hidden="true" className="size-4 text-teal-strong" strokeWidth={3} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {allowCustom ? (
          <form
            noValidate
            className="mt-1.5 grid gap-2 border-t border-border px-2 pt-3 pb-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const problem = validateRange(draftFrom, draftTo);
              if (problem) {
                setError(problem);
                return;
              }
              apply({ from: draftFrom || null, to: draftTo || null });
            }}
          >
            <p className="text-xs font-medium text-muted-foreground">Custom range</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor={fromId} className="text-xs">
                  From
                </Label>
                <Input
                  id={fromId}
                  type="date"
                  value={draftFrom}
                  max={draftTo || undefined}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setDraftFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={toId} className="text-xs">
                  To
                </Label>
                <Input
                  id={toId}
                  type="date"
                  value={draftTo}
                  min={draftFrom || undefined}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setDraftTo(e.target.value)}
                />
              </div>
            </div>
            {error ? (
              <p id={errorId} role="alert" className={cn("text-xs", TONE_STYLES.danger.text)}>
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" disabled={!hasValue} onClick={() => apply({ from: null, to: null })}>
                Clear
              </Button>
              <Button type="submit" size="sm">
                Apply
              </Button>
            </div>
          </form>
        ) : hasValue ? (
          <div className="mt-1.5 border-t border-border px-2 pt-2 pb-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => apply({ from: null, to: null })}>
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
