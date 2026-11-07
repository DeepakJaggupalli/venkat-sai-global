import { Bookmark } from "lucide-react";
import type { Metadata } from "next";

import { JobCardView } from "@/components/jobs/job-card";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { getLocale, getT } from "@/i18n/server";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { listSavedJobs } from "@/modules/jobs/saved-alerts-service";

import { ClearUnavailableButton } from "./clear-unavailable-button";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-jobs");
  return { title: t("saved.title") };
}

/** Saved jobs that are still open, newest saved first; closed ones are counted and can be cleared. */
export default async function SavedJobsPage({ searchParams }: PageProps) {
  const { user, candidate } = await requireCandidate();
  const sp = await searchParams;
  const [t, locale] = await Promise.all([getT("talent-jobs"), getLocale()]);
  const result = await listSavedJobs(user, parsePage(sp, { defaultSize: 20, maxSize: 50 }), { candidateId: candidate.id });

  return (
    <div className="space-y-6">
      <PageHeader title={t("saved.title")} description={t("saved.description")} actions={[{ label: t("discover.findJobs"), href: "/talent/jobs" }]} />
      {result.unavailableCount > 0 ? (
        <Callout tone="neutral" title={t("saved.unavailableTitle", { count: result.unavailableCount })} action={<ClearUnavailableButton count={result.unavailableCount} />}>
          {t("saved.unavailableBody")}
        </Callout>
      ) : null}
      {result.items.length ? (
        <>
          <p className="text-sm text-muted-foreground">{t("saved.count", { count: result.total })}</p>
          <ul className="grid gap-3 xl:grid-cols-2" aria-label={t("saved.title")}>
            {result.items.map((job) => (
              <li key={job.id} className="flex">
                <JobCardView job={job} t={t} locale={locale} href={`/talent/jobs/${job.slug}`} viewer={{ signedIn: true, returnTo: "/talent/saved" }} headingLevel="h2" className="w-full" />
              </li>
            ))}
          </ul>
          {result.pageCount > 1 ? (
            <Pagination
              pathname="/talent/saved"
              searchParams={sp}
              page={result.page}
              pageCount={result.pageCount}
              label={t("results.pagination")}
              labels={{ previous: t("results.previous"), next: t("results.next"), page: (page, count) => t("results.pageOf", { page, count }) }}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<Bookmark />}
          title={t("saved.emptyTitle")}
          description={t("saved.emptyDescription")}
          primaryAction={{ label: t("discover.findJobs"), href: "/talent/jobs" }}
          secondaryAction={{ label: t("alerts.create"), href: "/talent/alerts?new=1" }}
        />
      )}
    </div>
  );
}
