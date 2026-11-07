import type { Metadata } from "next";
import Link from "next/link";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { formatExperience, labelOf, SUBMISSION_STATUS } from "@/components/recruiter/labels";
import { PartnerNoteForm, WithdrawSubmissionButton } from "@/components/recruiter/submission-actions";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineItem } from "@/components/shared/timeline";
import { requireOrgMember } from "@/modules/identity/authz";
import { REJECTION_REASON_LABELS } from "@/modules/recruitment/constants";
import { getSubmissionForPartner } from "@/modules/recruitment/queries";
import { countryOptions } from "@/modules/taxonomy/queries";

import { loadOr404, sp, viewerTimeZone } from "../../_lib/page-utils";

export const metadata: Metadata = { title: "Submission" };

const VERIFICATION_LABELS: Record<string, string> = {
  none: "Not yet verified by Venkat Sai",
  basic: "Basic checks done",
  documents_verified: "Documents verified",
  skills_assessed: "Skills assessed by Venkat Sai",
};

const PLACEMENT_LABELS: Record<string, string> = {
  pending_joining: "Selected, awaiting joining",
  mobilising: "Preparing to travel",
  joined: "Joined",
  replacement_required: "Replacement required",
  cancelled: "Cancelled",
  completed: "Completed",
};

type Params = { id: string };

export default async function RecruiterSubmissionDetailPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.submissions.view");
  const { id } = await params;
  const query = await searchParams;
  const [s, countries] = await Promise.all([loadOr404(getSubmissionForPartner(ctx, id)), countryOptions()]);
  const timeZone = viewerTimeZone(ctx);
  const status = labelOf(SUBMISSION_STATUS, s.status);
  const canAct = ctx.permissions.has("partner.candidates.submit");
  const withdrawable = canAct && ["submitted", "under_review", "duplicate"].includes(s.status);
  const p = s.candidateProfile;
  const location = [p.city, p.countryCode ? (countries.find((c) => c.value === p.countryCode)?.label ?? p.countryCode) : null].filter(Boolean).join(", ");
  const justSubmitted = sp(query, "submitted") === "1";

  const timeline: TimelineItem[] = [{ id: "submitted", title: "Submitted to Venkat Sai", at: s.createdAt, tone: "info" }];
  if (s.reviewedAt) timeline.push({ id: "reviewed", title: s.status === "accepted" ? "Accepted by Venkat Sai" : s.status === "rejected" ? "Not accepted" : "Reviewed", at: s.reviewedAt, actor: { name: "Venkat Sai", role: "Recruitment team" }, tone: s.status === "accepted" ? "success" : s.status === "rejected" ? "danger" : "info" });
  for (const n of s.notes) {
    timeline.push({ id: n.id, title: n.authorParty === "venkat_sai" ? "Note from Venkat Sai" : "Note from your agency", at: n.createdAt, actor: n.authorName ? { name: n.authorName } : null, note: <span className="whitespace-pre-line">{n.body}</span> });
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Submissions", href: "/recruiter/submissions" }, { label: s.candidate.displayName }]} />
      <PageHeader
        eyebrow={s.code}
        title={s.candidate.displayName}
        description={s.jobTitle ? `Submitted for ${s.jobTitle}` : "Job to be decided by Venkat Sai"}
        backLink={{ href: "/recruiter/submissions", label: "Back to submissions" }}
        status={
          <StatusBadge tone={status.tone} size="md">
            {status.label}
          </StatusBadge>
        }
        actions={withdrawable ? [<WithdrawSubmissionButton key="withdraw" submissionId={s.id} candidateName={s.candidate.displayName} />] : undefined}
      />

      {justSubmitted && s.status === "duplicate" ? (
        <Callout tone="warning" title="Held as a possible duplicate" live="polite">
          This person appears to be represented by another partner within the attribution window. Venkat Sai will review it and let you know. You do not need to do
          anything now.
        </Callout>
      ) : justSubmitted ? (
        <Callout tone="success" title="Candidate submitted" live="polite">
          Venkat Sai will review the submission and you will be notified of the decision. The candidate has been told that your agency submitted them.
        </Callout>
      ) : s.status === "duplicate" ? (
        <Callout tone="warning" title="Held as a possible duplicate">
          Another partner may already represent this person. Venkat Sai reviews duplicates and decides who is credited.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Venkat Sai's feedback">
            {s.partnerFeedback || s.rejectionReasonCode ? (
              <div className="space-y-2 text-sm">
                {s.rejectionReasonCode ? (
                  <p>
                    <span className="font-medium">Reason:</span> {REJECTION_REASON_LABELS[s.rejectionReasonCode]}
                  </p>
                ) : null}
                {s.partnerFeedback ? <p className="whitespace-pre-line">{s.partnerFeedback}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{s.reviewedAt ? "No feedback was added." : "Not reviewed yet. Feedback appears here once Venkat Sai has reviewed the submission."}</p>
            )}
          </SectionCard>

          <SectionCard title="Hiring progress">
            <KeyValueList
              columns={2}
              items={[
                { label: "Application", value: s.application ? s.application.code : null, hint: s.application ? undefined : "Created when Venkat Sai accepts the submission." },
                { label: "Current stage", value: s.application?.stageName || null },
                { label: "Placement", value: s.placement ? `${s.placement.code} · ${PLACEMENT_LABELS[s.placement.status] ?? s.placement.status}` : null },
                { label: "Joined on", value: s.placement?.joinedOn ? <DateText value={s.placement.joinedOn} dateOnly /> : null },
              ]}
              emptyText="Not yet"
            />
            {s.application ? (
              <p className="mt-4 text-sm">
                <Link href="/recruiter/interviews" className="font-medium text-navy underline underline-offset-4 hover:no-underline">
                  See interviews for your candidates
                </Link>
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Notes and activity">
            <Timeline items={timeline} timeZone={timeZone} label="Submission activity" emptyTitle="No activity yet" />
            {s.application && canAct ? (
              <div className="mt-6 border-t border-border pt-6">
                <PartnerNoteForm applicationId={s.application.id} />
              </div>
            ) : null}
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Candidate summary">
          <SectionCard title="Candidate">
            <KeyValueList
              items={[
                { label: "Headline", value: p.headline },
                { label: "Current job", value: p.currentJobTitle },
                { label: "Experience", value: formatExperience(p.totalExperienceMonths) },
                { label: "Location", value: location || null },
                { label: "Verification", value: VERIFICATION_LABELS[p.verificationLevel] ?? p.verificationLevel },
              ]}
            />
          </SectionCard>
          {s.partnerNotes ? (
            <SectionCard title="Your submission notes">
              <p className="text-sm whitespace-pre-line">{s.partnerNotes}</p>
            </SectionCard>
          ) : null}
          <SectionCard title="Requirement">
            <Link href={`/recruiter/requirements/${s.assignmentId}`} className="text-sm font-medium text-navy underline underline-offset-4 hover:no-underline">
              Open the requirement
            </Link>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
