import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JobForm } from "@/components/employer/job-form/job-form";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { canTransition } from "@/modules/jobs/lifecycle";
import { getJobForEmployer } from "@/modules/jobs/queries";

import { jobFormDefaults, loadJobFormOptions, loadSubmitGate } from "../../_lib/form-data";

export const metadata: Metadata = { title: "Edit job" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEmployerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("employer", "employer.jobs.manage");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getJobForEmployer(ctx, id);
  if (!detail) notFound();
  const job = detail.job;
  const editable = canTransition("edit", job.status);
  const [{ options, homeCountryCode }, gate] = await Promise.all([loadJobFormOptions(), loadSubmitGate(ctx, job.status)]);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Jobs", href: "/employer/jobs" }, { label: job.title, href: `/employer/jobs/${job.id}` }, { label: "Edit" }]} />
      <PageHeader
        title={`Edit ${job.title}`}
        eyebrow={job.code}
        status={<StatusBadge status={detail.displayStatus} domain="job" />}
        backLink={{ href: `/employer/jobs/${job.id}`, label: "Back to job" }}
      />
      {(job.status === "changes_requested" || job.status === "rejected") && (detail.latestReview?.reason || job.moderationNote) ? (
        <Callout tone="warning" title={job.status === "rejected" ? "Venkat Sai did not approve this job" : "Venkat Sai asked for changes"}>
          <span className="font-medium">Reviewer feedback:</span> {detail.latestReview?.reason ?? job.moderationNote}
        </Callout>
      ) : null}
      {editable ? (
        <JobForm jobId={job.id} isLive={job.status === "published" || job.status === "paused"} defaults={jobFormDefaults(detail)} options={options} gate={gate} homeCountryCode={homeCountryCode} />
      ) : (
        <Callout tone="info" title="This job can no longer be edited" action={{ label: "Duplicate it from the job page", href: `/employer/jobs/${job.id}` }}>
          Archived jobs are kept for your records. Create a copy to post it again.
        </Callout>
      )}
    </div>
  );
}
