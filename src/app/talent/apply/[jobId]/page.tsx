import { AlertCircle, ArrowRight, CircleCheck, ExternalLink, GraduationCap, MapPin, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmployerLine, jobLocationText } from "@/components/jobs/job-card";
import { salaryText } from "@/components/jobs/labels";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressRing } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { getLocale, getT } from "@/i18n/server";
import { requireCandidate } from "@/modules/candidates/guard";
import { isMinor } from "@/modules/candidates/profile-rules";
import { getCandidateDashboardSummary } from "@/modules/candidates/queries";
import { getFile, toFileSummary } from "@/modules/files";
import { getPublicJobBySlug } from "@/modules/jobs/queries";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

import { findOwnApplicationForJob } from "../../applications/_lib/queries";
import { jobSlugById } from "./_lib/queries";
import { ApplyForm } from "./apply-form";

type PageProps = { params: Promise<{ jobId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-jobs");
  return { title: t("apply.metaTitle") };
}

/**
 * Apply for a job (spec 8.6): job summary, a review of the profile snapshot the employer will receive
 * (with gaps and links to fix them), resume, screening questions, cover letter, explicit consent and a
 * declaration. Free for candidates, always.
 */
export default async function ApplyPage({ params }: PageProps) {
  const session = await requireCandidate();
  const { user, candidate } = session;
  const { jobId } = await params;
  const [t, td, locale] = await Promise.all([getT("talent-jobs"), getT("talent-dashboard"), getLocale()]);
  const slug = await jobSlugById(jobId);
  const job = slug ? await getPublicJobBySlug(slug, { userId: user.id, candidateId: candidate.id }) : null;

  if (!job) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("apply.unavailableTitle")} />
        <EmptyState
          icon={<AlertCircle />}
          title={t("apply.unavailableTitle")}
          description={t("apply.unavailableBody")}
          primaryAction={{ label: t("discover.findJobs"), href: "/talent/jobs" }}
          secondaryAction={{ label: t("saved.title"), href: "/talent/saved" }}
        />
      </div>
    );
  }

  const breadcrumb = <PortalBreadcrumb items={[{ label: t("discover.title"), href: "/talent/jobs" }, { label: job.title, href: `/talent/jobs/${job.slug}` }, { label: t("apply.breadcrumb") }]} />;
  const existing = await findOwnApplicationForJob(candidate.id, job.id);
  const header = <PageHeader title={t("apply.title", { title: job.title })} description={t("apply.description")} backLink={{ href: `/talent/jobs/${job.slug}`, label: t("apply.backToJob") }} />;

  if (existing && existing.status !== "withdrawn") {
    return (
      <div className="space-y-6">
        {breadcrumb}
        {header}
        <Callout tone="success" title={t("apply.duplicateTitle")} action={{ label: t("detail.viewApplication"), href: `/talent/applications/${existing.id}` }}>
          {t("apply.alreadyAppliedBody", { code: existing.code })}
        </Callout>
      </div>
    );
  }

  if (job.applyMode !== "platform" || job.displayStatus !== "published") {
    return (
      <div className="space-y-6">
        {breadcrumb}
        {header}
        {job.applyMode === "external_url" && job.externalApplyUrl ? (
          <Callout tone="info" title={t("apply.externalTitle")} action={{ label: t("detail.applyExternal"), href: job.externalApplyUrl, external: true, icon: <ExternalLink aria-hidden="true" /> }}>
            {t("detail.externalNotice")}
          </Callout>
        ) : (
          <Callout tone="neutral" title={t("apply.unavailableTitle")}>
            {t("apply.unavailableBody")}
          </Callout>
        )}
      </div>
    );
  }

  // The recruitment module refuses this too; checking first spares the candidate a form they cannot send.
  if (job.isOverseas && isMinor(candidate.dateOfBirth, false)) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        {header}
        <Callout tone="info" title={t("apply.minorTitle")} icon={<GraduationCap />} action={{ label: t("apply.minorAction"), href: "/talent/training" }}>
          {t("apply.minorBody")}
        </Callout>
      </div>
    );
  }

  const [summary, resumeFile, currencies, countries] = await Promise.all([
    getCandidateDashboardSummary(session, { hints: 6 }),
    candidate.resumeFileId ? getFile(candidate.resumeFileId) : Promise.resolve(null),
    currencyOptions(),
    countryOptions(),
  ]);
  const salary = salaryText(t, job.salary, locale);
  const countryName = candidate.currentCountryCode ? (countries.find((c) => c.value === candidate.currentCountryCode)?.label ?? candidate.currentCountryCode) : null;
  const place = [candidate.city, candidate.stateRegion, countryName].filter(Boolean).join(", ");
  const years = candidate.totalExperienceMonths !== null ? Math.floor(candidate.totalExperienceMonths / 12) : null;
  const snapshot = [
    { key: "name", label: t("apply.snapshotName"), value: user.displayName },
    { key: "headline", label: t("apply.snapshotHeadline"), value: candidate.headline ?? candidate.currentJobTitle },
    { key: "location", label: t("apply.snapshotLocation"), value: place || null },
    { key: "experience", label: t("apply.snapshotExperience"), value: years !== null ? t("apply.snapshotYears", { count: years }) : null },
  ];

  return (
    <div className="space-y-6">
      {breadcrumb}
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 min-w-0 lg:order-1">
          <ApplyForm
            jobId={job.id}
            jobTitle={job.title}
            employerName={job.employer.name}
            questions={job.screeningQuestions}
            profileResume={resumeFile ? toFileSummary(resumeFile) : null}
            currencies={currencies}
            defaultCurrency={job.salary?.currency ?? ""}
            defaultPeriod={job.salary?.period ?? ""}
          />
        </div>
        <aside className="order-1 space-y-4 lg:order-2" aria-label={t("apply.sidebarLabel")}>
          <SectionCard title={t("apply.jobSummary")} headingLevel="h2">
            <div className="space-y-2">
              <p className="font-heading font-semibold text-navy">{job.title}</p>
              <EmployerLine job={job} t={t} />
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin aria-hidden="true" className="size-4" />
                {jobLocationText(job, t)}
              </p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Wallet aria-hidden="true" className="size-4" />
                {salary ?? t("salary.notDisclosed")}
              </p>
              <Link href={`/talent/jobs/${job.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
                {t("apply.viewFullJob")}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
          </SectionCard>
          <SectionCard title={t("apply.snapshotTitle")} description={t("apply.snapshotDescription")} headingLevel="h2">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <ProgressRing value={summary.profileCompleteness} label={t("apply.completeness")} size="sm" />
                <p className="text-sm text-muted-foreground">{t("apply.completenessText", { value: summary.profileCompleteness })}</p>
              </div>
              <dl className="space-y-2 text-sm">
                {snapshot.map((row) => (
                  <div key={row.key} className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className={row.value ? "font-medium" : "text-warning-strong"}>{row.value ?? t("apply.missing")}</dd>
                  </div>
                ))}
                <div className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-muted-foreground">{t("apply.snapshotResume")}</dt>
                  <dd className={summary.hasResume ? "font-medium" : "text-warning-strong"}>{summary.hasResume ? t("apply.onFile") : t("apply.missing")}</dd>
                </div>
              </dl>
              {summary.nextActions.length ? (
                <div>
                  <p className="text-sm font-medium">{t("apply.gapsTitle")}</p>
                  <ul className="mt-2 space-y-1.5">
                    {summary.nextActions.map((a) => {
                      const key = `next.${a.key}`;
                      const label = td(key) === key ? a.label : td(key);
                      return (
                        <li key={a.key}>
                          <Link href={a.href} className="inline-flex items-start gap-1.5 text-sm text-teal-strong underline-offset-2 hover:underline">
                            <ArrowRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                            {label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">{t("apply.gapsHint")}</p>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-success-strong">
                  <CircleCheck aria-hidden="true" className="size-4" />
                  {t("apply.profileReady")}
                </p>
              )}
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
