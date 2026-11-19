import { BookOpen, Briefcase, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { JobCard } from "@/modules/jobs/types";
import type { CatalogueCourse } from "@/modules/training/queries";

import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { CourseMiniCard, JobMiniCard } from "../opportunity-cards";
import { Section, SectionHeading, type SectionTone } from "../section";

/** Most cards shown per column; the "See more" pill leads to the full list. */
export const OPPORTUNITIES_PER_COLUMN = 3;

function Column({ id, icon, title, more, children }: { id: string; icon: ReactNode; title: string; more: { href: string; label: string; cta: string }; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" aria-labelledby={id} role="region">
      <h3 id={id} className="mb-4 flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight text-foreground">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-teal-soft text-teal-strong [&_svg]:size-4">
          {icon}
        </span>
        {title}
      </h3>
      <div className="grid gap-3">{children}</div>
      <CtaLink href={more.href} cta={more.cta} location="home_opportunities" variant="outline" arrow className="mt-4 self-start" data-testid={`${id}-more`}>
        {more.label}
        <span className="sr-only">: {title}</span>
      </CtaLink>
    </div>
  );
}

/**
 * Latest and featured opportunities: jobs, internships and training programmes, at most three per column, each
 * column ending in a "See more" pill. Columns without items are left out (the page hides the section when all are empty).
 */
export function OpportunitiesSection({
  tone = "subtle",
  jobs,
  internships,
  courses,
  heading,
  t = EN_MARKETING,
}: {
  jobs: readonly JobCard[];
  internships: readonly JobCard[];
  courses: readonly CatalogueCourse[];
  heading?: string | null;
  t?: MarketingT;
} & { tone?: SectionTone }) {
  const max = OPPORTUNITIES_PER_COLUMN;
  const columns = [jobs.length, internships.length, courses.length].filter(Boolean).length;
  if (!columns) return null;
  return (
    <Section tone={tone} labelledBy="home-opportunities-title" data-testid="home-opportunities">
      <SectionHeading
        id="home-opportunities-title"
        eyebrow={t("opportunities.eyebrow")}
        title={heading || t("opportunities.title")}
        action={
          <CtaLink href="/sign-up?intent=candidate" cta="build_career_profile" location="home_opportunities" variant="outline" arrow>
            {t("common.buildProfile")}
          </CtaLink>
        }
      />
      <div className={cn("mt-8 grid gap-8", columns === 3 ? "lg:grid-cols-3" : columns === 2 ? "md:grid-cols-2" : "max-w-xl")}>
        {jobs.length ? (
          <Column id="home-opp-jobs" icon={<Briefcase />} title={t("opportunities.jobs")} more={{ href: "/jobs", label: t("opportunities.seeMore"), cta: "view_all_jobs" }}>
            {jobs.slice(0, max).map((job) => (
              <JobMiniCard key={job.id} job={job} headingLevel="h4" />
            ))}
          </Column>
        ) : null}
        {internships.length ? (
          <Column id="home-opp-internships" icon={<GraduationCap />} title={t("opportunities.internships")} more={{ href: "/jobs?type=internship", label: t("opportunities.seeMore"), cta: "view_all_internships" }}>
            {internships.slice(0, max).map((job) => (
              <JobMiniCard key={job.id} job={job} headingLevel="h4" />
            ))}
          </Column>
        ) : null}
        {courses.length ? (
          <Column id="home-opp-training" icon={<BookOpen />} title={t("opportunities.training")} more={{ href: "/training", label: t("opportunities.seeMore"), cta: "view_all_training" }}>
            {courses.slice(0, max).map((course) => (
              <CourseMiniCard key={course.id} course={course} headingLevel="h4" />
            ))}
          </Column>
        ) : null}
      </div>
    </Section>
  );
}
