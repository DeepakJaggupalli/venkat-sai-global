import { BookOpen, Briefcase, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { JobCard } from "@/modules/jobs/types";
import type { CatalogueCourse } from "@/modules/training/queries";

import { CtaLink } from "../cta-link";
import { CourseMiniCard, JobMiniCard } from "../opportunity-cards";
import { Section, SectionHeading, type SectionTone } from "../section";

function Column({ id, icon, title, viewAll, children }: { id: string; icon: ReactNode; title: string; viewAll: { href: string; label: string; cta: string }; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" aria-labelledby={id} role="region">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={id} className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight text-foreground">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-teal-soft text-teal-strong [&_svg]:size-4">
            {icon}
          </span>
          {title}
        </h3>
        <CtaLink href={viewAll.href} cta={viewAll.cta} location="home_opportunities" variant="link">
          {viewAll.label}
        </CtaLink>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

/** Latest and featured opportunities: jobs, internships and training programmes. Columns without items are left out (the page hides the section when all are empty). */
export function OpportunitiesSection({
  tone = "subtle",
  jobs,
  internships,
  courses,
  heading,
  intro,
}: {
  jobs: readonly JobCard[];
  internships: readonly JobCard[];
  courses: readonly CatalogueCourse[];
  heading?: string | null;
  intro?: string | null;
} & { tone?: SectionTone }) {
  const columns = [jobs.length, internships.length, courses.length].filter(Boolean).length;
  if (!columns) return null;
  return (
    <Section tone={tone} labelledBy="home-opportunities-title" data-testid="home-opportunities">
      <SectionHeading
        id="home-opportunities-title"
        eyebrow="Open now"
        title={heading || "Jobs and training open right now"}
        intro={intro || "Jobs, internships and training programmes published on Venkat Sai Global. Applying is always free for candidates."}
        action={
          <CtaLink href="/sign-up" cta="build_career_profile" location="home_opportunities" variant="outline" arrow>
            Build your career profile
          </CtaLink>
        }
      />
      <div className={cn("mt-12 grid gap-8", columns === 3 ? "lg:grid-cols-3" : columns === 2 ? "md:grid-cols-2" : "max-w-xl")}>
        {jobs.length ? (
          <Column id="home-opp-jobs" icon={<Briefcase />} title="Jobs" viewAll={{ href: "/jobs", label: "All jobs", cta: "view_all_jobs" }}>
            {jobs.map((job) => (
              <JobMiniCard key={job.id} job={job} headingLevel="h4" />
            ))}
          </Column>
        ) : null}
        {internships.length ? (
          <Column id="home-opp-internships" icon={<GraduationCap />} title="Internships" viewAll={{ href: "/jobs?type=internship", label: "All internships", cta: "view_all_internships" }}>
            {internships.map((job) => (
              <JobMiniCard key={job.id} job={job} headingLevel="h4" />
            ))}
          </Column>
        ) : null}
        {courses.length ? (
          <Column id="home-opp-training" icon={<BookOpen />} title="Training" viewAll={{ href: "/training", label: "All programmes", cta: "view_all_training" }}>
            {courses.map((course) => (
              <CourseMiniCard key={course.id} course={course} headingLevel="h4" />
            ))}
          </Column>
        ) : null}
      </div>
    </Section>
  );
}
