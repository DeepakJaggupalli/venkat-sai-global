import { BellRing, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JobCardView } from "@/components/jobs/job-card";
import { JobSearchLayout } from "@/components/jobs/job-search-layout";
import { loadJobFilterOptions } from "@/components/jobs/search-options";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getLocale, getT } from "@/i18n/server";
import { withParams, type SearchParams } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getRecommendedJobs } from "@/modules/jobs/recommendations";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import { searchJobs } from "@/modules/jobs/search";
import type { RecommendedJob } from "@/modules/jobs/types";
import { requireOnboardedCandidate } from "../_lib/guard";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-jobs");
  return { title: t("discover.title") };
}

/**
 * People Portal job discovery: the public search (same filters, facets and sorting) with saved / applied
 * flags, "jobs for you" with reasons on the unfiltered first page, and a shortcut to turn the current
 * search into an alert.
 */
export default async function TalentJobsPage({ searchParams }: PageProps) {
  const session = await requireOnboardedCandidate();
  const sp = await searchParams;
  const { user, candidate } = session;
  const [t, locale, options] = await Promise.all([getT("talent-jobs"), getLocale(), loadJobFilterOptions()]);
  const filters = parseJobSearchParams(sp);
  const hasCriteria = Object.keys(sp).some((k) => k !== "page" && k !== "sort");
  const showRecommendations = !hasCriteria && filters.page === 1;

  const [result, recommended] = await Promise.all([
    searchJobs(filters, { kind: "talent", userId: user.id, candidateId: candidate.id }, { facets: true }),
    showRecommendations
      ? getRecommendedJobs(candidate.id, { kind: "self", user, candidate }, { limit: 4 }).catch((error: unknown): RecommendedJob[] => {
          logger.warn("Failed to load job recommendations", { error });
          return [];
        })
      : Promise.resolve([] as RecommendedJob[]),
  ]);
  const returnTo = withParams("/talent/jobs", sp, {});
  const viewer = { signedIn: true, returnTo };
  const alertHref = withParams("/talent/alerts", sp, { page: null, sort: null, new: "1" });

  return (
    <div className="space-y-6">
      <PageHeader title={t("discover.title")} description={t("discover.description")} actions={[{ label: t("alerts.manage"), href: "/talent/alerts", variant: "outline", icon: <BellRing aria-hidden="true" /> }]} />

      {recommended.length ? (
        <section aria-labelledby="recommended-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="recommended-heading" className="font-heading text-lg font-semibold text-navy">
                {t("recommendations.title")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("recommendations.description")}</p>
            </div>
            <Link href="/talent/profile" className="text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
              {t("recommendations.improve")}
            </Link>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {recommended.map(({ job, reasons }) => (
              <li key={job.id} className="flex">
                <JobCardView job={job} t={t} locale={locale} href={`/talent/jobs/${job.slug}`} viewer={viewer} reasons={reasons} className="w-full" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label={t("discover.allJobs")} className="space-y-3">
        {recommended.length ? <h2 className="font-heading text-lg font-semibold text-navy">{t("discover.allJobs")}</h2> : null}
        <JobSearchLayout
          result={result}
          options={options}
          t={t}
          locale={locale}
          pathname="/talent/jobs"
          searchParams={sp}
          viewer={viewer}
          hrefFor={(job) => `/talent/jobs/${job.slug}`}
          aside={
            hasCriteria ? (
              <Link href={alertHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
                <BellRing aria-hidden="true" className="size-4" />
                {t("alerts.createFromSearch")}
              </Link>
            ) : null
          }
          empty={
            <EmptyState
              icon={<SearchX />}
              title={hasCriteria ? t("results.emptyFilteredTitle") : t("results.emptyTitle")}
              description={hasCriteria ? t("results.emptyFilteredDescription") : t("results.emptyDescription")}
              primaryAction={hasCriteria ? { label: t("filters.clearAll"), href: "/talent/jobs" } : { label: t("results.exploreTraining"), href: "/talent/training" }}
              secondaryAction={{ label: hasCriteria ? t("alerts.createFromSearch") : t("alerts.create"), href: hasCriteria ? alertHref : "/talent/alerts?new=1" }}
            />
          }
        />
      </section>
    </div>
  );
}
