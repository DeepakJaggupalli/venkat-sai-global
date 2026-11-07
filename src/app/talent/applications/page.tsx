import { CalendarClock, ClipboardList, Gift, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { intlLocale } from "@/components/jobs/labels";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLocale, getT } from "@/i18n/server";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { parsePage, sp as firstParam, type SearchParams } from "@/lib/http";
import { listApplicationsForCandidate } from "@/modules/recruitment/queries";
import { asCandidate } from "@/modules/recruitment/service";

import { stageLabel, stageTone } from "./_lib/stage";
import { requireOnboardedCandidate } from "../_lib/guard";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-jobs");
  return { title: t("applications.title") };
}

const VIEWS = ["open", "closed", "all"] as const;
type View = (typeof VIEWS)[number];

/** The candidate's applications: open / closed / all, each with its current stage in their language. */
export default async function ApplicationsPage({ searchParams }: PageProps) {
  const session = await requireOnboardedCandidate();
  const params = await searchParams;
  const requested = firstParam(params, "status");
  const view: View = (VIEWS as readonly string[]).includes(requested ?? "") ? (requested as View) : "open";
  const [t, locale] = await Promise.all([getT("talent-jobs"), getLocale()]);
  const result = await listApplicationsForCandidate(asCandidate(session), view === "all" ? {} : { status: view }, parsePage(params, { defaultSize: 20, maxSize: 50 }));
  const timeZone = session.user.timezone ?? env().DEFAULT_TIMEZONE;
  const loc = intlLocale(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("applications.title")} description={t("applications.description")} actions={[{ label: t("discover.findJobs"), href: "/talent/jobs" }]} />
      <LinkTabs
        label={t("applications.tabsLabel")}
        activeHref={view === "open" ? "/talent/applications" : `/talent/applications?status=${view}`}
        items={[
          { href: "/talent/applications", label: t("applications.tabOpen"), match: "exact" },
          { href: "/talent/applications?status=closed", label: t("applications.tabClosed") },
          { href: "/talent/applications?status=all", label: t("applications.tabAll") },
        ]}
      />
      {result.items.length ? (
        <>
          <ul className="space-y-3" aria-label={t("applications.listLabel")}>
            {result.items.map((app) => (
              <li key={app.id}>
                <article className="group relative rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-teal/60 focus-within:border-teal/60 sm:p-5" data-testid="application-item">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-heading text-base font-semibold text-navy">
                        <Link href={`/talent/applications/${app.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:underline">
                          {app.job.title}
                        </Link>
                      </h2>
                      <p className="text-sm text-muted-foreground">{app.job.employerName}</p>
                    </div>
                    <StatusBadge tone={stageTone(app.stage)} size="sm">
                      {stageLabel(app.stage, locale)}
                    </StatusBadge>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    <li className="font-mono text-xs leading-5">{app.code}</li>
                    {app.job.city || app.job.countryCode ? (
                      <li className="inline-flex items-center gap-1">
                        <MapPin aria-hidden="true" className="size-3.5" />
                        {[app.job.city, app.job.countryCode].filter(Boolean).join(", ")}
                      </li>
                    ) : null}
                    <li>{t("applications.appliedOn", { date: formatDate(app.submittedAt, { timeZone, locale: loc }) })}</li>
                    <li>{t("applications.updatedOn", { date: formatDate(app.lastStageChangedAt, { timeZone, locale: loc }) })}</li>
                  </ul>
                  {app.hasOpenOffer || app.nextInterviewAt ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {app.hasOpenOffer ? (
                        <li className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-strong">
                          <Gift aria-hidden="true" className="size-3.5" />
                          {t("applications.offerWaiting")}
                        </li>
                      ) : null}
                      {app.nextInterviewAt ? (
                        <li className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-medium text-info">
                          <CalendarClock aria-hidden="true" className="size-3.5" />
                          {t("applications.nextInterview", { date: formatDate(app.nextInterviewAt, { timeZone, locale: loc }) })}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
          {result.pageCount > 1 ? (
            <Pagination
              pathname="/talent/applications"
              searchParams={params}
              page={result.page}
              pageCount={result.pageCount}
              label={t("results.pagination")}
              labels={{ previous: t("results.previous"), next: t("results.next"), page: (page, count) => t("results.pageOf", { page, count }) }}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<ClipboardList />}
          title={view === "closed" ? t("applications.emptyClosedTitle") : t("applications.emptyTitle")}
          description={view === "closed" ? t("applications.emptyClosedDescription") : t("applications.emptyDescription")}
          primaryAction={{ label: t("discover.findJobs"), href: "/talent/jobs" }}
          secondaryAction={{ label: t("saved.title"), href: "/talent/saved" }}
        />
      )}
    </div>
  );
}
