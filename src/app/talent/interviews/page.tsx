import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getLocale, getT } from "@/i18n/server";
import { env } from "@/lib/env";
import { listInterviewsForCandidate } from "@/modules/recruitment/queries";
import { asCandidate } from "@/modules/recruitment/service";

import { splitInterviews } from "./_lib/split";
import { InterviewCard } from "./interview-card";
import { requireOnboardedCandidate } from "../_lib/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-jobs");
  return { title: t("interviews.title") };
}

/** Upcoming interviews (soonest first) with responses and calendar files, then past and cancelled ones. */
export default async function InterviewsPage() {
  const session = await requireOnboardedCandidate();
  const [t, locale, interviews] = await Promise.all([getT("talent-jobs"), getLocale(), listInterviewsForCandidate(asCandidate(session), {})]);
  const viewerTimeZone = session.user.timezone ?? env().DEFAULT_TIMEZONE;
  const { upcoming, past } = splitInterviews(interviews);

  return (
    <div className="space-y-8">
      <PageHeader title={t("interviews.title")} description={t("interviews.description")} />
      {!interviews.length ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t("interviews.emptyTitle")}
          description={t("interviews.emptyDescription")}
          primaryAction={{ label: t("applications.title"), href: "/talent/applications" }}
          secondaryAction={{ label: t("discover.findJobs"), href: "/talent/jobs" }}
        />
      ) : (
        <>
          <section aria-labelledby="upcoming-interviews" className="space-y-3">
            <h2 id="upcoming-interviews" className="font-heading text-lg font-semibold text-navy">
              {t("interviews.upcoming")}
            </h2>
            {upcoming.length ? (
              <ul className="grid gap-3 xl:grid-cols-2">
                {upcoming.map((i) => (
                  <li key={i.id}>
                    <InterviewCard interview={i} t={t} locale={locale} viewerTimeZone={viewerTimeZone} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState size="sm" variant="plain" title={t("interviews.noUpcoming")} description={t("interviews.noUpcomingDescription")} />
            )}
          </section>
          {past.length ? (
            <section aria-labelledby="past-interviews" className="space-y-3">
              <h2 id="past-interviews" className="font-heading text-lg font-semibold text-navy">
                {t("interviews.past")}
              </h2>
              <ul className="grid gap-3 xl:grid-cols-2">
                {past.map((i) => (
                  <li key={i.id}>
                    <InterviewCard interview={i} t={t} locale={locale} viewerTimeZone={viewerTimeZone} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
