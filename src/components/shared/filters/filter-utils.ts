import type { SelectOption } from "../types";
import { formatIsoDateLabel } from "./date-range";

/**
 * Pure helpers for the filter controls (client-safe, unit-tested).
 */
export type FilterChipSource = {
  param: string;
  /** Filter name shown on the chip, e.g. "Status". */
  label: string;
  /** Map raw values to labels (otherwise the raw value is shown). */
  options?: SelectOption[];
  /** "date" formats ISO dates (YYYY-MM-DD) for display — usable from server components. */
  kind?: "text" | "date";
  /** Custom display (client components only — functions cannot cross the server boundary). */
  format?: (value: string) => string;
};

export type ActiveChip = { param: string; value: string; text: string; label: string };

/** Build the visible chips from the current params. */
export function activeChips(sources: FilterChipSource[], getAll: (key: string) => string[]): ActiveChip[] {
  return sources.flatMap((source) =>
    getAll(source.param).map((value) => {
      const option = source.options?.find((o) => o.value === value);
      const text = source.format ? source.format(value) : source.kind === "date" ? formatIsoDateLabel(value) : (option?.label ?? value);
      return { param: source.param, value, text, label: source.label };
    }),
  );
}

/** Preserve option order while grouping by `group` (ungrouped options keep their place). */
export function groupOptions(options: SelectOption[]): [string | null, SelectOption[]][] {
  const out: [string | null, SelectOption[]][] = [];
  for (const option of options) {
    const key = option.group ?? null;
    const last = out[out.length - 1];
    if (last && last[0] === key) last[1].push(option);
    else out.push([key, [option]]);
  }
  return out;
}
