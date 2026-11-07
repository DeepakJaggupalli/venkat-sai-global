import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { SUBMISSION_STATUS_LABELS } from "@/modules/recruitment/constants";
import { listSubmissionsForStaff } from "@/modules/recruitment/queries";

import { isUuid, orNotFound, staffTimeZone } from "../../pipeline/_shared/server";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { setAssignmentStatusFormAction, updateAssignmentFormAction } from "../actions";
import { loadAssignmentForStaff } from "../_lib/queries";

export const metadata: Metadata = { title: "Assignment · Partners" };

export default async function PartnerAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const staff = await requireStaff(["partners.view", "partners.assign"], "any");
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) notFound();
  const a = await orNotFound(loadAssignmentForStaff(staff, assignmentId));
  const tz = staffTimeZone(staff);
  const canAssign = staffCan(staff, "partners.assign");
  const canSeeSubmissions = staffCan(staff, ["recruitment.view", "recruitment.manage", "partners.view"], "any");
  const submissions = canSeeSubmissions ? await listSubmissionsForStaff(staff, { assignmentId: a.id }, { page: 1, pageSize: 50, offset: 0 }) : null;
  const terms = a.commissionTerms;
  const live = a.status === "active" || a.status === "paused";

  return (
    <div className="space-y-6">
      <PageHeader
        title={a.title || "Assignment"}
        eyebrow={a.requirement?.code ?? a.job?.code}
        status={<StatusBadge tone={statusTone(a.status)}>{humanize(a.status)}</StatusBadge>}
        description={`Assigned to ${a.partnerName}`}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners", href: "/admin/partners" }, { label: a.title || "Assignment" }]}
        actions={
          canAssign && live ? (
            <div className="flex flex-wrap gap-2">
              {a.status === "active" ? (
                <ReasonDialog action={setAssignmentStatusFormAction} hidden={{ assignmentId: a.id, status: "paused" }} triggerLabel="Pause" title="Pause this assignment?" description="The partner cannot submit until it is resumed." confirmLabel="Pause" reasonRequired={false} />
              ) : (
                <ReasonDialog action={setAssignmentStatusFormAction} hidden={{ assignmentId: a.id, status: "active" }} triggerLabel="Resume" title="Resume this assignment?" confirmLabel="Resume" reasonRequired={false} variant="default" />
              )}
              <ReasonDialog action={setAssignmentStatusFormAction} hidden={{ assignmentId: a.id, status: "completed" }} triggerLabel="Mark completed" title="Mark this assignment as completed?" confirmLabel="Complete" reasonRequired={false} />
              <ReasonDialog action={setAssignmentStatusFormAction} hidden={{ assignmentId: a.id, status: "revoked" }} triggerLabel="Revoke" title="Revoke this assignment?" description="The partner is notified with the reason." confirmLabel="Revoke" destructive variant="ghost" />
            </div>
          ) : undefined
        }
      />
      {a.status === "revoked" && a.revocationReason ? <Callout tone="warning" title="Revoked">{a.revocationReason}</Callout> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Details">
            <KeyValueList
              columns={2}
              items={[
                { label: "Partner", value: a.partnerName },
                { label: "Requirement", value: a.requirement ? `${a.requirement.code} · ${a.requirement.title}` : null },
                { label: "Job", value: a.job ? `${a.job.title} (${a.job.code})` : null },
                { label: "Destination", value: a.requirement?.countryCode ?? a.job?.countryCode ?? null },
                { label: "Submissions", value: `${a.submissionsUsed}${a.submissionLimit ? ` of ${a.submissionLimit}` : ""}` },
                { label: "Positions target", value: a.positionsTarget },
                { label: "Due", value: a.dueDate ? <DateText value={a.dueDate} dateOnly /> : null },
                { label: "Created", value: <DateText value={a.createdAt} timeZone={tz} /> },
                { label: "Instructions to the partner", value: a.instructions, fullWidth: true },
                { label: "Internal notes (staff only)", value: a.internalNotes, fullWidth: true },
              ]}
            />
          </SectionCard>

          <SectionCard title="Submissions" flush action={submissions?.total ? { label: "Review queue", href: `/admin/partners/submissions?assignment=${a.id}` } : undefined}>
            {submissions ? (
              <DataTable
                caption="Submissions for this assignment"
                rows={submissions.items}
                getRowId={(s) => s.id}
                rowLink={(s) => ({ href: `/admin/partners/submissions/${s.id}`, label: `Open submission ${s.code}` })}
                columns={[
                  { id: "candidate", header: "Candidate", primary: true, cell: (s) => (<div><p className="font-medium">{s.candidate.displayName}</p><p className="font-mono text-xs text-muted-foreground">{s.code}</p></div>) },
                  { id: "job", header: "Job", hideOnMobile: true, cell: (s) => s.jobTitle ?? "—" },
                  { id: "flags", header: "Checks", cell: (s) => (s.openDuplicateFlags ? <StatusBadge tone="warning" size="sm">{`${s.openDuplicateFlags} possible duplicate${s.openDuplicateFlags === 1 ? "" : "s"}`}</StatusBadge> : <span className="text-muted-foreground">—</span>) },
                  { id: "status", header: "Status", cell: (s) => <StatusBadge tone={statusTone(s.status)} size="sm">{SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge> },
                  { id: "date", header: "Submitted", hideOnMobile: true, cell: (s) => <DateText value={s.createdAt} timeZone={tz} /> },
                ]}
                empty={<EmptyState size="sm" variant="plain" title="No submissions yet" description="Candidates the partner submits for this assignment appear here." />}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">You do not have access to submissions.</p>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Commission terms" description="Staff only. The partner sees only its own terms.">
            <KeyValueList
              items={[
                { label: "Model", value: terms.model ? humanize(terms.model) : "Not set" },
                { label: "Amount", value: terms.amountMinor != null && terms.currency ? <MoneyText amountMinor={terms.amountMinor} currency={terms.currency} /> : null },
                { label: "Percent of fee", value: terms.percentBasisPoints != null ? `${terms.percentBasisPoints / 100}%` : null },
                { label: "Payable after", value: terms.payableAfterDays != null ? `${terms.payableAfterDays} days` : null },
                { label: "Notes", value: terms.notes },
              ]}
            />
          </SectionCard>
          {canAssign && live ? (
            <SectionCard title="Edit assignment">
              <StaffForm
                action={updateAssignmentFormAction}
                hidden={{ assignmentId: a.id }}
                submitLabel="Save"
                fields={[
                  { name: "positionsTarget", label: "Positions target", kind: "number", optional: true, min: 1, defaultValue: a.positionsTarget },
                  { name: "submissionLimit", label: "Submission limit", kind: "number", optional: true, min: 1, defaultValue: a.submissionLimit },
                  { name: "dueDate", label: "Due date", kind: "date", optional: true, defaultValue: a.dueDate },
                  { name: "instructions", label: "Instructions for the partner", kind: "textarea", optional: true, rows: 3, defaultValue: a.instructions },
                  { name: "internalNotes", label: "Internal notes", kind: "textarea", optional: true, rows: 2, defaultValue: a.internalNotes },
                ]}
              />
            </SectionCard>
          ) : null}
          <SectionCard title="Partner">
            <p className="text-sm">
              <Link href={`/admin/partners/performance?partner=${a.partnerOrganizationId}`} className="text-teal-strong underline-offset-4 hover:underline">
                Performance of {a.partnerName}
              </Link>
            </p>
          </SectionCard>
          <InternalNotesPanel ctx={staff} entityType="partner_assignment" entityId={a.id} organizationId={a.partnerOrganizationId} title="Team notes" />
        </div>
      </div>
    </div>
  );
}
