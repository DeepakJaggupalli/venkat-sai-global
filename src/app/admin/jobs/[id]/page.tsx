import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { DownloadExcelButton } from "@/components/admin/download-excel-button";
import { ActionForm } from "@/components/admin/action-form";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { listStaffOptions } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { SalaryRangeText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SafeHtml } from "@/components/shared/safe-html";
import { SectionCard } from "@/components/shared/section-card";
import { StatGrid, StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { humanize } from "@/lib/format";
import { sanitizeRichText } from "@/lib/sanitize";
import { getOpenApprovalForEntity } from "@/modules/approvals/service";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { pauseJobAction, publishJobAction, resumeJobAction, setJobInfoSourceAction, setJobRecruitingAgentAction, unfeatureJobAction } from "@/modules/jobs/actions";
import { INFO_SOURCE_OPTIONS } from "@/modules/jobs/constants";
import { getJobForStaff } from "@/modules/jobs/queries";

import { assignJobRecruiterAction, bulkJobDetailAction } from "../actions";
import { jobApplicationSummary, jobRecruiterTasks, verifiedAgentLicenceOptions } from "../_lib/queries";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Job" };
  const ctx = await requireStaff("jobs.view");
  const detail = await getJobForStaff(ctx, id).catch(() => null);
  return { title: detail ? `${detail.job.code} · ${detail.job.title}` : "Job" };
}

export default async function AdminJobDetailPage({ params }: { params: Params }) {
  const ctx = await requireStaff("jobs.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getJobForStaff(ctx, id).catch(() => null);
  if (!detail) notFound();
  const { job } = detail;
  const canManage = staffCan(ctx, "jobs.manage");
  const canApprove = staffCan(ctx, "jobs.approve");
  const canFeature = staffCan(ctx, "jobs.feature");
  const canAssign = staffCan(ctx, "recruitment.manage");

  const [summary, openApproval, recruiterTasks, recruiters, licences] = await Promise.all([
    jobApplicationSummary(job.id),
    getOpenApprovalForEntity("job_publication", job.id),
    jobRecruiterTasks(job.id),
    canAssign ? listStaffOptions({ permission: "recruitment.manage" }) : Promise.resolve([]),
    canApprove && job.isOverseas ? verifiedAgentLicenceOptions() : Promise.resolve([]),
  ]);
  const employerName = detail.organization?.name ?? (job.isConfidential ? job.confidentialEmployerName : null) ?? "Venkat Sai-managed";
  const live = job.status === "published";
  const publishable = ["draft", "changes_requested", "rejected"].includes(job.status);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Jobs", href: "/admin/jobs" }, { label: job.code }]} />
      <PageHeader
        eyebrow={`${job.code}${job.managedByVenkatSai ? " · Venkat Sai-managed" : ""}${job.isConfidential ? " · Confidential client" : ""}`}
        title={job.title}
        description={employerName}
        status={
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={detail.displayStatus} domain="job" />
            {job.isFeatured ? <StatusBadge tone="gold">Featured</StatusBadge> : null}
            <VerificationBadge state={job.infoSource} />
          </span>
        }
        backLink={{ href: "/admin/jobs", label: "Back to jobs" }}
        actions={[
          ...(live ? [{ label: "View public page", href: `/jobs/${job.slug}`, icon: <ExternalLink />, variant: "outline" as const, external: true }] : []),
          ...(staffCan(ctx, "recruitment.view") ? [{ label: "Pipeline", href: `/admin/pipeline?job=${job.id}`, variant: "outline" as const }] : []),
          ...(staffCan(ctx, ["recruitment.view", "recruitment.manage"], "any") ? [<DownloadExcelButton key="excel" href="/admin/pipeline/export" searchParams={{ job: job.id }} label="Download applicants (Excel)" />] : []),
        ]}
      />

      {openApproval ? (
        <Callout tone="info" title="Waiting for approval" action={{ label: "Review in the approval centre", href: `/admin/approvals/${openApproval.id}` }}>
          {openApproval.code} was submitted <DateText value={openApproval.createdAt} />.
        </Callout>
      ) : null}
      {job.moderationNote && ["changes_requested", "rejected"].includes(job.status) ? (
        <Callout tone="warning" title="Message to the employer">
          {job.moderationNote}
        </Callout>
      ) : null}
      {job.isOverseas && !job.recruitingAgentCertificateNumber ? (
        <Callout tone="warning" title="Recruiting-agent licence not recorded">
          Overseas jobs advertised by or for a recruiting agent must show the agent&rsquo;s name and eMigrate registration number. Record it below before publishing.
        </Callout>
      ) : null}

      <StatGrid columns={4}>
        <StatCard label="Applications" value={summary.total} href={staffCan(ctx, "recruitment.view") ? `/admin/pipeline?job=${job.id}` : undefined} />
        <StatCard label="Active" value={summary.byStatus.active ?? 0} />
        <StatCard label="Shortlisted" value={summary.shortlisted} />
        <StatCard label="Interviews" value={summary.interviews} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Job details">
            <KeyValueList
              columns={2}
              items={[
                {
                  label: "Employer",
                  value: detail.organization ? (
                    <Link className="text-teal-strong underline underline-offset-4" href={`/admin/organizations/${detail.organization.id}`}>
                      {detail.organization.name}
                    </Link>
                  ) : (
                    employerName
                  ),
                },
                { label: "Shown to candidates as", value: job.isConfidential ? job.confidentialEmployerName : (detail.organization?.name ?? null) },
                { label: "Location", value: [job.city, job.stateRegion, job.countryCode].filter(Boolean).join(", ") || humanize(job.workMode) },
                { label: "Type", value: `${humanize(job.employmentType)} · ${humanize(job.workMode)}` },
                { label: "Openings", value: job.openings },
                { label: "Experience", value: job.experienceMinYears != null || job.experienceMaxYears != null ? `${job.experienceMinYears ?? 0}–${job.experienceMaxYears ?? "+"} years` : null },
                {
                  label: "Salary",
                  value: job.salaryCurrency ? (
                    <>
                      <SalaryRangeText minMinor={job.salaryMinMinor} maxMinor={job.salaryMaxMinor} currency={job.salaryCurrency} period={job.salaryPeriod ?? undefined} />
                      {!job.salaryVisible ? " (hidden from candidates)" : ""}
                    </>
                  ) : null,
                },
                { label: "Category", value: detail.category?.name ?? null },
                { label: "Published", value: job.publishedAt ? <DateText value={job.publishedAt} /> : null },
                { label: "Application deadline", value: job.applicationDeadline ? <DateText value={job.applicationDeadline} /> : null },
                { label: "Listing ends", value: job.expiresAt ? <DateText value={job.expiresAt} /> : null },
                { label: "Views", value: job.viewCount },
                {
                  label: "Requirement",
                  value: job.requirementId ? (
                    <Link className="text-teal-strong underline underline-offset-4" href={`/admin/requirements/${job.requirementId}`}>
                      Open requirement
                    </Link>
                  ) : null,
                },
                {
                  label: "Recruiting agent",
                  value: job.recruitingAgentCertificateNumber ? `${job.recruitingAgentName} · ${job.recruitingAgentCertificateNumber}${job.recruitingAgentCertificateValidUntil ? ` (valid until ${job.recruitingAgentCertificateValidUntil})` : ""}` : null,
                },
                { label: "Skills", value: detail.skills.map((s) => s.name).join(", ") || null, fullWidth: true },
              ]}
            />
            {job.descriptionHtml ? (
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="mb-2 font-heading text-sm font-semibold">Description</h3>
                <SafeHtml html={sanitizeRichText(job.descriptionHtml)} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Recruiters" description="Recruiters assigned to source for this job (tracked as tasks with reminders).">
            <div className="space-y-4">
              {recruiterTasks.length ? (
                <ul className="space-y-2 text-sm">
                  {recruiterTasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{t.assigneeName ?? "Unassigned"}</span>
                      <span className="text-xs text-muted-foreground">
                        {humanize(t.status)}
                        {t.dueAt ? (
                          <>
                            {" "}
                            · due <DateText value={t.dueAt} />
                          </>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No recruiter assigned.</p>
              )}
              {canAssign ? (
                <ActionForm
                  action={assignJobRecruiterAction}
                  hidden={{ jobId: job.id, jobTitle: job.title }}
                  columns={2}
                  fields={[
                    { name: "assignedToUserId", label: "Recruiter", kind: "search-select", options: recruiters, required: true },
                    { name: "dueAt", label: "Target date", kind: "datetime-local", optional: true },
                    { name: "note", label: "Brief", kind: "textarea", optional: true, rows: 2 },
                  ]}
                  submitLabel="Assign recruiter"
                  submitVariant="outline"
                  resetOnSuccess
                />
              ) : null}
            </div>
          </SectionCard>

          <InternalNotesPanel ctx={ctx} entityType="job" entityId={job.id} organizationId={job.organizationId} />
        </div>

        <aside className="space-y-6" aria-label="Job actions">
          {canManage ? (
            <SectionCard title="Status">
              <div className="flex flex-wrap gap-2">
                {publishable && canApprove ? (
                  <ActionButton
                    action={publishJobAction.bind(null, { id: job.id, infoVerified: false })}
                    variant="default"
                    confirm={{ title: "Publish this job?", description: "It goes live for candidates now. Employers' jobs need a verified organisation.", confirmLabel: "Publish" }}
                  >
                    Publish
                  </ActionButton>
                ) : null}
                {live ? (
                  <ActionButton action={pauseJobAction.bind(null, { id: job.id, portal: "admin" })} confirm={{ title: "Unpublish this job?", description: "It is hidden from candidates until you resume it.", confirmLabel: "Unpublish" }}>
                    Unpublish
                  </ActionButton>
                ) : null}
                {job.status === "paused" ? <ActionButton action={resumeJobAction.bind(null, { id: job.id, portal: "admin" })}>Resume</ActionButton> : null}
              </div>
              {["published", "paused", "closed"].includes(job.status) ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ActionForm
                    action={bulkJobDetailAction}
                    hidden={{ ids: job.id }}
                    fields={[
                      {
                        name: "operation",
                        label: "Action",
                        kind: "select",
                        required: true,
                        options: [
                          ...(job.status !== "closed" ? [{ value: "close", label: "Close" }] : []),
                          { value: "extend", label: "Extend deadline and listing" },
                          ...(canFeature && job.status === "published" ? [{ value: "feature", label: "Feature until" }] : []),
                        ],
                      },
                      {
                        name: "closeReason",
                        label: "Closing reason",
                        kind: "select",
                        optional: true,
                        options: [
                          { value: "filled", label: "Filled" },
                          { value: "cancelled", label: "Cancelled" },
                          { value: "duplicate", label: "Duplicate" },
                          { value: "other", label: "Other" },
                        ],
                      },
                      { name: "date", label: "Date (extend or feature until)", kind: "date", optional: true },
                    ]}
                    submitLabel="Apply"
                    submitVariant="outline"
                  />
                </div>
              ) : null}
              {canFeature && detail.activePromotions.length ? (
                <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  {detail.activePromotions.map((p) => (
                    <p key={p.id}>
                      {humanize(p.type)} {p.endsAt ? <>until <DateText value={p.endsAt} /></> : null}
                    </p>
                  ))}
                  <ActionButton action={unfeatureJobAction.bind(null, { id: job.id })}>Remove promotions</ActionButton>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {canApprove ? (
            <SectionCard title="Information source" description="The badge candidates see. Choose Verified only after checking the details with the employer.">
              <div className="flex flex-wrap gap-2">
                {INFO_SOURCE_OPTIONS.filter((s) => s !== job.infoSource).map((s) => (
                  <ActionButton key={s} action={setJobInfoSourceAction.bind(null, { id: job.id, infoSource: s })}>
                    Mark {humanize(s).toLowerCase()}
                  </ActionButton>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {canApprove && job.isOverseas ? (
            <SectionCard title="Recruiting-agent licence" description="Shown on the public job page. Only verified, unexpired certificates appear.">
              <ActionForm
                action={setJobRecruitingAgentAction}
                hidden={{ id: job.id }}
                fields={[
                  {
                    name: "mode",
                    label: "Source",
                    kind: "select",
                    required: true,
                    options: [
                      { value: "licence", label: "A partner's verified licence" },
                      { value: "manual", label: "A certificate I checked" },
                      { value: "clear", label: "Remove" },
                    ],
                  },
                  { name: "licenceId", label: "Partner licence", kind: "search-select", options: licences, optional: true, allowClear: true },
                  { name: "name", label: "Agent name (manual)", optional: true },
                  { name: "certificateNumber", label: "Certificate number (manual)", optional: true },
                  { name: "validUntil", label: "Valid until (manual)", kind: "date", optional: true },
                ]}
                submitLabel="Save licence"
                submitVariant="outline"
              />
            </SectionCard>
          ) : null}

          {detail.latestReview ? (
            <SectionCard title="Latest review">
              <p className="text-sm">
                {detail.latestReview.code} · {humanize(detail.latestReview.status)}
                {detail.latestReview.decidedAt ? (
                  <>
                    {" "}
                    on <DateText value={detail.latestReview.decidedAt} />
                  </>
                ) : null}
              </p>
              {detail.latestReview.reason ? <p className="mt-1 text-sm text-muted-foreground">{detail.latestReview.reason}</p> : null}
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
