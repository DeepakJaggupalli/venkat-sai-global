import { GraduationCap, SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterPendingRegion, FilterScope } from "@/components/shared/filters";
import { Pagination } from "@/components/shared/pagination";
import { getT } from "@/i18n/server";
import type { Paginated, SearchParams } from "@/lib/http";
import type { CatalogueCourse } from "@/modules/training/types";

import { CourseCard } from "./course-card";
import { CourseFilters, type CourseFilterOptions } from "./course-filters";

type CourseCatalogueProps = {
  result: Paginated<CatalogueCourse>;
  options: CourseFilterOptions;
  /** Where course links point: the public course page or the People Portal copy of it. */
  courseHref: (slug: string) => string;
  pathname: string;
  searchParams: SearchParams;
  hasFilters: boolean;
  /** Next best action when nothing is published yet. */
  emptyAction?: { label: string; href: string };
};

/** Filters + course grid + pagination. Server component; the filters are a client island. */
export async function CourseCatalogue({ result, options, courseHref, pathname, searchParams, hasFilters, emptyAction }: CourseCatalogueProps) {
  const t = await getT("talent-training");
  return (
    <FilterScope>
      <div className="space-y-5">
        <CourseFilters options={options} />
        <FilterPendingRegion>
          <section aria-labelledby="course-results-heading" className="space-y-4">
            <h2 id="course-results-heading" className="text-sm font-medium text-muted-foreground" aria-live="polite">
              {t("catalogue.count", { count: result.total })}
            </h2>
            {result.items.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list">
                {result.items.map((course) => (
                  <li key={course.id} className="flex">
                    <CourseCard course={course} href={courseHref(course.slug)} />
                  </li>
                ))}
              </ul>
            ) : hasFilters ? (
              <EmptyState
                icon={<SearchX />}
                title={t("catalogue.noMatchTitle")}
                description={t("catalogue.noMatchDescription")}
                primaryAction={{ label: t("filters.reset"), href: pathname, variant: "outline" }}
              />
            ) : (
              <EmptyState icon={<GraduationCap />} title={t("catalogue.emptyTitle")} description={t("catalogue.emptyDescription")} primaryAction={emptyAction} />
            )}
            {result.pageCount > 1 ? (
              <Pagination
                pathname={pathname}
                searchParams={searchParams}
                page={result.page}
                pageCount={result.pageCount}
                label={t("catalogue.paginationLabel")}
                labels={{ previous: t("pagination.previous"), next: t("pagination.next"), page: (page, pageCount) => t("pagination.page", { page, pageCount }) }}
              />
            ) : null}
          </section>
        </FilterPendingRegion>
      </div>
    </FilterScope>
  );
}
