import { BookOpen, Briefcase, CalendarClock, GraduationCap, MapPin, Plane, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SalaryRangeText } from "@/components/shared/money-text";
import { CourseCover } from "@/components/training/course-cover";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { JobCard } from "@/modules/jobs/types";
import type { CatalogueCourse } from "@/modules/training/queries";

/**
 * Compact opportunity cards for marketing pages (homepage strip, industry and destination pages).
 * The full job board lives at /jobs; these cards only link into it.
 */

function placeOf(job: JobCard): string {
  const parts = [job.location.city, job.location.stateRegion, job.location.countryName].filter(Boolean);
  const place = parts.length ? parts.slice(0, 2).join(", ") : job.workMode === "remote" ? "Remote" : "Location on request";
  return job.location.extraLocations > 0 ? `${place} +${job.location.extraLocations} more` : place;
}

function shortDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(value);
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" | "teal" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5",
        tone === "gold" && "bg-gold-soft text-gold-strong",
        tone === "teal" && "bg-teal-soft text-teal-strong",
        tone === "neutral" && "bg-surface-subtle text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function JobMiniCard({
  job,
  headingLevel: Heading = "h3",
  showDeadline = true,
}: {
  job: JobCard;
  headingLevel?: "h3" | "h4";
  /** "Apply by <date>" line (left out on the homepage strip). */
  showDeadline?: boolean;
}) {
  const closes = showDeadline ? shortDate(job.closesAt) : null;
  return (
    <article className="card-surface lift group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl p-5" data-testid="job-mini-card">
      <div className="flex flex-wrap gap-1.5">
        {job.isFeatured ? <Chip tone="gold">Featured</Chip> : null}
        {job.isOverseas ? (
          <Chip tone="teal">
            <Plane aria-hidden="true" /> Overseas
          </Chip>
        ) : null}
        <Chip>{humanize(job.employmentType)}</Chip>
      </div>
      <Heading className="mt-3 line-clamp-2 font-heading text-base font-bold tracking-tight break-words text-foreground">
        <Link href={`/jobs/${job.slug}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
          {job.title}
        </Link>
      </Heading>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">{job.employer.name}</span>
        {job.employer.verified || job.verifiedEmployer ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-success-strong">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Verified
          </span>
        ) : null}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex min-w-0 items-center gap-1.5">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{placeOf(job)}</span>
        </li>
        {job.salary ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <Briefcase aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              <SalaryRangeText minMinor={job.salary.minMinor} maxMinor={job.salary.maxMinor} currency={job.salary.currency} period={job.salary.period} />
            </span>
          </li>
        ) : null}
        {closes ? (
          <li className="flex items-center gap-1.5">
            <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
            Apply by {closes}
          </li>
        ) : null}
      </ul>
    </article>
  );
}

export function CourseMiniCard({ course, headingLevel: Heading = "h3" }: { course: CatalogueCourse; headingLevel?: "h3" | "h4" }) {
  const starts = course.nextBatch?.startsOn ? shortDate(new Date(`${course.nextBatch.startsOn}T00:00:00Z`)) : null;
  const duration = course.durationWeeks ? `${course.durationWeeks} week${course.durationWeeks === 1 ? "" : "s"}` : course.durationHours ? `${course.durationHours} hours` : null;
  return (
    <article className="card-surface lift group relative flex h-full min-w-0 gap-4 overflow-hidden rounded-2xl p-4 sm:p-5" data-testid="course-mini-card">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-teal-soft sm:size-24">
        <CourseCover course={course} sizes="96px" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-1.5">
          {course.isFeatured ? <Chip tone="gold">Featured</Chip> : null}
          <Chip>{humanize(course.mode)}</Chip>
          {course.feeType === "free" ? <Chip tone="teal">Free</Chip> : null}
        </div>
        <Heading className="mt-3 line-clamp-2 font-heading text-base font-bold tracking-tight break-words text-foreground">
          <Link href={`/training/${course.slug}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
            {course.title}
          </Link>
        </Heading>
        <p className="mt-1 truncate text-sm text-muted-foreground">{course.provider.name}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {duration ? (
            <li className="flex items-center gap-1.5">
              <BookOpen aria-hidden="true" className="size-4 shrink-0" />
              {duration}
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <GraduationCap aria-hidden="true" className="size-4 shrink-0" />
            {starts ? `Next batch starts ${starts}` : "Batch dates to be announced"}
          </li>
        </ul>
      </div>
    </article>
  );
}
