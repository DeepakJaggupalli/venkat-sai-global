import { Award, CheckCircle2, Pause, Play, Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { DownloadExcelButton } from "@/components/admin/download-excel-button";
import { listStaffOptions } from "@/components/admin/queries";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  addBatchInstructorAction,
  cancelBatchAction,
  completeEnrolmentAction,
  confirmEnrolmentAction,
  decideEnrolmentAction,
  issueCertificateAction,
  removeBatchInstructorAction,
  setBatchStatusAction,
  updateBatchAction,
  waitlistEnrolmentAction,
} from "@/modules/training/actions";
import { BATCH_INSTRUCTOR_ROLES, BATCH_STATUS_LABELS, COURSE_MODE_LABELS, ENROLMENT_STATUS_LABELS } from "@/modules/training/constants";
import { listCertificates } from "@/modules/training/certificates";
import { getBatchForActor, listBatchEnrolments } from "@/modules/training/queries";
import type { EnrolmentRow } from "@/modules/training/types";

import { isUuid, optionsFrom, orNotFound, staffTimeZone } from "../../../pipeline/_shared/server";
import { ReasonDialog } from "../../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../../pipeline/_shared/status";
import { batchFields } from "../../_lib/batch-fields";
import { providerName } from "../../_lib/queries";

export const metadata: Metadata = { title: "Batch · Training" };

const OPEN_ENROLMENT: readonly EnrolmentRow["status"][] = ["applied", "waitlisted"];

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["training.view", "training.manage"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { batch, course, instructors, enrolmentCounts } = await orNotFound(getBatchForActor(staff, id));
  const tz = staffTimeZone(staff);
  const isOwn = !batch.organizationId;
  const canManage = staffCan(staff, "training.manage") && isOwn;
  const canCertify = staffCan(staff, "training.certificates") && isOwn && course.certificationType !== "none" && course.certificationType !== "accredited_external";
  const live = batch.status !== "cancelled" && batch.status !== "completed";

  const [enrolments, provider, certs, staffOptions, editFields] = await Promise.all([
    listBatchEnrolments(staff, batch.id),
    providerName(batch.organizationId),
    listCertificates(staff, { batchId: batch.id }, { page: 1, pageSize: 100, offset: 0 }),
    canManage ? listStaffOptions() : Promise.resolve([]),
    canManage && live ? batchFields(batch, { timeZone: tz }) : Promise.resolve([]),
  ]);
  const certByEnrolment = new Map(certs.items.filter((c) => c.enrolmentId && c.status === "active").map((c) => [c.enrolmentId as string, c]));
  const via = { via: "admin" as const };

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.title}
        eyebrow={<span className="font-mono">{batch.code}</span>}
        status={<StatusBadge tone={statusTone(batch.status)}>{BATCH_STATUS_LABELS[batch.status]}</StatusBadge>}
        description={
          <>
            <Link href={`/admin/training/courses/${course.id}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
              {course.title}
            </Link>{" "}
            · {provider} · {COURSE_MODE_LABELS[batch.mode]}
          </>
        }
        breadcrumbs={[
          { label: "Command Centre", href: "/admin" },
          { label: "Training", href: "/admin/training" },
          { label: "Batches", href: "/admin/training/batches" },
          { label: batch.title },
        ]}
        actions={
          canManage && live ? (
            <div className="flex flex-wrap gap-2">
              {batch.status === "planned" ? (
                <ActionButton variant="default" icon={<Play aria-hidden="true" />} action={setBatchStatusAction.bind(null, { ...via, batchId: batch.id, transition: "open" })}>
                  Open for enrolment
                </ActionButton>
              ) : null}
              {batch.status === "open" || batch.status === "full" ? (
                <ActionButton icon={<Pause aria-hidden="true" />} action={setBatchStatusAction.bind(null, { ...via, batchId: batch.id, transition: "pause" })}>
                  Pause enrolment
                </ActionButton>
              ) : null}
              {batch.status !== "in_progress" ? (
                <ActionButton icon={<Play aria-hidden="true" />} action={setBatchStatusAction.bind(null, { ...via, batchId: batch.id, transition: "start" })} confirm={{ title: "Start this batch?", description: "Confirmed learners move to in progress.", confirmLabel: "Start batch" }}>
                  Start batch
                </ActionButton>
              ) : (
                <ActionButton icon={<Flag aria-hidden="true" />} action={setBatchStatusAction.bind(null, { ...via, batchId: batch.id, transition: "complete" })} confirm={{ title: "Mark this batch as completed?", confirmLabel: "Complete batch" }}>
                  Complete batch
                </ActionButton>
              )}
              <ReasonDialog
                action={cancelBatchAction}
                hidden={{ ...via, batchId: batch.id }}
                triggerLabel="Cancel batch"
                title="Cancel this batch?"
                description="Every open enrolment is cancelled with this reason and learners are notified."
                confirmLabel="Cancel batch"
                destructive
                variant="ghost"
              />
            </div>
          ) : undefined
        }
      />

      <StatGrid columns={4}>
        <StatCard label="Seats taken" value={batch.enrolledCount} hint={batch.capacity ? `of ${batch.capacity}` : "No fixed limit"} />
        <StatCard label="Awaiting decision" value={enrolmentCounts.applied + enrolmentCounts.waitlisted} />
        <StatCard label="In progress" value={enrolmentCounts.in_progress} />
        <StatCard label="Completed" value={enrolmentCounts.completed} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Learners" description="Contact details stay on the candidate profile, where reveals are recorded." flush action={<DownloadExcelButton href={`/admin/training/batches/${batch.id}/export`} />}>
            <DataTable
              caption="Enrolments in this batch"
              rows={enrolments}
              getRowId={(e) => e.id}
              columns={[
                {
                  id: "name",
                  header: "Learner",
                  primary: true,
                  cell: (e) => (
                    <Link href={`/admin/candidates/${e.candidateId}`} className="font-medium underline-offset-4 hover:underline">
                      {e.candidateName}
                    </Link>
                  ),
                },
                { id: "status", header: "Status", cell: (e) => <StatusBadge tone={statusTone(e.status)} size="sm">{ENROLMENT_STATUS_LABELS[e.status]}</StatusBadge> },
                { id: "applied", header: "Applied", hideOnMobile: true, cell: (e) => <DateText value={e.appliedAt} timeZone={tz} /> },
                {
                  id: "result",
                  header: "Result",
                  hideOnMobile: true,
                  cell: (e) => (
                    <span>
                      {humanize(e.resultStatus)}
                      {e.attendancePercent != null ? <span className="block text-xs text-muted-foreground">Attendance {e.attendancePercent}%</span> : null}
                    </span>
                  ),
                },
                {
                  id: "actions",
                  header: "Actions",
                  cell: (e) => {
                    const cert = certByEnrolment.get(e.id);
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {canManage && OPEN_ENROLMENT.includes(e.status) ? (
                          <ActionButton variant="default" action={confirmEnrolmentAction.bind(null, { ...via, enrolmentId: e.id })}>
                            Confirm
                          </ActionButton>
                        ) : null}
                        {canManage && e.status === "applied" ? (
                          <ActionButton action={waitlistEnrolmentAction.bind(null, { ...via, enrolmentId: e.id })}>Waitlist</ActionButton>
                        ) : null}
                        {canManage && OPEN_ENROLMENT.includes(e.status) ? (
                          <ReasonDialog action={decideEnrolmentAction} hidden={{ ...via, enrolmentId: e.id, decision: "reject" }} triggerLabel="Decline" title={`Decline ${e.candidateName}?`} description="The reason is shown to the learner." confirmLabel="Decline" destructive variant="ghost" />
                        ) : null}
                        {canManage && (e.status === "confirmed" || e.status === "in_progress") ? (
                          <>
                            <ActionButton action={completeEnrolmentAction.bind(null, { ...via, enrolmentId: e.id })} icon={<CheckCircle2 aria-hidden="true" />}>
                              Complete
                            </ActionButton>
                            <ReasonDialog action={decideEnrolmentAction} hidden={{ ...via, enrolmentId: e.id, decision: e.status === "in_progress" ? "drop" : "cancel" }} triggerLabel={e.status === "in_progress" ? "Mark dropped" : "Cancel"} title={e.status === "in_progress" ? "Mark as dropped out?" : "Cancel this enrolment?"} description="The reason is shown to the learner." confirmLabel="Confirm" destructive variant="ghost" />
                          </>
                        ) : null}
                        {cert ? (
                          <StatusBadge tone="success" size="sm">
                            Certificate {cert.code}
                          </StatusBadge>
                        ) : canCertify && e.status === "completed" && (course.certificationType === "completion_only" || e.resultStatus === "passed") ? (
                          <ActionButton
                            icon={<Award aria-hidden="true" />}
                            action={issueCertificateFor.bind(null, e.id)}
                            confirm={{ title: `Issue a Venkat Sai certificate to ${e.candidateName}?`, description: "It records a Venkat Sai training or assessment result and is not an external accreditation. The learner is notified.", confirmLabel: "Issue certificate" }}
                          >
                            Issue certificate
                          </ActionButton>
                        ) : null}
                      </div>
                    );
                  },
                },
              ]}
              empty={<EmptyState size="sm" variant="plain" title="No learners yet" description={batch.status === "open" ? "Applications appear here as candidates apply." : "Open the batch for enrolment to accept applications."} />}
            />
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Details">
            <KeyValueList
              items={[
                { label: "Dates", value: batch.startsOn ? <span><DateText value={batch.startsOn} dateOnly />{batch.endsOn ? <> – <DateText value={batch.endsOn} dateOnly /></> : null}</span> : null },
                { label: "Registration closes", value: batch.registrationDeadline ? <DateText value={batch.registrationDeadline} dateOnly /> : null },
                { label: "Timetable", value: batch.schedule ? `${batch.schedule}${batch.timezone ? ` (${batch.timezone})` : ""}` : null },
                { label: "Venue", value: [batch.venue, batch.city, batch.countryCode].filter(Boolean).join(", ") || null },
                { label: "Cancellation reason", value: batch.cancellationReason },
              ]}
            />
          </SectionCard>
          <SectionCard title="Instructors">
            {instructors.length ? (
              <ul className="space-y-2">
                {instructors.map((ins) => (
                  <li key={ins.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{ins.name}</span> <span className="text-muted-foreground">· {humanize(ins.role)}</span>
                    </span>
                    {canManage ? (
                      <ActionButton variant="ghost" action={removeBatchInstructorAction.bind(null, { ...via, instructorId: ins.id })} confirm={{ title: `Remove ${ins.name}?`, confirmLabel: "Remove", destructive: true }}>
                        Remove
                      </ActionButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No instructors assigned.</p>
            )}
            {canManage && live ? (
              <div className="mt-4 border-t border-border pt-4">
                <StaffForm
                  action={addBatchInstructorAction}
                  hidden={{ ...via, batchId: batch.id }}
                  resetOnSuccess
                  submitLabel="Add instructor"
                  fields={[
                    { name: "userId", label: "Venkat Sai team member", kind: "search-select", optional: true, options: staffOptions, allowClear: true },
                    { name: "name", label: "Or external instructor name", optional: true, maxLength: 120 },
                    { name: "role", label: "Role", kind: "select", required: true, options: optionsFrom(BATCH_INSTRUCTOR_ROLES), defaultValue: "lead" },
                  ]}
                />
              </div>
            ) : null}
          </SectionCard>
          {canManage && live ? (
            <SectionCard title="Edit batch">
              <StaffForm action={updateBatchAction} hidden={{ ...via, batchId: batch.id }} fields={editFields} submitLabel="Save batch" />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Issues a Venkat Sai certificate for a completed enrolment (re-authorised by the module action). */
async function issueCertificateFor(enrolmentId: string) {
  "use server";
  const fd = new FormData();
  fd.set("via", "admin");
  fd.set("issuerType", "venkat_sai");
  fd.set("enrolmentId", enrolmentId);
  return issueCertificateAction(null, fd);
}
