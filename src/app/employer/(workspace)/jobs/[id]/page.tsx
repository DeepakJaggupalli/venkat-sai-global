import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KanbanSquare, Pencil } from "lucide-react";

import { JobActions } from "@/components/employer/job-actions";
import { CLOSE_REASON_LABELS, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS, SCREENING_TYPE_LABELS, VISA_SPONSORSHIP_LABELS, WORK_MODE_LABELS } from "@/components/employer/labels";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { SalaryRangeText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SafeHtml } from "@/components/shared/safe-html";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineItem } from "@/components/shared/timeline";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { canTransition } from "@/modules/jobs/lifecycle";
import { getJobForEmployer } from "@/modules/jobs/queries";
import { getEmployerPipelineOverview } from "@/modules/recruitment/application-queries";
import { PIPELINE_COLUMNS } from "@/modules/recruitment/workflow";

import { loadSubmitGate } from "../_lib/form-data";
import { loadEntityTimeline } from "../_lib/timeline";

export const metadata: Metadata = { title: "Job" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JOB_EVENT_LABELS: Record<string, string> = {
  "job.created": "Draft created",
  "job.duplicated": "Created as a copy",
  "job.updated": "Details updated",
  "job.submitted": "Submitted for review",
  "job.submission_withdrawn": "Withdrawn from review",
  "job.published": "Approved and published",
  "job.changes_requested": "Changes requested by Venkat Sai",
  "job.rejected": "Not approved by Venkat Sai",
  "job.paused": "Paused",
  "job.resumed": "Resumed",
  "job.closed": "Closed",
  "job.expired": "Closed automatically (deadline passed)",
  "job.extended": "Dates extended",
  "job.reopened": "Reopened",
  "job.rescheduled": "Publication rescheduled",
  "job.archived": "Archived",
  "job.promoted": "Featured",
};
const TONES: Record<string, TimelineItem["tone"]> = {
  "job.published": "success",
  "job.changes_requested": "warning",
  "job.rejected": "danger",
  "job.closed": "neutral",
  "job.expired": "neutral",
  "job.submitted": "info",
};

const yesNo = (v: boolean | null) => (v === true ? "Yes" : v === false ? "No" : null);

export default async function EmployerJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("employer", "employer.jobs.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getJobForEmployer(ctx, id);
  if (!detail) notFound();
  const job = detail.job;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canManage = orgCan(ctx, "employer.jobs.manage");
  const canPipeline = orgCan(ctx, "employer.pipeline.view");

  const [events, pipeline, gate] = await Promise.all([
    loadEntityTimeline({ organizationId: ctx.organization.id, entityType: "job", entityId: job.id, actions: Object.keys(JOB_EVENT_LABELS), metadataKeys: ["reason"] }),
    canPipeline
      ? getEmployerPipelineOverview(ctx).catch((error: unknown) => {
          logger.warn("Pipeline overview failed", { error });
          return null;
        })
      : Promise.resolve(null),
    canManage ? loadSubmitGate(ctx, job.status) : Promise.resolve(null),
  ]);
  const counts = pipeline?.jobs.find((j) => j.id === job.id);
  const submitBlockedReason = gate ? (gate.blockReason ?? gate.upgradeReason ?? null) : null;

  const timeline: TimelineItem[] = events.map((e) => {
    const reason = typeof e.metadata.reason === "string" ? e.metadata.reason : null;
    const note =
      reason && (e.action === "job.changes_requested" || e.action === "job.rejected") ? (
        <span>
          <span className="font-medium">Reviewer feedback:</span> {reason}
        </span>
      ) : reason && e.action === "job.closed" ? (
        (CLOSE_REASON_LABELS as Record<string, string>)[reason] ?? null
      ) : null;
    return {
      id: e.id,
      title: JOB_EVENT_LABELS[e.action] ?? e.action,
      at: e.at,
      actor: e.byVenkatSai ? { name: "Venkat Sai" } : e.actorName ? { name: e.actorName } : null,
      note,
      tone: TONES[e.action],
    };
  });

  const location = [job.city, job.stateRegion, job.countryCode].filter(Boolean).join(", ");
  const reviewReason = detail.latestReview?.reason ?? job.moderationNote;

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Jobs", href: "/employer/jobs" }, { label: job.title }]} />
      <PageHeader
        title={job.title}
        eyebrow={job.code}
        status={<StatusBadge status={detail.displayStatus} domain="job" />}
        backLink={{ href: "/employer/jobs", label: "Back to jobs" }}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {location ? <span>{location}</span> : null}
            <span>{EMPLOYMENT_TYPE_LABELS[job.employmentType]}</span>
            <span>{WORK_MODE_LABELS[job.workMode]}</span>
            {job.isOverseas ? <StatusBadge tone="info" size="sm">Overseas</StatusBadge> : null}
            {job.isConfidential ? <StatusBadge tone="neutral" size="sm">Confidential</StatusBadge> : null}
            {job.status === "published" ? <VerificationBadge state={job.infoSource} /> : null}
          </span>
        }
        actions={[
          ...(canManage && canTransition("edit", job.status) ? [{ label: "Edit job", href: `/employer/jobs/${job.id}/edit`, icon: <Pencil aria-hidden="true" />, variant: "outline" as const }] : []),
          ...(canPipeline ? [{ label: "Open pipeline", href: `/employer/jobs/${job.id}/pipeline`, icon: <KanbanSquare aria-hidden="true" />, variant: "outline" as const }] : []),
        ]}
      />

      {canManage ? <JobActions jobId={job.id} title={job.title} status={job.status} submitBlockedReason={submitBlockedReason} /> : null}

      {(job.status === "changes_requested" || job.status === "rejected") && reviewReason ? (
        <Callout tone="warning" title={job.status === "rejected" ? "Venkat Sai did not approve this job" : "Venkat Sai asked for changes"} action={canManage ? { label: "Edit job", href: `/employer/jobs/${job.id}/edit` } : undefined}>
          <span className="font-medium">Reviewer feedback:</span> {reviewReason}
        </Callout>
      ) : null}
      {job.status === "pending_approval" ? (
        <Callout tone="info" title="In review">
          Venkat Sai is checking this job{detail.latestReview ? ` (${detail.latestReview.code})` : ""}. It is not visible to candidates until approved.
        </Callout>
      ) : null}
      {detail.displayStatus === "scheduled" && job.publishedAt ? (
        <Callout tone="info" title="Scheduled">
          Approved. It goes live on <DateText value={job.publishedAt} mode="datetime" timeZone={timeZone} />.
        </Callout>
      ) : null}

      <SectionCard
        title="Applications"
        description="Applications shared with you by stage"
        action={canPipeline ? { label: "Open pipeline", href: `/employer/jobs/${job.id}/pipeline` } : undefined}
      >
        {!canPipeline ? (
          <p className="text-sm text-muted-foreground">Your role does not include the hiring pipeline.</p>
        ) : counts && counts.total > 0 ? (
          <StatGrid columns={4}>
            <StatCard label="Total" value={counts.total} href={`/employer/jobs/${job.id}/pipeline`} />
            {PIPELINE_COLUMNS.filter((c) => ["screening", "shortlisted", "client_interview", "offer", "joined"].includes(c.key)).map((c) => (
              <StatCard key={c.key} label={c.label} value={counts.counts[c.key]} />
            ))}
          </StatGrid>
        ) : (
          <EmptyState
            size="sm"
            variant="plain"
            title="No applications yet"
            description={job.status === "published" ? "Applications appear here as candidates apply and Venkat Sai shares screened profiles." : "Applications open once the job is published."}
          />
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Details">
            <KeyValueList
              columns={2}
              items={[
                { label: "Openings", value: job.openings },
                { label: "Salary", value: <SalaryRangeText minMinor={job.salaryMinMinor} maxMinor={job.salaryMaxMinor} currency={job.salaryCurrency} period={job.salaryPeriod ?? undefined} />, hint: job.salaryVisible ? "Shown to candidates" : "Hidden from candidates" },
                { label: "Category", value: detail.category?.name ?? null },
                { label: "Industry", value: detail.industry?.name ?? null },
                { label: "Experience level", value: job.experienceLevel ? EXPERIENCE_LEVEL_LABELS[job.experienceLevel] : null },
                { label: "Experience", value: job.experienceMinYears !== null || job.experienceMaxYears !== null ? `${job.experienceMinYears ?? 0}–${job.experienceMaxYears ?? "any"} years` : null },
                { label: "Visa", value: VISA_SPONSORSHIP_LABELS[job.visaSponsorship] },
                { label: "Contract", value: job.contractDurationMonths ? `${job.contractDurationMonths} months` : null },
                { label: "Accommodation", value: yesNo(job.accommodationProvided) },
                { label: "Food", value: yesNo(job.foodProvided) },
                { label: "Transport", value: yesNo(job.transportProvided) },
                { label: "Working hours", value: job.workingHours },
                { label: "Application deadline", value: job.applicationDeadline ? <DateText value={job.applicationDeadline} timeZone={timeZone} /> : null },
                { label: "Listing ends", value: job.expiresAt ? <DateText value={job.expiresAt} timeZone={timeZone} /> : null },
                { label: "Start date", value: job.startDate ? <DateText value={job.startDate} dateOnly /> : null },
                { label: "Applications", value: job.applyMode === "external_url" ? "On your website" : "On Venkat Sai Global" },
                { label: "Benefits", value: job.benefits.length ? job.benefits.join(", ") : null, fullWidth: true },
                { label: "Your reference", value: job.employerReference },
                { label: "Confidential name", value: job.isConfidential ? job.confidentialEmployerName : null },
              ]}
            />
            {job.isOverseas ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {job.recruitingAgentName && job.recruitingAgentCertificateNumber
                  ? `Recruiting agent shown to candidates: ${job.recruitingAgentName}, eMigrate registration ${job.recruitingAgentCertificateNumber}.`
                  : "Overseas job: Venkat Sai records the recruiting agent's registration where it applies before publication."}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Description">
            {job.summary ? <p className="mb-4 text-base text-foreground">{job.summary}</p> : null}
            {job.descriptionHtml ? <SafeHtml html={job.descriptionHtml} /> : <p className="text-sm text-muted-foreground">No description yet.</p>}
            {job.responsibilities ? (
              <div className="mt-6 space-y-1">
                <h3 className="font-heading text-sm font-semibold text-navy">Responsibilities</h3>
                <p className="whitespace-pre-line text-sm text-foreground">{job.responsibilities}</p>
              </div>
            ) : null}
            {job.qualificationsText ? (
              <div className="mt-6 space-y-1">
                <h3 className="font-heading text-sm font-semibold text-navy">Qualifications</h3>
                <p className="whitespace-pre-line text-sm text-foreground">{job.qualificationsText}</p>
              </div>
            ) : null}
            {job.recruitmentProcess ? (
              <div className="mt-6 space-y-1">
                <h3 className="font-heading text-sm font-semibold text-navy">Recruitment process</h3>
                <p className="whitespace-pre-line text-sm text-foreground">{job.recruitmentProcess}</p>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Skills and locations">
            {detail.skills.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Skills">
                {detail.skills.map((s) => (
                  <li key={s.id}>
                    <StatusBadge tone={s.isRequired ? "brand" : "neutral"} size="sm">
                      {s.name}
                      {s.minYears ? ` · ${s.minYears}+ yrs` : ""}
                      {s.isRequired ? "" : " (nice to have)"}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No skills added.</p>
            )}
            {detail.locations.length ? (
              <ul className="mt-4 space-y-1 text-sm">
                {detail.locations.map((l) => (
                  <li key={l.id}>
                    {[l.city, l.stateRegion, l.countryName ?? l.countryCode].filter(Boolean).join(", ")}
                    {l.openings ? ` · ${l.openings} openings` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          <SectionCard title="Screening questions" description={job.screeningRequired ? "Asked when candidates apply" : "Not asked"}>
            {detail.screeningQuestions.length ? (
              <ol className="list-decimal space-y-3 pl-5 text-sm">
                {detail.screeningQuestions.map((q) => (
                  <li key={q.id}>
                    <p className="font-medium text-foreground">{q.question}</p>
                    <p className="text-muted-foreground">
                      {SCREENING_TYPE_LABELS[q.type]}
                      {q.options.length ? `: ${q.options.map((o) => o.label).join(", ")}` : ""}
                      {q.isRequired ? " · required" : " · optional"}
                      {q.knockout ? " · flags answers for review" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No screening questions.</p>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Status timeline">
            <Timeline items={timeline} timeZone={timeZone} label="Job status history" emptyTitle="No history yet" />
          </SectionCard>
          <SectionCard title="Visibility">
            <KeyValueList
              items={[
                { label: "Views", value: job.viewCount },
                { label: "First published", value: job.publishedAt ? <DateText value={job.publishedAt} timeZone={timeZone} /> : null },
                { label: "Featured", value: job.isFeatured && job.featuredUntil ? <>Until <DateText value={job.featuredUntil} timeZone={timeZone} /></> : null },
              ]}
              emptyText="Not yet"
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
