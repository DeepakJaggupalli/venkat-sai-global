"use client";

import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import type { SelectOption } from "@/components/shared/types";
import { useT } from "@/i18n/client";

export const COURSE_FILTER_PARAMS = ["q", "category", "mode", "feeType", "certificationType", "duration", "countryCode", "city", "show"] as const;

export type CourseFilterOptions = {
  category: SelectOption[];
  mode: SelectOption[];
  feeType: SelectOption[];
  certificationType: SelectOption[];
  duration: SelectOption[];
  countryCode: SelectOption[];
};

/**
 * URL-synced catalogue filters. Option lists are built (and translated) on the server; every value is
 * validated again on the server before it reaches the catalogue query.
 */
export function CourseFilters({ options }: { options: CourseFilterOptions }) {
  const t = useT("talent-training");
  return (
    <FilterBar
      paramKeys={[...COURSE_FILTER_PARAMS]}
      label={t("filters.label")}
      labels={{ filters: t("filters.toggle"), reset: t("filters.reset"), updating: t("filters.updating") }}
      search={<SearchInput label={t("filters.search")} placeholder={t("filters.searchPlaceholder")} maxLength={100} />}
    >
      <FilterSelect param="category" label={t("filters.category")} showLabel allLabel={t("filters.allCategories")} options={options.category} />
      <FilterSelect param="mode" label={t("filters.mode")} showLabel allLabel={t("filters.allModes")} options={options.mode} />
      <FilterSelect param="duration" label={t("filters.duration")} showLabel allLabel={t("filters.anyDuration")} options={options.duration} />
      <FilterSelect param="feeType" label={t("filters.fee")} showLabel allLabel={t("filters.anyFee")} options={options.feeType} />
      <FilterSelect param="certificationType" label={t("filters.certification")} showLabel allLabel={t("filters.anyCertification")} options={options.certificationType} />
      <FilterSelect param="countryCode" label={t("filters.country")} showLabel allLabel={t("filters.anyCountry")} options={options.countryCode} />
      <SearchInput param="city" label={t("filters.city")} placeholder={t("filters.cityPlaceholder")} showLabel maxLength={120} />
      <FilterSelect
        param="show"
        label={t("filters.batches")}
        showLabel
        allLabel={t("filters.openBatchesOnly")}
        options={[{ value: "all", label: t("filters.includeWithoutBatches") }]}
      />
    </FilterBar>
  );
}
