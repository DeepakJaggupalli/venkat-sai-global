import { Award, ClipboardCheck, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { CourseCard } from "@/components/training/course-card";
import { EnrolmentCard } from "@/components/training/enrolment-card";
import { groupEnrolments, intlLocale } from "@/components/training/training-rules";
import { getLocale, getT } from "@/i18n/server";
import { listCandidateEnrolments, listPublicCourses } from "@/modules/training/queries";
import { requireOnboardedCandidate } from "../_lib/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("talent.title") };
}

/** My training: current and past enrolments (status, schedule, attendance, results) and courses open now. */
export default async function TalentTrainingPage() {
  const { user, candidate } = await requireOnboardedCandidate();
  const [t, locale, enrolments, open] = await Promise.all([
    getT("talent-training"),
    getLocale(),
    listCandidateEnrolments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }),
    listPublicCourses({ openBatchesOnly: true }, { page: 1, pageSize: 3, offset: 0 }),
  ]);
  const fmt = intlLocale(locale);
  const { current, past } = groupEnrolments(enrolments);
  const enrolledCourseIds = new Set(enrolments.map((e) => e.course.id));
  const suggestions = open.items.filter((c) => !enrolledCourseIds.has(c.id));

  return (
    <div className="space-y-6">
      <PageHeader title={t("talent.title")} description={t("talent.description")} actions={[{ label: t("talent.findCourses"), href: "/talent/training/courses" }]} />

      {enrolments.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={t("talent.emptyTitle")}
          description={t("talent.emptyDescription")}
          primaryAction={{ label: t("talent.findCourses"), href: "/talent/training/courses" }}
          secondaryAction={{ label: t("talent.viewAssessments"), href: "/talent/assessments", variant: "outline" }}
        />
      ) : (
        <>
          <SectionCard title={t("talent.current")} description={t("talent.currentDescription")}>
            {current.length ? (
              <ul className="grid gap-3 xl:grid-cols-2">
                {current.map((e) => (
                  <li key={e.id} className="flex [&>*]:w-full">
                    <EnrolmentCard t={t} item={e} locale={locale} fmtLocale={fmt} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState size="sm" variant="plain" title={t("talent.noCurrentTitle")} description={t("talent.noCurrentDescription")} primaryAction={{ label: t("talent.findCourses"), href: "/talent/training/courses" }} />
            )}
          </SectionCard>
          {past.length ? (
            <SectionCard title={t("talent.past")}>
              <ul className="grid gap-3 xl:grid-cols-2">
                {past.map((e) => (
                  <li key={e.id} className="flex [&>*]:w-full">
                    <EnrolmentCard t={t} item={e} locale={locale} fmtLocale={fmt} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}

      {suggestions.length ? (
        <section aria-labelledby="open-courses" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="open-courses" className="font-heading text-lg font-semibold text-navy">
              {t("talent.openNow")}
            </h2>
            <Link href="/talent/training/courses" className="text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
              {t("talent.seeAllCourses")}
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((course) => (
              <li key={course.id} className="flex">
                <CourseCard course={course} href={`/talent/training/courses/${course.slug}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label={t("talent.relatedLabel")} className="grid gap-3 sm:grid-cols-2">
        <RelatedLink href="/talent/assessments" icon={<ClipboardCheck aria-hidden="true" className="size-5 text-teal-strong" />} title={t("talent.assessmentsLink")} body={t("talent.assessmentsLinkBody")} />
        <RelatedLink href="/talent/certificates" icon={<Award aria-hidden="true" className="size-5 text-teal-strong" />} title={t("talent.certificatesLink")} body={t("talent.certificatesLinkBody")} />
      </nav>
    </div>
  );
}

function RelatedLink({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="flex gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {icon}
      <span className="min-w-0">
        <span className="block font-heading font-semibold text-navy">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </Link>
  );
}
