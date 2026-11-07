import type { Metadata } from "next";

import { JobForm } from "@/components/employer/job-form/job-form";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrgMember } from "@/modules/identity/authz";

import { loadJobFormOptions, loadSubmitGate } from "../_lib/form-data";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewEmployerJobPage() {
  const ctx = await requireOrgMember("employer", "employer.jobs.manage");
  const [{ options, homeCountryCode }, gate] = await Promise.all([loadJobFormOptions(), loadSubmitGate(ctx, null)]);
  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Jobs", href: "/employer/jobs" }, { label: "Post a job" }]} />
      <PageHeader
        title="Post a job"
        description="Save a draft at any time. Venkat Sai reviews every job before it is published."
        backLink={{ href: "/employer/jobs", label: "Back to jobs" }}
      />
      <JobForm defaults={{ salaryVisible: true, openings: "1" }} options={options} gate={gate} homeCountryCode={homeCountryCode} />
    </div>
  );
}
