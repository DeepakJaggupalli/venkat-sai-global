import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { startSubmissionReviewAction } from "@/modules/recruitment/actions";
import { REJECTION_REASON_LABELS, REJECTION_REASON_OPTIONS, SUBMISSION_STATUS_LABELS } from "@/modules/recruitment/constants";

import { openJobOptions } from "../../../pipeline/_shared/options";
import { isUuid, orNotFound, staffTimeZone } from "../../../pipeline/_shared/server";
import { ReasonDialog } from "../../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../../pipeline/_shared/status";
import { acceptSubmissionFormAction, rejectSubmissionFormAction, reopenSubmissionFormAction, resolveDuplicateFlagFormAction, updateAttributionFormAction } from "../../actions";
import { attributionsForCandidate, duplicateFlagsForSubmission, loadSubmissionForStaff } from "../../_lib/queries";

export const metadata: Metadata = { title: "Submission · Partners" };

const FLAG_CHOICES = [
  { value: "not_duplicate", label: "Not a duplicate" },
  { value: "confirmed_duplicate", label: "Confirmed duplicate" },
  { value: "merged", label: "Merged (records combined)" },
];

export default async function PartnerSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["recruitment.view", "recruitment.manage", "partners.view"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const s = await orNotFound(loadSubmissionForStaff(staff, id));
  const tz = staffTimeZone(staff);
  const canReview = staffCan(staff, "recruitment.manage");
  const canResolveFlags = staffCan(staff, "candidates.manage");
  const canAttribution = staffCan(staff, "partners.manage");
  const [flags, attributions, jobs] = await Promise.all([
    duplicateFlagsForSubmission(s.id),
    attributionsForCandidate(s.candidate.id),
    canReview && !s.jobId && (s.status === "submitted" || s.status === "under_review") ? openJobOptions({ requirementId: s.assignment.requirementId ?? undefined }) : Promise.resolve([]),
  ]);
  const reviewable = s.status === "submitted" || s.status === "under_review";
  const otherAttribution = s.activeAttribution && s.activeAttribution.partnerOrganizationId !== s.partner.id ? s.activeAttribution : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.candidate.displayName}
        eyebrow={<span className="font-mono">{s.code}</span>}
        status={<StatusBadge tone={statusTone(s.status)}>{SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge>}
        description={`Submitted by ${s.partner.name}${s.jobTitle ? ` for ${s.jobTitle}` : ""}`}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners", href: "/admin/partners" }, { label: "Submissions", href: "/admin/partners/submissions" }, { label: s.code }]}
        actions={
          canReview ? (
            <div className="flex flex-wrap gap-2">
              {s.status === "submitted" ? (
                <ActionButton icon={<Eye aria-hidden="true" />} action={startSubmissionReviewAction.bind(null, { submissionId: s.id })}>
                  Start review
                </ActionButton>
              ) : null}
              {reviewable ? (
                <ReasonDialog
                  action={rejectSubmissionFormAction}
                  hidden={{ submissionId: s.id }}
                  triggerLabel="Reject"
                  title="Reject this submission?"
                  description="The partner sees the reason and your feedback. The candidate is not told about internal review notes."
                  confirmLabel="Reject submission"
                  reasonName="partnerFeedback"
                  reasonLabel="Feedback for the partner"
                  reasonRequired={false}
                  choice={{ name: "rejectionReasonCode", label: "Reason", options: REJECTION_REASON_OPTIONS.map((v) => ({ value: v, label: REJECTION_REASON_LABELS[v] })), required: true }}
                  destructive
                  variant="ghost"
                />
              ) : null}
              {s.status === "duplicate" && staffCan(staff, ["recruitment.manage", "partners.manage"]) ? (
                <ReasonDialog action={reopenSubmissionFormAction} hidden={{ submissionId: s.id }} triggerLabel="Reopen for review" title="Move this submission back to review?" description="Only after confirming it is not a duplicate of a candidate attributed to another partner." confirmLabel="Reopen" reasonLabel="Review note" reasonRequired={false} />
              ) : null}
            </div>
          ) : undefined
        }
      />

      {otherAttribution ? (
        <Callout tone="danger" title={`Attributed to ${otherAttribution.partnerName ?? "another partner"}`}>
          This candidate is inside another partner&apos;s attribution window{otherAttribution.expiresAt ? <> until <DateText value={otherAttribution.expiresAt} timeZone={tz} /></> : null}. The first valid submission wins; resolve any dispute below before accepting.
        </Callout>
      ) : null}
      {!s.candidateAllowsPartnerSubmissions ? (
        <Callout tone="warning" title="Confirm consent with the candidate">
          The candidate&apos;s privacy settings do not allow partner submissions. Confirm consent directly before accepting.
        </Callout>
      ) : null}
      {!s.hasConsentRecord ? <Callout tone="warning" title="No consent record">The partner&apos;s consent attestation was not found.</Callout> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Submission">
            <KeyValueList
              columns={2}
              items={[
                { label: "Candidate", value: <Link href={`/admin/candidates/${s.candidate.id}`} className="text-teal-strong underline-offset-4 hover:underline">{s.candidate.displayName}</Link> },
                { label: "Partner", value: s.partner.name },
                { label: "Assignment", value: <Link href={`/admin/partners/${s.assignment.id}`} className="text-teal-strong underline-offset-4 hover:underline">Open assignment ({humanize(s.assignment.status)})</Link> },
                { label: "Submitted", value: <DateText value={s.createdAt} mode="datetime" timeZone={tz} /> },
                { label: "Candidate source", value: humanize(s.candidateSource) },
                { label: "Consent record", value: s.hasConsentRecord ? "Recorded" : "Missing" },
                { label: "Application", value: s.application ? <Link href={`/admin/pipeline/${s.application.id}`} className="text-teal-strong underline-offset-4 hover:underline">{s.application.code} · {s.application.stageName}</Link> : null },
                { label: "Rejection reason", value: s.rejectionReasonCode ? REJECTION_REASON_LABELS[s.rejectionReasonCode] : null },
                { label: "Partner notes", value: s.partnerNotes, fullWidth: true },
                { label: "Feedback to partner", value: s.partnerFeedback, fullWidth: true },
                { label: "Internal review notes", value: s.reviewNotes, fullWidth: true },
              ]}
            />
          </SectionCard>

          <SectionCard title="Possible duplicates" description="Matched on email, phone, passport or name and date of birth. Merging records is done by the candidates team.">
            {flags.length ? (
              <ul className="space-y-3">
                {flags.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link href={`/admin/candidates/${f.possibleDuplicateCandidateId}`} className="font-medium underline-offset-4 hover:underline">
                          {f.otherName ?? "Candidate"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Matched on {f.matchedOn.map(humanize).join(", ")}
                          {f.score != null ? ` · score ${f.score}` : ""}
                        </p>
                        {f.resolutionNotes ? <p className="mt-1 text-xs text-muted-foreground">{f.resolutionNotes}</p> : null}
                      </div>
                      <StatusBadge tone={f.status === "open" ? "warning" : statusTone(f.status)} size="sm">{humanize(f.status)}</StatusBadge>
                    </div>
                    {f.status === "open" && canResolveFlags ? (
                      <div className="mt-2">
                        <ReasonDialog action={resolveDuplicateFlagFormAction} hidden={{ flagId: f.id }} triggerLabel="Resolve" title="Resolve this duplicate flag" confirmLabel="Save decision" reasonName="resolutionNotes" reasonLabel="Resolution notes" reasonRequired={false} choice={{ name: "status", label: "Decision", options: FLAG_CHOICES, required: true }} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No possible duplicates found.</p>
            )}
          </SectionCard>

          <SectionCard title="Attribution" description="Which partner sourced this candidate first, within the attribution window set in platform settings.">
            {attributions.length ? (
              <ul className="space-y-3">
                {attributions.map((at) => (
                  <li key={at.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{at.partnerName ?? "Partner"}</p>
                        <p className="text-xs text-muted-foreground">
                          First submitted <DateText value={at.firstSubmittedAt} timeZone={tz} />
                          {at.expiresAt ? <> · window ends <DateText value={at.expiresAt} timeZone={tz} /></> : null}
                        </p>
                        {at.resolutionNotes ? <p className="mt-1 text-xs text-muted-foreground">{at.resolutionNotes}</p> : null}
                      </div>
                      <StatusBadge tone={at.status === "disputed" ? "warning" : statusTone(at.status)} size="sm">{humanize(at.status)}</StatusBadge>
                    </div>
                    {canAttribution && (at.status === "active" || at.status === "disputed") ? (
                      <div className="mt-2">
                        <ReasonDialog
                          action={updateAttributionFormAction}
                          hidden={{ attributionId: at.id }}
                          triggerLabel="Update attribution"
                          title="Update this attribution"
                          confirmLabel="Save"
                          reasonName="resolutionNotes"
                          reasonLabel="Resolution notes"
                          choice={{ name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "disputed", label: "Disputed" }, { value: "revoked", label: "Revoked" }, { value: "expired", label: "Expired" }], defaultValue: at.status, required: true }}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No attribution recorded.</p>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {canReview && reviewable ? (
            <SectionCard title="Accept into the pipeline" description="Creates an application credited to the partner. The candidate's consent attestation is linked.">
              <StaffForm
                action={acceptSubmissionFormAction}
                hidden={{ submissionId: s.id, jobId: s.jobId ?? undefined }}
                submitLabel="Accept submission"
                successHref="/admin/pipeline/{id}"
                testId="accept-submission-form"
                fields={[
                  ...(s.jobId ? [] : [{ name: "jobId", label: "Job", kind: "search-select" as const, required: true, options: jobs, hint: "The assignment targets a requirement; choose the job." }]),
                  { name: "partnerFeedback", label: "Feedback for the partner", kind: "textarea", optional: true, rows: 2 },
                  { name: "reviewNotes", label: "Internal review notes", kind: "textarea", optional: true, rows: 2 },
                ]}
              />
              {otherAttribution ? <p className="mt-3 text-xs text-danger-strong">Acceptance is refused while another partner holds the attribution.</p> : null}
            </SectionCard>
          ) : null}
          <InternalNotesPanel ctx={staff} entityType="partner_submission" entityId={s.id} organizationId={s.partner.id} title="Team notes" />
        </div>
      </div>
    </div>
  );
}
