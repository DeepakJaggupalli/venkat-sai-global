import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { SubmitCandidateForm } from "@/components/recruiter/submit-candidate-form";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireOrgMember } from "@/modules/identity/authz";
import { PARTNER_CONSENT_ATTESTATION } from "@/modules/recruitment/partner-submissions";
import { getAssignmentForPartner } from "@/modules/recruitment/queries";
import { getSetting } from "@/modules/settings";
import { countryOptions } from "@/modules/taxonomy/queries";

import { loadOr404, sp } from "../../../_lib/page-utils";
import { listSubmittableCandidates } from "../../../_lib/queries";

export const metadata: Metadata = { title: "Submit a candidate" };

type Params = { assignmentId: string };

export default async function SubmitCandidatePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", ["partner.requirements.view", "partner.candidates.submit"]);
  const { assignmentId } = await params;
  const query = await searchParams;
  const assignment = await loadOr404(getAssignmentForPartner(ctx, assignmentId));
  const verified = ctx.organization.status === "verified";
  const limitReached = assignment.submissionLimit !== null && assignment.submissionsUsed >= assignment.submissionLimit;
  const blocked = assignment.status !== "active" ? "This requirement is not open for submissions." : limitReached ? "You have reached the submission limit for this requirement." : !verified ? "Your agency must be verified before you can submit candidates." : null;
  const backHref = `/recruiter/requirements/${assignment.id}`;

  const [candidates, countries, attributionDays] = blocked ? [[], [], 90] : await Promise.all([listSubmittableCandidates(ctx, assignment.id), countryOptions(), getSetting("recruitment.partner_attribution_days")]);
  const preselected = sp(query, "candidate");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PortalBreadcrumb items={[{ label: "Assigned requirements", href: "/recruiter/requirements" }, { label: assignment.title || "Requirement", href: backHref }, { label: "Submit a candidate" }]} />
      <PageHeader
        eyebrow={assignment.requirement?.code ?? assignment.job?.code}
        title="Submit a candidate"
        description={`For ${assignment.title || "this requirement"}. Venkat Sai reviews every submission before it reaches the employer.`}
        backLink={{ href: backHref, label: "Back to the requirement" }}
      />
      {blocked ? (
        <Callout tone="warning" title="You cannot submit to this requirement" action={{ label: "Back to the requirement", href: backHref }}>
          {blocked}
        </Callout>
      ) : (
        <SectionCard title="Candidate and consent" description="Fields marked with an asterisk are required.">
          <SubmitCandidateForm
            assignmentId={assignment.id}
            organizationId={ctx.organization.id}
            candidates={candidates.map((c) => ({ value: c.id, label: c.displayName, description: c.headline ?? undefined }))}
            targetJobs={assignment.targetJobs.map((j) => ({ value: j.id, label: `${j.title} (${j.code})` }))}
            countries={countries}
            attestation={PARTNER_CONSENT_ATTESTATION}
            attributionDays={Number(attributionDays) || 90}
            defaultMode={preselected && candidates.some((c) => c.id === preselected) ? "existing" : "new"}
            defaultCandidateId={preselected && candidates.some((c) => c.id === preselected) ? preselected : undefined}
          />
        </SectionCard>
      )}
    </div>
  );
}
