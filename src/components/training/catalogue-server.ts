import "server-only";

import type { SelectOption } from "@/components/shared/types";
import type { Locale } from "@/i18n/config";
import type { TFunction } from "@/i18n/server";
import { sp, type PageQuery, type Paginated, type SearchParams } from "@/lib/http";
import { countryOptions } from "@/modules/taxonomy/queries";
import { COURSE_CATEGORIES, COURSE_CERTIFICATION_TYPES, COURSE_FEE_TYPES, COURSE_MODES } from "@/modules/training/constants";
import { listPublicCourses } from "@/modules/training/queries";
import { catalogueFiltersSchema } from "@/modules/training/schemas";
import type { CatalogueCourse, CatalogueFilters } from "@/modules/training/types";

import type { CourseFilterOptions } from "./course-filters";
import { DURATION_FILTERS, durationBucket, isDurationFilter, pageSlice, regionName, type DurationFilter } from "./training-rules";

/** Upper bound of courses scanned when the duration filter is applied in memory (no SQL filter for it yet). */
const DURATION_SCAN_LIMIT = 300;

export type CatalogueQuery = { filters: CatalogueFilters; duration: DurationFilter | undefined; hasFilters: boolean };

function field<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: string | undefined): T | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Validate catalogue search params field by field (one bad value never disables the other filters).
 * Courses with open batches are shown by default; `show=all` includes courses without one.
 */
export function parseCatalogueParams(params: SearchParams): CatalogueQuery {
  const s = catalogueFiltersSchema.shape;
  const filters: CatalogueFilters = {
    q: field(s.q, sp(params, "q")),
    category: field(s.category, sp(params, "category")),
    mode: field(s.mode, sp(params, "mode")),
    feeType: field(s.feeType, sp(params, "feeType")),
    certificationType: field(s.certificationType, sp(params, "certificationType")),
    countryCode: field(s.countryCode, sp(params, "countryCode")),
    city: field(s.city, sp(params, "city")),
    openBatchesOnly: sp(params, "show") !== "all",
  };
  const durationParam = sp(params, "duration");
  const duration = isDurationFilter(durationParam) ? durationParam : undefined;
  const hasFilters = Boolean(filters.q || filters.category || filters.mode || filters.feeType || filters.certificationType || filters.countryCode || filters.city || duration);
  return { filters, duration, hasFilters };
}

/** One catalogue page through the training module (published courses of Venkat Sai and verified institutions only). */
export async function loadCatalogue(query: CatalogueQuery, page: PageQuery): Promise<Paginated<CatalogueCourse>> {
  if (!query.duration) return listPublicCourses(query.filters, page);
  const all = await listPublicCourses(query.filters, { page: 1, pageSize: DURATION_SCAN_LIMIT, offset: 0 });
  const matching = all.items.filter((course) => durationBucket(course) === query.duration);
  return pageSlice(matching, page.page, page.pageSize);
}

/** Translated option lists for the catalogue filters. */
export async function catalogueFilterOptions(t: TFunction, locale: Locale): Promise<CourseFilterOptions> {
  const countries = await countryOptions();
  return {
    category: COURSE_CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) })),
    mode: COURSE_MODES.map((value) => ({ value, label: t(`mode.${value}`) })),
    feeType: COURSE_FEE_TYPES.map((value) => ({ value, label: t(`feeType.${value}`) })),
    certificationType: COURSE_CERTIFICATION_TYPES.map((value) => ({ value, label: t(`certification.${value}`) })),
    duration: DURATION_FILTERS.map((value) => ({ value, label: t(`durationFilter.${value}`) })),
    countryCode: countries
      .map((c): SelectOption => ({ value: c.value, label: locale === "en" ? c.label : (regionName(c.value, locale) ?? c.label) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), locale)),
  };
}
