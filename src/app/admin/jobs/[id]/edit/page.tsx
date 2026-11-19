import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff } from "@/modules/identity/authz";
import { saveStaffJobAction } from "@/modules/jobs/actions";
import { canTransition } from "@/modules/jobs/lifecycle";
import { getJobForStaff } from "@/modules/jobs/queries";

import { jobFormDefaults, loadJobFormOptions } from "@/app/employer/(workspace)/jobs/_lib/form-data";

import { staffJobFields } from "../../_lib/job-form-fields";
import { StaffJobListEditors } from "../../_lib/job-list-editors";

export const metadata: Metadata = { title: "Edit job" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff job editing. Loads the whole job (fields, skills, locations, screening questions) and re-posts the
 * complete form to saveStaffJobAction, so the module's full-schema update keeps every child list.
 * Rule from the jobs module: staff edits keep the job's status (a live job stays live and the change shows
 * at once; employer edits to a live job are the ones that go back to review). The employer cannot be changed
 * after creation.
 */
export default async function EditAdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("jobs.manage");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getJobForStaff(ctx, id).catch(() => null);
  if (!detail) notFound();
  const { job } = detail;
  const editable = canTransition("edit", job.status);
  const { options } = await loadJobFormOptions();
  const defaults = jobFormDefaults(detail);
  const employerName = detail.organization?.name ?? (job.isConfidential ? job.confidentialEmployerName : null) ?? "Venkat Sai-managed";
  const live = job.status === "published" || job.status === "paused";

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Jobs", href: "/admin/jobs" }, { label: job.code, href: `/admin/jobs/${job.id}` }, { label: "Edit" }]} />
      <PageHeader
        eyebrow={job.code}
        title={`Edit ${job.title}`}
        description={employerName}
        status={<StatusBadge status={detail.displayStatus} domain="job" />}
        backLink={{ href: `/admin/jobs/${job.id}`, label: "Back to the job" }}
      />
      {!editable ? (
        <Callout tone="info" title="This job can no longer be edited" action={{ label: "Back to the job", href: `/admin/jobs/${job.id}` }}>
          Archived jobs are kept for the records. Duplicate it from the job page to post it again.
        </Callout>
      ) : (
        <>
          <Callout tone={live ? "warning" : "neutral"} title={live ? "This job is live" : "Staff edits keep the job's status"}>
            {live
              ? "Changes made by Venkat Sai staff go live immediately and do not send the job back for review. Edits an employer makes to a live job are the ones that need re-approval."
              : job.status === "pending_approval"
                ? "The job stays in the approval queue; the open approval request receives the new version."
                : "The job keeps its current status. Publish, pause or close it from the job page."}
            {" "}The employer cannot be changed after creation; duplicate the job to post it for another employer.
          </Callout>
          <SectionCard title="Job details">
            <ActionForm
              action={saveStaffJobAction}
              hidden={{ id: job.id }}
              columns={2}
              fields={staffJobFields({ ...defaults, managedByVenkatSai: job.managedByVenkatSai }, { ...options, employers: [] }, "edit", { published: Boolean(job.publishedAt) })}
              submitLabel="Save changes"
              pendingLabel="Saving…"
              successHref={`/admin/jobs/${job.id}`}
              testId="admin-job-edit-form"
            >
              <StaffJobListEditors
                skills={defaults.skills ?? []}
                locations={defaults.locations ?? []}
                screeningQuestions={defaults.screeningQuestions ?? []}
                screeningRequired={Boolean(defaults.screeningRequired)}
                countries={options.countries}
              />
            </ActionForm>
          </SectionCard>
        </>
      )}
    </div>
  );
}
