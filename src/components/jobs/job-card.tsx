import { Briefcase, Building2, CalendarClock, CheckCircle2, Clock, Laptop, MapPin, Plane, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";

import { OrgAvatar } from "@/components/shared/avatars";
import { formatRelativeTime } from "@/components/layout/time";
import { cn } from "@/lib/utils";
import type { RecommendationReason } from "@/modules/jobs/recommendation-scoring";
import type { JobCard } from "@/modules/jobs/types";

import { daysUntil, enumLabel, experienceText, intlLocale, isClosingSoon, isNewJob, placeText, salaryText, type Translate } from "./labels";
import { RecommendationReasons } from "./recommendation-reasons";
import { SaveJobButton } from "./save-job-button";

export type JobCardViewer = { signedIn: boolean; returnTo: string };

type JobCardViewProps = {
  job: JobCard;
  t: Translate;
  locale: string;
  /** Detail page of this job (public /jobs/[slug] or the People Portal /talent/jobs/[slug]). */
  href: string;
  viewer: JobCardViewer;
  headingLevel?: "h2" | "h3";
  /** "Why this job" reasons for recommended jobs. */
  reasons?: RecommendationReason[];
  showSave?: boolean;
  now?: Date;
  className?: string;
};

/** Employer line: confidential description, or the organisation with its verification state. */
export function EmployerLine({ job, t, className }: { job: Pick<JobCard, "employer" | "verifiedEmployer">; t: Translate; className?: string }) {
  const { employer } = job;
  const verified = employer.verified || job.verifiedEmployer;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}>
      <span className="font-medium text-foreground">{employer.name}</span>
      {employer.confidential ? (
        <span className="inline-flex items-center gap-1 text-xs">
          <Building2 aria-hidden="true" className="size-3.5" />
          {t("employer.confidential")}
        </span>
      ) : null}
      {verified ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success-strong">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {t("employer.verified")}
        </span>
      ) : employer.managedByVenkatSai ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-strong">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {t("employer.managed")}
        </span>
      ) : (
        <span className="text-xs">{t("employer.unverified")}</span>
      )}
    </p>
  );
}

/** Small labelled tags under the title (featured, overseas, visa, applied). Text, never colour alone. */
function JobTags({ job, t, now }: { job: JobCard; t: Translate; now: Date }) {
  const tags: { key: string; label: string; className: string; icon?: typeof Sparkles }[] = [];
  if (job.hasApplied) tags.push({ key: "applied", label: t("tag.applied"), className: "bg-success-soft text-success-strong", icon: CheckCircle2 });
  if (job.isFeatured) tags.push({ key: "featured", label: t("tag.featured"), className: "bg-gold-soft text-gold-strong", icon: Sparkles });
  if (isNewJob(job.publishedAt, now)) tags.push({ key: "new", label: t("tag.new"), className: "bg-info-soft text-info" });
  if (job.isOverseas) tags.push({ key: "overseas", label: t("tag.overseas"), className: "bg-teal-soft text-teal-strong", icon: Plane });
  if (job.visaSponsorship === "provided") tags.push({ key: "visa", label: t("tag.visa"), className: "bg-surface-subtle text-foreground" });
  if (job.accommodationProvided) tags.push({ key: "accommodation", label: t("tag.accommodation"), className: "bg-surface-subtle text-foreground" });
  if (!tags.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("card.highlights")}>
      {tags.map(({ key, label, className, icon: Icon }) => (
        <li key={key} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", className)}>
          {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Location of a job as text ("Remote", "Dubai, United Arab Emirates +2 more"). */
export function jobLocationText(job: Pick<JobCard, "location" | "workMode">, t: Translate): string {
  const place = placeText(job.location);
  const base = place || (job.workMode === "remote" ? t("location.remote") : t("location.notStated"));
  return job.location.extraLocations > 0 ? t("location.more", { place: base, count: job.location.extraLocations }) : base;
}

/**
 * Job card used by every job list (public search, People Portal discovery, saved jobs, dashboard).
 * The title link covers the card; the save button stays independently clickable above it.
 */
export function JobCardView({ job, t, locale, href, viewer, headingLevel = "h3", reasons, showSave = true, now = new Date(), className }: JobCardViewProps) {
  const Heading = headingLevel;
  const salary = salaryText(t, job.salary, locale);
  const experience = experienceText(t, job.experienceMinYears, job.experienceMaxYears);
  const closesIn = daysUntil(job.closesAt, now);
  const soon = isClosingSoon(job.closesAt, now);
  const loc = intlLocale(locale);

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors duration-200 hover:border-teal/60 focus-within:border-teal/60 sm:p-5",
        className,
      )}
      data-testid="job-card"
    >
      <div className="flex items-start gap-3">
        {job.employer.confidential ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-muted-foreground" aria-hidden="true">
            <Building2 className="size-5" />
          </span>
        ) : (
          <OrgAvatar name={job.employer.name} src={job.employer.logoThumbnailUrl ?? job.employer.logoUrl} size="md" verified={job.employer.verified} />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <Heading className="font-heading text-base leading-snug font-semibold text-navy sm:text-lg">
            <Link href={href} className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:underline">
              {job.title}
            </Link>
          </Heading>
          <EmployerLine job={job} t={t} />
        </div>
        {showSave ? <SaveJobButton jobId={job.id} jobTitle={job.title} initialSaved={job.isSaved} signedIn={viewer.signedIn} returnTo={viewer.returnTo} /> : null}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <li className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">{t("card.location")}: </span>
          <span className="truncate">{jobLocationText(job, t)}</span>
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Briefcase aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">{t("card.employmentType")}: </span>
          {enumLabel(t, "employmentType", job.employmentType)}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Laptop aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">{t("card.workMode")}: </span>
          {enumLabel(t, "workMode", job.workMode)}
        </li>
        {experience ? (
          <li className="inline-flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">{t("card.experience")}: </span>
            {experience}
          </li>
        ) : null}
      </ul>

      <p className="inline-flex items-center gap-1.5 text-sm">
        <Wallet aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">{t("card.salary")}: </span>
        {salary ? <span className="font-medium text-foreground">{salary}</span> : <span className="text-muted-foreground">{t("salary.notDisclosed")}</span>}
      </p>

      {job.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{job.summary}</p> : null}

      {reasons?.length ? <RecommendationReasons reasons={reasons} t={t} compact /> : null}

      <JobTags job={job} t={t} now={now} />

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        {job.publishedAt ? (
          <span>
            {t("card.posted")}{" "}
            <time dateTime={new Date(job.publishedAt).toISOString()} suppressHydrationWarning>
              {formatRelativeTime(job.publishedAt, loc, now.getTime())}
            </time>
          </span>
        ) : null}
        {closesIn !== null ? (
          <span className={cn("inline-flex items-center gap-1", soon && "font-medium text-warning-strong")}>
            <CalendarClock aria-hidden="true" className="size-3.5" />
            {closesIn === 0 ? t("card.closesToday") : t("card.closesIn", { count: closesIn })}
          </span>
        ) : null}
        <span className="ms-auto font-mono">{job.code}</span>
      </div>
    </article>
  );
}
