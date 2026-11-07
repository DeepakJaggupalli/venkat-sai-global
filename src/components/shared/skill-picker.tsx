"use client";

import type { SkillCategory } from "@/db/schema/_constants";

import { MultiCombobox, type MultiComboboxProps } from "./multi-combobox";
import type { SelectOption } from "./types";

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  technical: "Technical",
  software: "Software",
  industrial: "Industrial",
  trade: "Trade",
  language: "Language",
  soft: "Soft skill",
};

type SkillResponse = { items: { id: string; name: string; category: SkillCategory; slug: string }[] };

/** Fetch skill suggestions from the public typeahead endpoint. */
export async function fetchSkillOptions(query: string, opts: { category?: SkillCategory; limit?: number; signal?: AbortSignal } = {}): Promise<SelectOption[]> {
  const params = new URLSearchParams({ q: query });
  if (opts.category) params.set("category", opts.category);
  if (opts.limit) params.set("limit", String(opts.limit));
  const res = await fetch(`/api/v1/taxonomy/skills?${params.toString()}`, { signal: opts.signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Skill search failed (${res.status})`);
  const body = (await res.json()) as SkillResponse;
  return body.items.map((s) => ({ value: s.id, label: s.name, description: SKILL_CATEGORY_LABELS[s.category] ?? s.category }));
}

type SkillPickerProps = Omit<MultiComboboxProps, "options" | "loadOptions" | "renderOption"> & {
  /** Restrict suggestions to one category (e.g. "trade" for welding positions). */
  category?: SkillCategory;
  limit?: number;
};

/**
 * Multi-select skill picker backed by GET /api/v1/taxonomy/skills (approved skills only). Selected
 * skills submit as `name[]` skill ids; pass `defaultValue` with labels for existing selections
 * (e.g. from getSkillsByIds()).
 *
 *   <FormField label="Skills" name="skillIds" hint="Choose up to 15"><SkillPicker maxSelected={15} /></FormField>
 */
export function SkillPicker({
  category,
  limit = 15,
  placeholder = "Select skills",
  searchPlaceholder = "Search skills (e.g. TIG welding)",
  emptyText = "No matching skills. Try a different word.",
  ...props
}: SkillPickerProps) {
  return (
    <MultiCombobox
      {...props}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      minQueryLength={1}
      loadOptions={(query, signal) => fetchSkillOptions(query, { category, limit, signal })}
    />
  );
}
