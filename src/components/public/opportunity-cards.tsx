import { BookOpen, Briefcase, CalendarClock, GraduationCap, MapPin, Plane, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SalaryRangeText } from "@/components/shared/money-text";
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

export function JobMiniCard({ job, headingLevel: Heading = "h3" }: { job: JobCard; headingLevel?: "h3" | "h4" }) {
  const closes = shortDate(job.closesAt);
  return (
    <article className="card-surface lift group relative flex h-full flex-col rounded-2xl p-5" data-testid="job-mini-card">
      <div className="flex flex-wrap gap-1.5">
        {job.isFeatured ? <Chip tone="gold">Featured</Chip> : null}
        {job.isOverseas ? (
          <Chip tone="teal">
            <Plane aria-hidden="true" /> Overseas
          </Chip>
        ) : null}
        <Chip>{humanize(job.employmentType)}</Chip>
      </div>
      <Heading className="mt-3 font-heading text-base font-bold tracking-tight text-foreground">
        <Link href={`/jobs/${job.slug}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
          {job.title}
        </Link>
      </Heading>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="truncate">{job.employer.name}</span>
        {job.employer.verified || job.verifiedEmployer ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-success-strong">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Verified
          </span>
        ) : null}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{placeOf(job)}</span>
        </li>
        {job.salary ? (
          <li className="flex items-center gap-1.5">
            <Briefcase aria-hidden="true" className="size-4 shrink-0" />
            <SalaryRangeText minMinor={job.salary.minMinor} maxMinor={job.salary.maxMinor} currency={job.salary.currency} period={job.salary.period} />
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
    <article className="card-surface lift group relative flex h-full flex-col rounded-2xl p-5" data-testid="course-mini-card">
      <div className="flex flex-wrap gap-1.5">
        {course.isFeatured ? <Chip tone="gold">Featured</Chip> : null}
        <Chip>{humanize(course.mode)}</Chip>
        {course.feeType === "free" ? <Chip tone="teal">Free</Chip> : null}
      </div>
      <Heading className="mt-3 font-heading text-base font-bold tracking-tight text-foreground">
        <Link href={`/training/${course.slug}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
          {course.title}
        </Link>
      </Heading>
      <p className="mt-1 text-sm text-muted-foreground">{course.provider.name}</p>
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
    </article>
  );
}
