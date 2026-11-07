import { BellRing, SearchX, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { loadJobFilterOptions } from "@/components/jobs/search-options";
import { JobSearchLayout } from "@/components/jobs/job-search-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { getLocale, getT } from "@/i18n/server";
import { withParams, type SearchParams } from "@/lib/http";
import { getCandidateByUserId } from "@/modules/candidates/guard";
import { getCurrentUser } from "@/modules/identity/session";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import { searchJobs } from "@/modules/jobs/search";
import type { JobSearchAudience } from "@/modules/jobs/types";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const t = await getT("talent-jobs");
  const sp = await searchParams;
  const filtered = Object.keys(sp).some((k) => k !== "page");
  return {
    title: t("public.metaTitle"),
    description: t("public.metaDescription"),
    alternates: { canonical: "/jobs" },
    // Filter combinations are endless; let search engines index the board and the job pages only.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

function hrefWithReturn(pathname: string, sp: SearchParams): string {
  return withParams(pathname, sp, {});
}

/** The current search as an alert draft: the alerts page pre-fills its form from these params. */
function alertDraftHref(sp: SearchParams): string {
  return withParams("/talent/alerts", sp, { page: null, sort: null, new: "1" });
}

/**
 * Public job board (spec 8.4): keyword, location and every structured filter, facet counts, sorting,
 * URL-synced pagination. Visitors browse freely; saving and applying need an account (never a payment).
 */
export default async function PublicJobsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const [t, locale, user, options] = await Promise.all([getT("talent-jobs"), getLocale(), getCurrentUser(), loadJobFilterOptions()]);
  const candidate = user ? await getCandidateByUserId(user.id) : null;
  const audience: JobSearchAudience = user ? { kind: "talent", userId: user.id, candidateId: candidate?.id ?? null } : { kind: "public" };
  const filters = parseJobSearchParams(sp);
  const result = await searchJobs(filters, audience, { facets: true });
  const returnTo = hrefWithReturn("/jobs", sp);
  const hasCriteria = Object.keys(sp).some((k) => k !== "page" && k !== "sort");

  return (
    <div className="bg-surface-subtle">
      <section className="border-b bg-navy text-white">
        <div className="container-page py-8 sm:py-10">
          <p className="text-sm font-medium text-white/80">{t("public.eyebrow")}</p>
          <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">{t("public.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">{t("public.description")}</p>
          <p className="mt-4 inline-flex items-start gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("safety.neverCharge")}{" "}
              <Link href="/safe-recruitment" className="font-medium underline underline-offset-2">
                {t("safety.learnHow")}
              </Link>
            </span>
          </p>
        </div>
      </section>
      <div className="container-page py-6 sm:py-8">
        <JobSearchLayout
          result={result}
          options={options}
          t={t}
          locale={locale}
          pathname="/jobs"
          searchParams={sp}
          viewer={{ signedIn: !!user, returnTo }}
          hrefFor={(job) => `/jobs/${job.slug}`}
          aside={
            hasCriteria ? (
              <Link
                href={user ? alertDraftHref(sp) : `/sign-in?returnTo=${encodeURIComponent(alertDraftHref(sp))}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-strong underline-offset-2 hover:underline"
                rel="nofollow"
              >
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
              primaryAction={hasCriteria ? { label: t("filters.clearAll"), href: "/jobs" } : { label: t("results.exploreTraining"), href: "/training" }}
              secondaryAction={user ? { label: t("alerts.create"), href: "/talent/alerts" } : { label: t("public.createAccount"), href: "/sign-up?intent=candidate" }}
            />
          }
        />
      </div>
    </div>
  );
}
