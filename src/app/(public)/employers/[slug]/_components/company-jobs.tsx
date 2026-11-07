import { Briefcase, CalendarClock, MapPin, Plane, Wallet } from "lucide-react";
import Link from "next/link";

import { DateText } from "@/components/shared/date-text";
import { formatSalaryRange, humanize } from "@/lib/format";
import type { JobCard } from "@/modules/jobs/types";

/** Compact list of an employer's public jobs (each row links to the public job page). */
export function CompanyJobs({ jobs, timeZone }: { jobs: JobCard[]; timeZone: string }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border/80 bg-card" aria-label="Open jobs">
      {jobs.map((job) => {
        const place = [job.location.city, job.location.countryName].filter(Boolean).join(", ");
        const salary = job.salary ? formatSalaryRange(job.salary.minMinor, job.salary.maxMinor, job.salary.currency, job.salary.period) : null;
        return (
          <li key={job.id} className="relative p-5 focus-within:bg-surface-subtle hover:bg-surface-subtle">
            <h3 className="font-heading text-base font-semibold text-navy">
              <Link href={`/jobs/${job.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none">
                {job.title}
              </Link>
            </h3>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {place ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {place}
                  {job.location.extraLocations > 0 ? ` +${job.location.extraLocations}` : ""}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="size-3.5" aria-hidden="true" />
                {humanize(job.employmentType)} · {humanize(job.workMode)}
              </span>
              {job.isOverseas ? (
                <span className="inline-flex items-center gap-1.5">
                  <Plane className="size-3.5" aria-hidden="true" />
                  Overseas
                </span>
              ) : null}
              {salary ? (
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="size-3.5" aria-hidden="true" />
                  {salary}
                </span>
              ) : null}
              {job.closesAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Closes <DateText value={job.closesAt} timeZone={timeZone} />
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
