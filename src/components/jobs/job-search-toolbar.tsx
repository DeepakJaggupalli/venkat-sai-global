"use client";

import { useId } from "react";

import { SearchInput, useUrlFilters } from "@/components/shared/filters";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

import { enumLabel } from "./labels";

const SORTS = ["relevance", "newest", "closing", "salary"] as const;

/**
 * Keywords + location + sort above the job results. Keywords and location are debounced URL params
 * (`q`, `location`); sort writes `sort` (relevance is the default and is not written).
 */
export function JobSearchToolbar() {
  const t = useT("talent-jobs");
  const filters = useUrlFilters();
  const sortId = useId();
  const sort = filters.get("sort") ?? "relevance";

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto] sm:items-end">
      <SearchInput param="q" label={t("search.keywordsLabel")} showLabel placeholder={t("search.keywordsPlaceholder")} maxLength={200} />
      <SearchInput param="location" label={t("search.locationLabel")} showLabel placeholder={t("search.locationPlaceholder")} maxLength={120} />
      <div className="space-y-1">
        <Label htmlFor={sortId}>{t("search.sortLabel")}</Label>
        <select
          id={sortId}
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-44"
          value={sort}
          onChange={(e) => filters.setParams({ sort: e.target.value === "relevance" ? null : e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {enumLabel(t, "sort", s)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
