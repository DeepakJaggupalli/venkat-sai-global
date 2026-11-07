import { BookOpen, FileText, GraduationCap, MessagesSquare, PlayCircle, Target, UserRoundSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressRing } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { computeSkillGap } from "@/components/talent/career/skill-gap";
import { CareerRequestForm } from "@/components/talent/career/career-client";
import { Button } from "@/components/ui/button";
import { getLocale, getT } from "@/i18n/server";
import { requireCandidate } from "@/modules/candidates/guard";
import { getCandidateProfileDetail } from "@/modules/candidates/queries";
import { selfActor } from "@/modules/candidates/service";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";
import { requestCareerService } from "./actions";
import { getCoursesTeaching, getInterviewResources, getSkillDemand } from "./_lib/queries";
import { CAREER_SERVICES } from "./_lib/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  return { title: t("nav.career") };
}

const SERVICE_ICONS = { resume_review: FileText, career_counselling: UserRoundSearch, interview_preparation: MessagesSquare } as const;

/**
 * /talent/career — resume builder, career service requests (support tickets), interview preparation
 * resources (CMS) and a rules-based skill gap analysis against live published jobs.
 */
export default async function TalentCareerPage() {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect("/talent/onboarding");

  const [t, tc, locale, detail] = await Promise.all([getT("talent-account"), getT("common"), getLocale(), getCandidateProfileDetail(selfActor(session))]);
  if (!detail) redirect("/talent");
  const preferredCategoryIds = detail.profile.preferredCategoryIds;
  const [{ totalJobs, demand }, resources] = await Promise.all([getSkillDemand(preferredCategoryIds), getInterviewResources(locale)]);
  const ownSkillIds = detail.skills.map((s) => s.skillId);
  const missingIds = demand.filter((d) => !ownSkillIds.includes(d.skillId)).map((d) => d.skillId);
  const courses = await getCoursesTeaching(missingIds.slice(0, 10));
  const gap = computeSkillGap({ candidateSkillIds: ownSkillIds, demand, totalJobs, courses, maxMissing: 8 });
  const scope = preferredCategoryIds.length ? detail.preferredCategories.map((c) => c.name).join(", ") : null;

  return (
    <div className="space-y-6">
      <PageHeader title={tc("nav.career")} description={t("career.description")} breadcrumbs={[{ label: tc("portal.talent"), href: "/talent" }, { label: tc("nav.career") }]} />

      <SectionCard title={t("career.resume.title")} description={t("career.resume.description")} headingLevel="h2" icon={<FileText aria-hidden="true" className="size-5" />}>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/talent/career/resume?template=classic">{t("career.resume.classic")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/talent/career/resume?template=compact">{t("career.resume.compact")}</Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("career.resume.note")}</p>
      </SectionCard>

      <section aria-labelledby="career-services-heading" className="space-y-3">
        <h2 id="career-services-heading" className="font-heading text-lg font-semibold text-navy">
          {t("career.services.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("career.services.description")}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {CAREER_SERVICES.map((service) => {
            const Icon = SERVICE_ICONS[service];
            return (
              <SectionCard key={service} title={t(`career.service.${service}`)} description={t(`career.service.${service}.description`)} headingLevel="h3" icon={<Icon aria-hidden="true" className="size-5" />}>
                <CareerRequestForm action={requestCareerService} service={service} />
              </SectionCard>
            );
          })}
        </div>
      </section>

      <SectionCard id="skill-gap" title={t("career.gap.title")} description={t("career.gap.description")} headingLevel="h2" icon={<Target aria-hidden="true" className="size-5" />}>
        {gap.totalJobs === 0 || demand.length === 0 ? (
          <EmptyState
            size="sm"
            title={t("career.gap.noData")}
            description={scope ? t("career.gap.noDataScoped", { categories: scope }) : t("career.gap.noDataAll")}
            primaryAction={{ label: t("career.gap.setPreferences"), href: "/talent/profile#preferences" }}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ProgressRing value={gap.coverage} label={t("career.gap.coverage")} size="lg" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("career.gap.coverageText", { value: gap.coverage })}</p>
                <p className="text-muted-foreground">{scope ? t("career.gap.basisScoped", { count: gap.totalJobs, categories: scope }) : t("career.gap.basisAll", { count: gap.totalJobs })}</p>
                {!scope ? (
                  <Link href="/talent/profile#preferences" className="font-medium text-teal-strong underline underline-offset-2">
                    {t("career.gap.narrow")}
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">{t("career.gap.missing")}</h3>
                {gap.missing.length ? (
                  <ul className="mt-2 space-y-2">
                    {gap.missing.map((m) => (
                      <li key={m.skillId} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                        <span className="font-medium">{m.name}</span>
                        <span className="shrink-0 text-muted-foreground">{t("career.gap.jobsListing", { count: m.jobCount, percent: Math.round(m.share * 100) })}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">{t("career.gap.noneMissing")}</p>
                )}
                <Link href="/talent/profile#skills" className="mt-3 inline-block text-sm font-medium text-teal-strong underline underline-offset-2">
                  {t("career.gap.addSkills")}
                </Link>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("career.gap.matched")}</h3>
                {gap.matched.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {gap.matched.map((m) => (
                      <li key={m.skillId} className="rounded-full bg-success-soft px-3 py-1 text-sm text-success-strong">
                        {m.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">{t("career.gap.noneMatched")}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <GraduationCap aria-hidden="true" className="size-4" />
                {t("career.gap.courses")}
              </h3>
              {gap.suggestions.length ? (
                <ul className="mt-2 grid gap-3 md:grid-cols-2">
                  {gap.suggestions.map((s) => (
                    <li key={s.id} className="rounded-lg border p-3 text-sm">
                      <Link href={`/talent/training/courses/${s.slug}`} className="font-medium text-teal-strong underline-offset-2 hover:underline">
                        {s.title}
                      </Link>
                      <p className="text-muted-foreground">{t("career.gap.teaches", { skills: s.covers.map((c) => c.name).join(", ") })}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("career.gap.noCourses")}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("career.gap.method")}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard id="interview-preparation" title={t("career.prep.title")} description={t("career.prep.description")} headingLevel="h2" icon={<BookOpen aria-hidden="true" className="size-5" />}>
        {resources.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {resources.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {r.kind === "video" ? <PlayCircle aria-hidden="true" className="size-4" /> : <BookOpen aria-hidden="true" className="size-4" />}
                  {r.path ? (
                    <Link href={r.path} className="text-teal-strong underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </p>
                {r.summary ? <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{r.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Callout tone="neutral" title={t("career.prep.soon")}>
            <p>{t("career.prep.soonDescription")}</p>
          </Callout>
        )}
      </SectionCard>
    </div>
  );
}
