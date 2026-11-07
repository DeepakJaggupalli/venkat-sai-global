import { BookOpen, Briefcase, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

import type { JobCard } from "@/modules/jobs/types";
import type { CatalogueCourse } from "@/modules/training/queries";

import { CtaLink } from "../cta-link";
import { CourseMiniCard, JobMiniCard } from "../opportunity-cards";
import { Section, SectionHeading } from "../section";

function Column({ id, icon, title, viewAll, empty, children }: { id: string; icon: ReactNode; title: string; viewAll: { href: string; label: string; cta: string }; empty: ReactNode | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" aria-labelledby={id} role="region">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={id} className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-navy text-white [&_svg]:size-4">
            {icon}
          </span>
          {title}
        </h3>
        <CtaLink href={viewAll.href} cta={viewAll.cta} location="home_opportunities" variant="link">
          {viewAll.label}
        </CtaLink>
      </div>
      {empty ?? <div className="grid gap-3">{children}</div>}
    </div>
  );
}

function EmptyColumn({ text, action }: { text: string; action: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
      <p>{text}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

/** Latest and featured opportunities: jobs, internships and training programmes, each with an honest empty state. */
export function OpportunitiesSection({
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
}) {
  return (
    <Section tone="subtle" labelledBy="home-opportunities-title" data-testid="home-opportunities">
      <SectionHeading
        id="home-opportunities-title"
        eyebrow="Opportunities"
        title={heading || "Open opportunities right now"}
        intro={intro || "Jobs, internships and training programmes published on Venkat Sai Global. Applying is always free for candidates."}
        action={
          <CtaLink href="/sign-up" cta="build_career_profile" location="home_opportunities" variant="primary">
            Build your career profile
          </CtaLink>
        }
      />
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <Column
          id="home-opp-jobs"
          icon={<Briefcase />}
          title="Jobs"
          viewAll={{ href: "/jobs", label: "All jobs", cta: "view_all_jobs" }}
          empty={
            jobs.length ? null : (
              <EmptyColumn
                text="No jobs are open at the moment. Create your profile and we will tell you when roles that match your skills are published."
                action={
                  <CtaLink href="/sign-up" cta="job_alerts_signup" location="home_opportunities" variant="link">
                    Create your profile
                  </CtaLink>
                }
              />
            )
          }
        >
          {jobs.map((job) => (
            <JobMiniCard key={job.id} job={job} headingLevel="h4" />
          ))}
        </Column>
        <Column
          id="home-opp-internships"
          icon={<GraduationCap />}
          title="Internships"
          viewAll={{ href: "/jobs?type=internship", label: "All internships", cta: "view_all_internships" }}
          empty={
            internships.length ? null : (
              <EmptyColumn
                text="No internships are open right now. Institutions and employers can publish internship programmes through their portals."
                action={
                  <CtaLink href="/institutions" cta="institutions_from_internships" location="home_opportunities" variant="link">
                    For institutions
                  </CtaLink>
                }
              />
            )
          }
        >
          {internships.map((job) => (
            <JobMiniCard key={job.id} job={job} headingLevel="h4" />
          ))}
        </Column>
        <Column
          id="home-opp-training"
          icon={<BookOpen />}
          title="Training"
          viewAll={{ href: "/training", label: "All programmes", cta: "view_all_training" }}
          empty={
            courses.length ? null : (
              <EmptyColumn
                text="New training programmes are being prepared. Browse the catalogue for the latest schedule."
                action={
                  <CtaLink href="/training" cta="training_catalogue" location="home_opportunities" variant="link">
                    View the training catalogue
                  </CtaLink>
                }
              />
            )
          }
        >
          {courses.map((course) => (
            <CourseMiniCard key={course.id} course={course} headingLevel="h4" />
          ))}
        </Column>
      </div>
    </Section>
  );
}
