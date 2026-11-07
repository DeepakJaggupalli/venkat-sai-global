import type { ReactNode } from "react";

import { FilterPendingRegion, FilterScope } from "@/components/shared/filters";
import { Pagination } from "@/components/shared/pagination";
import type { SearchParams } from "@/lib/http";
import type { JobCard, JobSearchResult } from "@/modules/jobs/types";

import { JobFilterPanel, type JobFilterOptions } from "./filter-panel";
import { JobCardView, type JobCardViewer } from "./job-card";
import { JobSearchToolbar } from "./job-search-toolbar";
import type { Translate } from "./labels";

type JobSearchLayoutProps = {
  result: JobSearchResult;
  options: JobFilterOptions;
  t: Translate;
  locale: string;
  pathname: string;
  searchParams: SearchParams;
  viewer: JobCardViewer;
  /** Detail link of a job card. */
  hrefFor: (job: JobCard) => string;
  /** Rendered instead of the list when nothing matches. */
  empty: ReactNode;
  /** Optional content above the results (e.g. "create an alert for this search"). */
  aside?: ReactNode;
};

/**
 * The job search experience shared by the public job board and People Portal discovery: keywords,
 * location and sort on top, filters in a sidebar (sheet on phones), result count (announced), cards,
 * pagination. Every control is URL-synced; results dim while the next page loads.
 */
export function JobSearchLayout({ result, options, t, locale, pathname, searchParams, viewer, hrefFor, empty, aside }: JobSearchLayoutProps) {
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);
  return (
    <FilterScope>
      <div className="space-y-5">
        <div className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <JobSearchToolbar />
        </div>
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <JobFilterPanel options={options} facets={result.facets} total={result.total} />
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite" data-testid="job-result-count">
                {result.total === 0 ? t("results.none") : t("results.showing", { from, to, count: result.total })}
              </p>
              {aside}
            </div>
            <FilterPendingRegion>
              {result.items.length ? (
                <ul className="grid gap-3 xl:grid-cols-2" aria-label={t("results.listLabel")}>
                  {result.items.map((job) => (
                    <li key={job.id} className="flex">
                      <JobCardView job={job} t={t} locale={locale} href={hrefFor(job)} viewer={viewer} headingLevel="h2" className="w-full" />
                    </li>
                  ))}
                </ul>
              ) : (
                empty
              )}
            </FilterPendingRegion>
            {result.pageCount > 1 ? (
              <Pagination
                pathname={pathname}
                searchParams={searchParams}
                page={result.page}
                pageCount={result.pageCount}
                label={t("results.pagination")}
                labels={{ previous: t("results.previous"), next: t("results.next"), page: (page, count) => t("results.pageOf", { page, count }) }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </FilterScope>
  );
}
