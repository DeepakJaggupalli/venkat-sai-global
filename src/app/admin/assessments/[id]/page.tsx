import { Award, Megaphone, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { FileLink } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getFiles, toFileSummary } from "@/modules/files";
import { issueCertificateAction } from "@/modules/training/actions";
import { listAssessmentCentres } from "@/modules/training/centres";
import { SKILL_ASSESSMENT_TYPE_LABELS } from "@/modules/training/constants";
import { getSkillAssessment } from "@/modules/training/skill-assessments";
import { cancelSkillAssessmentAction, markSkillAssessmentNoShowAction, publishSkillAssessmentResultAction, recordSkillAssessmentResultAction } from "@/modules/training/staff-actions";
import { utcToZonedLocal } from "@/modules/recruitment/timezone";

import { isUuid, orNotFound, staffTimeZone } from "../../pipeline/_shared/server";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { rescheduleAssessmentAction } from "../actions";

export const metadata: Metadata = { title: "Assessment · Assessment centre" };

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["recruitment.assessments", "recruitment.view"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const a = await orNotFound(getSkillAssessment(staff, id));
  const tz = staffTimeZone(staff);
  const canAssess = staffCan(staff, "recruitment.assessments");
  const canCertify = staffCan(staff, "training.certificates");
  const [evidence, centres] = await Promise.all([
    a.evidenceFileIds.length ? getFiles(a.evidenceFileIds) : Promise.resolve([]),
    canAssess && a.status === "scheduled" ? listAssessmentCentres(staff) : Promise.resolve([]),
  ]);
  const evidenceFiles = evidence.map((f) => toFileSummary(f));
  const centreOptions = centres.map((c) => ({ value: c.id, label: `${c.name}, ${c.city}` }));
  const scheduledLocal = utcToZonedLocal(a.scheduledAt, tz).slice(0, 16);
  const recorded = a.status === "completed";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${a.trade} · ${SKILL_ASSESSMENT_TYPE_LABELS[a.assessmentType]}`}
        eyebrow={<span className="font-mono">{a.code}</span>}
        status={<StatusBadge tone={statusTone(a.status)}>{humanize(a.status)}</StatusBadge>}
        description={
          <>
            Candidate:{" "}
            <Link href={`/admin/candidates/${a.candidateId}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
              {a.candidateName}
            </Link>
            {a.attemptNumber > 1 ? ` · Attempt ${a.attemptNumber}` : ""}
          </>
        }
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Assessment centre", href: "/admin/assessments" }, { label: a.code }]}
        actions={
          canAssess ? (
            <div className="flex flex-wrap gap-2">
              {recorded && !a.resultPublishedAt ? (
                <ActionButton variant="default" icon={<Megaphone aria-hidden="true" />} action={publishSkillAssessmentResultAction.bind(null, { assessmentId: a.id })} confirm={{ title: "Publish this result to the candidate?", description: "The candidate sees the result and remarks. Internal notes and evidence stay staff-only.", confirmLabel: "Publish result" }}>
                  Publish result
                </ActionButton>
              ) : null}
              {a.status === "scheduled" ? (
                <>
                  <ActionButton icon={<UserX aria-hidden="true" />} action={markSkillAssessmentNoShowAction.bind(null, { assessmentId: a.id })} confirm={{ title: "Mark as no-show?", confirmLabel: "Mark no-show" }}>
                    No-show
                  </ActionButton>
                  <ReasonDialog action={cancelSkillAssessmentAction} hidden={{ assessmentId: a.id }} triggerLabel="Cancel" title="Cancel this assessment?" description="The reason is shared with the candidate." confirmLabel="Cancel assessment" destructive variant="ghost" />
                </>
              ) : null}
              {recorded && a.result === "pass" && canCertify ? (
                <ActionButton icon={<Award aria-hidden="true" />} action={issueAssessmentCertificate.bind(null, a.id)} confirm={{ title: "Issue a Venkat Sai assessment certificate?", description: "It records this Venkat Sai assessment result with its procedure reference. It is not an accredited certification. The candidate is notified.", confirmLabel: "Issue certificate" }}>
                  Issue certificate
                </ActionButton>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {a.status === "cancelled" && a.cancellationReason ? <Callout tone="warning" title="Cancelled">{a.cancellationReason}</Callout> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Assessment">
            <KeyValueList
              columns={2}
              items={[
                { label: "Scheduled", value: <DateText value={a.scheduledAt} mode="datetime" timeZone={tz} /> },
                { label: "Venue", value: a.centreName ?? a.location },
                { label: "Process", value: a.process },
                { label: "Position", value: a.position },
                { label: "Procedure reference", value: a.standardReference, hint: "Venkat Sai assessment procedure; not an external certification." },
                { label: "Material", value: a.materialDetails },
                { label: "Evaluation", value: a.evaluationMethods.length ? a.evaluationMethods.join(", ") : null },
                { label: "Assessor", value: a.assessorName },
              ]}
            />
          </SectionCard>

          <SectionCard title="Result" description={a.resultPublishedAt ? undefined : "Not visible to the candidate until published."}>
            {recorded ? (
              <KeyValueList
                columns={2}
                items={[
                  { label: "Result", value: <StatusBadge tone={statusTone(a.result)}>{humanize(a.result)}</StatusBadge> },
                  { label: "Score", value: a.score != null ? `${a.score}${a.maxScore != null ? ` / ${a.maxScore}` : ""}` : null },
                  { label: "Published", value: a.resultPublishedAt ? <DateText value={a.resultPublishedAt} mode="datetime" timeZone={tz} /> : "Not yet" },
                  { label: "Retest from", value: a.retestAvailableFrom ? <DateText value={a.retestAvailableFrom} dateOnly /> : null },
                  { label: "Remarks for the candidate", value: a.remarks, fullWidth: true },
                  { label: "Internal notes (staff only)", value: a.internalNotes, fullWidth: true },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No result recorded yet.</p>
            )}
            {evidenceFiles.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium">Evidence (staff only)</h3>
                <ul className="space-y-2">
                  {evidenceFiles.map((f) => (
                    <li key={f.id}>
                      <FileLink file={f} showMeta />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>

          {canAssess && (a.status === "scheduled" || (recorded && !a.resultPublishedAt)) ? (
            <SectionCard title={recorded ? "Correct the result" : "Record the result"} description="A pass verifies the assessed skill on the candidate's profile.">
              <StaffForm
                action={recordSkillAssessmentResultAction}
                hidden={{ assessmentId: a.id }}
                columns={2}
                submitLabel={recorded ? "Save correction" : "Record result"}
                testId="record-result-form"
                fields={[
                  { name: "result", label: "Result", kind: "select", required: true, options: [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "retest", label: "Retest" }], defaultValue: recorded ? a.result : null },
                  { name: "score", label: "Score", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: a.score },
                  { name: "maxScore", label: "Maximum score", kind: "number", optional: true, min: 0.01, step: "0.01", defaultValue: a.maxScore },
                  { name: "retestAvailableFrom", label: "Retest available from", kind: "date", optional: true, defaultValue: a.retestAvailableFrom },
                  { name: "remarks", label: "Remarks for the candidate", kind: "textarea", optional: true, rows: 3, defaultValue: a.remarks },
                  { name: "internalNotes", label: "Internal notes (staff only)", kind: "textarea", optional: true, rows: 3, defaultValue: a.internalNotes },
                  { name: "evidenceFileIds", label: "Evidence", kind: "files", purpose: "candidate_document", defaultFiles: evidenceFiles, hint: "Photos of test pieces, inspection reports. Staff only." },
                  { name: "publish", label: "Publish the result to the candidate now", kind: "checkbox" },
                  { name: "verifySkill", label: "Mark the assessed skill as verified on a pass", kind: "checkbox", defaultValue: true },
                  ...(canCertify
                    ? [
                        { name: "issueCertificate", label: "Issue a Venkat Sai assessment certificate (pass only)", kind: "checkbox" as const, hint: "Recorded as a Venkat Sai assessment, never as an accredited certification." },
                        { name: "certificateTitle", label: "Certificate title", optional: true, placeholder: `${a.trade} – Venkat Sai assessment` },
                        { name: "certificateExpiresOn", label: "Certificate expiry", kind: "date" as const, optional: true },
                      ]
                    : []),
                ]}
              />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          {canAssess && a.status === "scheduled" ? (
            <SectionCard title="Reschedule" description="The candidate is notified of the new time.">
              <StaffForm
                action={rescheduleAssessmentAction}
                hidden={{ assessmentId: a.id }}
                sendTimeZone
                submitLabel="Reschedule"
                fields={[
                  { name: "scheduledAtLocal", label: "New date and time", kind: "datetime-local", required: true, defaultValue: scheduledLocal },
                  { name: "timezone", label: "Time zone", optional: true, defaultValue: tz },
                  { name: "assessmentCentreId", label: "Assessment centre", kind: "search-select", optional: true, options: centreOptions, defaultValue: a.assessmentCentreId, allowClear: true },
                  { name: "location", label: "Or other venue", optional: true, defaultValue: a.location },
                ]}
              />
            </SectionCard>
          ) : null}
          <SectionCard title="Links">
            <ul className="space-y-2 text-sm">
              <li>
                <Link className="underline-offset-4 hover:underline" href={`/admin/candidates/${a.candidateId}`}>Candidate profile</Link>
              </li>
              {a.applicationId ? (
                <li>
                  <Link className="underline-offset-4 hover:underline" href={`/admin/pipeline/${a.applicationId}`}>Application</Link>
                </li>
              ) : null}
              {a.retestOfAssessmentId ? (
                <li>
                  <Link className="underline-offset-4 hover:underline" href={`/admin/assessments/${a.retestOfAssessmentId}`}>Previous attempt</Link>
                </li>
              ) : null}
              {a.status === "completed" && (a.result === "fail" || a.result === "retest") && canAssess ? (
                <li>
                  <Link className="underline-offset-4 hover:underline" href={`/admin/assessments/new?candidate=${a.candidateId}&retestOf=${a.id}${a.applicationId ? `&application=${a.applicationId}` : ""}`}>Schedule a retest</Link>
                </li>
              ) : null}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** Issues a Venkat Sai certificate for a passed assessment after the fact (module re-authorises training.certificates). */
async function issueAssessmentCertificate(skillAssessmentId: string) {
  "use server";
  const fd = new FormData();
  fd.set("via", "admin");
  fd.set("issuerType", "venkat_sai");
  fd.set("skillAssessmentId", skillAssessmentId);
  return issueCertificateAction(null, fd);
}
