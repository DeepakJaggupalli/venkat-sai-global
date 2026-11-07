import { Share2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ActionButton } from "@/components/admin/action-button";
import { AssignSelect } from "@/components/admin/assign-select";
import { listStaffOptions } from "@/components/admin/queries";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { shareApplicationsWithEmployerAction } from "@/modules/recruitment/actions";
import { INTERVIEW_MODE_LABELS, NOTE_VISIBILITY_LABELS, NOTE_VISIBILITY_OPTIONS, OFFER_STATUS_LABELS, RECOMMENDATION_LABELS, REJECTION_REASON_LABELS, REJECTION_REASON_OPTIONS } from "@/modules/recruitment/constants";
import { MOBILISATION_STATUS_LABELS } from "@/modules/recruitment/mobilisation-rules";
import { getApplicationForStaff } from "@/modules/recruitment/queries";
import { formatInTimeZone } from "@/modules/recruitment/timezone";
import { SKILL_ASSESSMENT_TYPE_LABELS } from "@/modules/training/constants";
import { listAssessmentsForApplications } from "@/modules/training/skill-assessments";
import { countryOptions } from "@/modules/taxonomy/queries";

import { startMobilisationFormAction } from "../../mobilisation/actions";
import { addNoteFormAction, assignOwnerAction, confirmJoinedFormAction, deleteNoteAction, transitionFormAction } from "../actions";
import { isUuid, orNotFound, staffTimeZone } from "../_shared/server";
import { StaffForm } from "../_shared/staff-form";
import { humanize, statusTone } from "../_shared/status";

export const metadata: Metadata = { title: "Application · Pipeline" };

function answerText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "No answer";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function StaffApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const staff = await requireStaff(["recruitment.view", "recruitment.manage"], "any");
  const { applicationId } = await params;
  if (!isUuid(applicationId)) notFound();
  const d = await orNotFound(getApplicationForStaff(staff, applicationId));
  const tz = staffTimeZone(staff);
  const canManage = staffCan(staff, "recruitment.manage");
  const canMobilise = staffCan(staff, "recruitment.mobilisation");
  const canAssess = staffCan(staff, "recruitment.assessments");
  const [owners, assessments, countries] = await Promise.all([
    canManage ? listStaffOptions({ permission: "recruitment.manage" }) : Promise.resolve([]),
    listAssessmentsForApplications([d.application.id]),
    d.placement && !d.placement.mobilisationId && canMobilise ? countryOptions() : Promise.resolve([]),
  ]);
  const app = d.application;
  const closed = app.status !== "active";
  const managedUnshared = d.job.managedByVenkatSai && !app.sharedWithEmployerAt;
  const feedback = d.interviews.flatMap((i) => i.feedback.map((f) => ({ ...f, round: i.roundName })));

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.candidate.displayName}
        eyebrow={<span className="font-mono">{app.code}</span>}
        status={<StatusBadge tone={statusTone(d.stage.category)}>{d.stage.name}</StatusBadge>}
        description={
          <>
            {d.job.title} ({d.job.code}) · {d.job.organizationName ?? "Venkat Sai"}
            {d.job.isOverseas ? " · Overseas" : ""}
          </>
        }
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Pipeline", href: "/admin/pipeline" }, { label: app.code }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionLinkButton href={`/admin/candidates/${d.candidate.id}`}>Candidate profile</ActionLinkButton>
            {canManage && managedUnshared && !closed ? (
              <ActionButton variant="default" icon={<Share2 aria-hidden="true" />} action={shareApplicationsWithEmployerAction.bind(null, { applicationIds: [app.id] })} confirm={{ title: "Share this application with the employer?", description: "The employer sees the profile snapshot, resume and shareable documents. The candidate consented when the application was created.", confirmLabel: "Share" }}>
                Share with employer
              </ActionButton>
            ) : null}
          </div>
        }
      />

      {managedUnshared ? <Callout tone="info" title="Venkat Sai-managed job">This application has not been shared with the employer yet.</Callout> : null}
      {app.knockoutFlags.length ? (
        <Callout tone="warning" title={`${app.knockoutFlags.length} screening answer${app.knockoutFlags.length === 1 ? "" : "s"} flagged`}>
          Knockout rules only flag answers for review; they never reject automatically.
        </Callout>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {canManage && d.allowedTargets.length ? (
            <SectionCard title="Move stage" description="Candidates are notified for stages that notify them. A rejection needs a job-related reason.">
              <StaffForm
                action={transitionFormAction}
                hidden={{ applicationId: app.id }}
                columns={2}
                submitLabel="Move"
                testId="transition-form"
                fields={[
                  { name: "toStageKey", label: "New stage", kind: "select", required: true, options: d.allowedTargets.map((s) => ({ value: s.key, label: s.name })) },
                  { name: "rejectionReasonCode", label: "Rejection reason", kind: "select", optional: true, options: REJECTION_REASON_OPTIONS.map((v) => ({ value: v, label: REJECTION_REASON_LABELS[v] })), hint: "Only for rejections.", allowClear: true },
                  { name: "candidateVisibleNote", label: "Message to the candidate", kind: "textarea", optional: true, rows: 2, maxLength: 2000 },
                  { name: "internalNote", label: "Internal note", kind: "textarea", optional: true, rows: 2, hint: "Staff only.", maxLength: 5000 },
                ]}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Interviews" action={canManage && !closed ? { label: "Schedule interview", href: `/admin/interviews/new?application=${app.id}` } : undefined}>
            {d.interviews.length ? (
              <ul className="space-y-3">
                {d.interviews.map((i) => (
                  <li key={i.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link href={`/admin/interviews/${i.id}`} className="font-medium underline-offset-4 hover:underline">
                          {i.roundName} (round {i.roundNumber})
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {formatInTimeZone(i.scheduledStart, i.timezone)} ({i.timezone}) · {INTERVIEW_MODE_LABELS[i.mode]} · {i.conductedBy === "venkat_sai" ? "Venkat Sai" : "Employer"}
                        </p>
                        <p className="text-xs text-muted-foreground">Candidate response: {humanize(i.candidateResponse)}</p>
                      </div>
                      <StatusBadge tone={statusTone(i.status)} size="sm">{humanize(i.status)}</StatusBadge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState size="sm" variant="plain" title="No interviews" description="Interviews scheduled by the employer or Venkat Sai appear here." />
            )}
          </SectionCard>

          <SectionCard title="Interview feedback" description="From the employer's panel and Venkat Sai. Never shown to the candidate or partners.">
            {feedback.length ? (
              <ul className="space-y-3">
                {feedback.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">
                      {f.round}: {RECOMMENDATION_LABELS[f.recommendation]}
                      {f.rating ? ` · ${f.rating}/5` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.authorName ?? "Panel member"} · <DateText value={f.updatedAt} timeZone={tz} />
                    </p>
                    {f.strengths ? <p className="mt-1">Strengths: {f.strengths}</p> : null}
                    {f.concerns ? <p className="mt-1">Concerns: {f.concerns}</p> : null}
                    {f.notes ? <p className="mt-1 text-muted-foreground">{f.notes}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No feedback yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Trade tests and assessments" action={canAssess && !closed ? { label: "Schedule assessment", href: `/admin/assessments/new?candidate=${d.candidate.id}&application=${app.id}` } : undefined}>
            {assessments.length ? (
              <ul className="space-y-2">
                {assessments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/admin/assessments/${a.id}`} className="underline-offset-4 hover:underline">
                      {a.trade} · {SKILL_ASSESSMENT_TYPE_LABELS[a.assessmentType]} · <DateText value={a.scheduledAt} timeZone={tz} />
                    </Link>
                    <span className="flex gap-1.5">
                      <StatusBadge tone={statusTone(a.status)} size="sm">{humanize(a.status)}</StatusBadge>
                      {a.result !== "pending" ? <StatusBadge tone={statusTone(a.result)} size="sm">{humanize(a.result)}</StatusBadge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No assessments linked to this application. Trade tests are paid by the employer or Venkat Sai, never the candidate.</p>
            )}
          </SectionCard>

          <SectionCard title="Offers and placement">
            {d.offers.length ? (
              <ul className="space-y-2">
                {d.offers.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {o.jobTitle} <span className="font-mono text-xs text-muted-foreground">{o.code}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {o.salaryMinor != null && o.salaryCurrency ? <MoneyText amountMinor={o.salaryMinor} currency={o.salaryCurrency} /> : "Salary not recorded"}
                        {o.salaryPeriod ? ` per ${o.salaryPeriod.replace(/ly$/, "")}` : ""}
                        {o.startDate ? <> · starts <DateText value={o.startDate} dateOnly /></> : null}
                      </p>
                      {o.declineReason ? <p className="text-xs text-muted-foreground">Declined: {o.declineReason}</p> : null}
                    </div>
                    <StatusBadge tone={statusTone(o.status)} size="sm">{OFFER_STATUS_LABELS[o.status]}</StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No offers yet. Employers issue offers from the Employer Portal.</p>
            )}
            {d.placement ? (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <KeyValueList
                  columns={2}
                  items={[
                    { label: "Placement", value: <span className="font-mono">{d.placement.code}</span> },
                    { label: "Status", value: humanize(d.placement.status) },
                    { label: "Joined on", value: d.placement.joinedOn ? <DateText value={d.placement.joinedOn} dateOnly /> : null },
                    { label: "Fee", value: d.placement.feeMinor != null && d.placement.feeCurrency ? <MoneyText amountMinor={d.placement.feeMinor} currency={d.placement.feeCurrency} /> : null },
                    {
                      label: "Mobilisation",
                      value: d.placement.mobilisationId ? (
                        <Link href={`/admin/mobilisation/${d.placement.mobilisationId}`} className="text-teal-strong underline-offset-4 hover:underline">
                          {d.placement.mobilisationStatus ? MOBILISATION_STATUS_LABELS[d.placement.mobilisationStatus] : "Open record"}
                        </Link>
                      ) : null,
                    },
                  ]}
                />
                {canManage && !d.placement.joinedOn && d.placement.status !== "cancelled" ? (
                  <StaffForm action={confirmJoinedFormAction} hidden={{ placementId: d.placement.id }} submitLabel="Confirm joining" fields={[{ name: "joinedOn", label: "Joined on", kind: "date", required: true }]} />
                ) : null}
                {canMobilise && !d.placement.mobilisationId && d.placement.status !== "cancelled" ? (
                  <StaffForm
                    action={startMobilisationFormAction}
                    hidden={{ placementId: d.placement.id }}
                    submitLabel="Start mobilisation"
                    successHref="/admin/mobilisation/{id}"
                    fields={[{ name: "destinationCountryCode", label: "Destination country", kind: "search-select", required: true, options: countries, defaultValue: d.placement.countryCode }]}
                  />
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          {d.answers.length ? (
            <SectionCard title="Screening answers">
              <dl className="space-y-3 text-sm">
                {d.answers.map((a, i) => (
                  <div key={a.questionId ?? i}>
                    <dt className="font-medium">
                      {a.question} {a.isFlagged ? <StatusBadge tone="warning" size="sm">Flagged</StatusBadge> : null}
                    </dt>
                    <dd className="text-muted-foreground">{answerText(a.answer)}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          ) : null}

          <SectionCard title="History">
            <Timeline
              label="Application history"
              timeZone={tz}
              items={d.history.map((h) => ({
                id: h.id,
                title: h.from ? `${h.from.name} → ${h.to.name}` : `Created in ${h.to.name}`,
                at: h.createdAt,
                actor: h.changedByName ? { name: h.changedByName, role: humanize(h.changedByType) } : { name: humanize(h.changedByType) },
                note: [h.note ? `Internal: ${h.note}` : null, h.candidateVisibleNote ? `To candidate: ${h.candidateVisibleNote}` : null].filter(Boolean).join(" · ") || undefined,
              }))}
            />
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Ownership">
            {canManage ? <AssignSelect action={assignOwnerAction} recordId={app.id} options={owners} current={app.assignedToUserId} label="Application owner" /> : <p className="text-sm text-muted-foreground">Owner changes need the recruitment management permission.</p>}
            <KeyValueList
              items={[
                { label: "Source", value: humanize(app.source) },
                { label: "Applied", value: <DateText value={app.createdAt} timeZone={tz} /> },
                { label: "Shared with employer", value: app.sharedWithEmployerAt ? <DateText value={app.sharedWithEmployerAt} timeZone={tz} /> : "Not shared" },
                {
                  label: "Partner submission",
                  value: d.partnerSubmission ? (
                    <Link href={`/admin/partners/submissions/${d.partnerSubmission.id}`} className="text-teal-strong underline-offset-4 hover:underline">
                      {d.partnerSubmission.code} · {d.partnerSubmission.partnerName ?? "Partner"}
                    </Link>
                  ) : null,
                },
              ]}
            />
          </SectionCard>

          <SectionCard title="Notes" description="Never shown to the candidate. Visibility controls whether the employer or the sourcing partner also sees a note.">
            {d.notes.length ? (
              <ul className="mb-4 space-y-3">
                {d.notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-border bg-surface-subtle/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        <span className="font-medium text-foreground">{n.authorName ?? "Former user"}</span> · {n.authorParty === "venkat_sai" ? "Venkat Sai" : humanize(n.authorParty)} · {NOTE_VISIBILITY_LABELS[n.visibility]}
                      </span>
                      {n.canEdit && canManage ? (
                        <ActionButton variant="ghost" action={deleteNoteAction.bind(null, { noteId: n.id })} confirm={{ title: "Delete this note?", confirmLabel: "Delete", destructive: true }}>
                          Delete
                        </ActionButton>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-line">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">No notes yet.</p>
            )}
            {canManage ? (
              <StaffForm
                action={addNoteFormAction}
                hidden={{ applicationId: app.id }}
                resetOnSuccess
                submitLabel="Add note"
                fields={[
                  { name: "body", label: "Note", kind: "textarea", required: true, rows: 3, maxLength: 5000 },
                  { name: "visibility", label: "Visible to", kind: "select", required: true, options: NOTE_VISIBILITY_OPTIONS.map((v) => ({ value: v, label: NOTE_VISIBILITY_LABELS[v] })), defaultValue: "staff_only" },
                ]}
              />
            ) : null}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ActionLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {children}
    </Link>
  );
}
