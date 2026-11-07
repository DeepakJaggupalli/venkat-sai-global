import { BadgeCheck, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { AssessmentCard } from "@/components/training/assessment-card";
import { groupAssessments, intlLocale, joinPlace } from "@/components/training/training-rules";
import { getLocale, getT } from "@/i18n/server";
import { env } from "@/lib/env";
import { requireCandidate } from "@/modules/candidates/guard";
import { listCandidateSkillAssessments } from "@/modules/training/skill-assessments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("assessments.title") };
}

/** Venkat Sai trade / skill tests: schedule and what to bring, published results and the skills they verified. */
export default async function AssessmentsPage() {
  const { user, candidate } = await requireCandidate();
  const [t, locale, items] = await Promise.all([
    getT("talent-training"),
    getLocale(),
    listCandidateSkillAssessments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }),
  ]);
  const fmt = intlLocale(locale);
  const viewerTimeZone = user.timezone ?? env().DEFAULT_TIMEZONE;
  const { upcoming, past } = groupAssessments(items, new Date());
  const verified = items.filter((i) => i.status === "completed" && i.result === "pass" && i.resultPublishedAt);

  return (
    <div className="space-y-6">
      <PageHeader title={t("assessments.title")} description={t("assessments.description")} />
      <Callout tone="brand" title={t("assessments.freeTitle")}>
        {t("assessments.freeBody")}
      </Callout>

      {items.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title={t("assessments.emptyTitle")}
          description={t("assessments.emptyDescription")}
          primaryAction={{ label: t("assessments.browseJobs"), href: "/talent/jobs" }}
          secondaryAction={{ label: t("talent.findCourses"), href: "/talent/training/courses", variant: "outline" }}
        />
      ) : (
        <>
          <SectionCard title={t("assessments.upcoming")}>
            {upcoming.length ? (
              <ul className="grid gap-3 xl:grid-cols-2">
                {upcoming.map((item) => (
                  <li key={item.id} className="flex">
                    <AssessmentCard t={t} item={item} fmtLocale={fmt} viewerTimeZone={viewerTimeZone} upcoming />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("assessments.noUpcoming")}</p>
            )}
          </SectionCard>

          <SectionCard title={t("assessments.verifiedSkills")} description={t("assessments.verifiedSkillsDescription")} icon={<BadgeCheck aria-hidden="true" />}>
            {verified.length ? (
              <ul className="divide-y divide-border" data-testid="verified-skills">
                {verified.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="font-medium text-navy">{item.trade}</span>
                      {joinPlace([item.process, item.position]) ? <span className="text-sm text-muted-foreground"> · {joinPlace([item.process, item.position])}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("assessments.verifiedOn")} <DateText value={item.resultPublishedAt} dateOnly locale={fmt} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("assessments.noVerifiedSkills")}</p>
            )}
          </SectionCard>

          {past.length ? (
            <SectionCard title={t("assessments.past")}>
              <ul className="grid gap-3 xl:grid-cols-2">
                {past.map((item) => (
                  <li key={item.id} className="flex">
                    <AssessmentCard t={t} item={item} fmtLocale={fmt} viewerTimeZone={viewerTimeZone} upcoming={false} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
