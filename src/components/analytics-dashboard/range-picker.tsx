"use client";

import { useId, useState } from "react";

import { useUrlFilters } from "@/components/shared/filters/use-url-filters";
import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

/**
 * Reporting period control (URL params `range`, `from`, `to`). The server resolves and clamps the range
 * (max 400 days, never in the future); this control only proposes values.
 */
export function RangePicker({ preset, from, to, maxDate }: { preset: string; from: string; to: string; maxDate: string }) {
  const id = useId();
  const { setParams, isPending } = useUrlFilters();
  const [mode, setMode] = useState(preset);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function choose(value: string) {
    setMode(value);
    if (value !== "custom") setParams({ range: value === "30d" ? null : value, from: null, to: null });
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-preset`}>Reporting period</Label>
        <SimpleSelect id={`${id}-preset`} options={PRESETS} value={mode} onValueChange={choose} className="w-48" />
      </div>
      {mode === "custom" ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (customFrom && customTo) setParams({ range: "custom", from: customFrom, to: customTo });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input id={`${id}-from`} type="date" required max={maxDate} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-to`}>To</Label>
            <Input id={`${id}-to`} type="date" required max={maxDate} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </div>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}
