import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { asStaff } from "@/modules/recruitment/actors";
import { INTERVIEW_MODE_LABELS, INTERVIEW_OUTCOME_OPTIONS, RECOMMENDATION_LABELS, RECOMMENDATION_OPTIONS } from "@/modules/recruitment/constants";
import { getInterview } from "@/modules/recruitment/queries";
import { formatInTimeZone, utcToZonedLocal } from "@/modules/recruitment/timezone";

import { isUuid, optionsFrom, orNotFound, staffTimeZone } from "../../pipeline/_shared/server";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { cancelInterviewFormAction, completeInterviewFormAction, interviewFeedbackFormAction, rescheduleInterviewFormAction } from "../actions";

export const metadata: Metadata = { title: "Interview" };

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["recruitment.view", "recruitment.manage"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const i = await orNotFound(getInterview(asStaff(staff), id));
  const tz = staffTimeZone(staff);
  const canManage = staffCan(staff, "recruitment.manage");
  const open = i.status === "scheduled" || i.status === "rescheduled";
  const durationMinutes = i.scheduledEnd ? Math.max(5, Math.round((i.scheduledEnd.getTime() - i.scheduledStart.getTime()) / 60000)) : 60;
  const ownFeedback = i.feedback.find((f) => f.authorUserId === staff.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${i.roundName}: ${i.candidateName}`}
        eyebrow={<span className="font-mono">{i.code}</span>}
        status={<StatusBadge tone={statusTone(i.status)}>{humanize(i.status)}</StatusBadge>}
        description={`${i.jobTitle} · ${INTERVIEW_MODE_LABELS[i.mode]} · conducted by ${i.conductedBy === "venkat_sai" ? "Venkat Sai" : "the employer"}`}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Interviews", href: "/admin/interviews" }, { label: i.code }]}
        actions={
          canManage && open ? (
            <ReasonDialog action={cancelInterviewFormAction} hidden={{ interviewId: i.id }} triggerLabel="Cancel interview" title="Cancel this interview?" description="The candidate and panel are notified with the reason." confirmLabel="Cancel interview" destructive />
          ) : undefined
        }
      />
      {i.status === "cancelled" && i.cancellationReason ? <Callout tone="warning" title="Cancelled">{i.cancellationReason}</Callout> : null}
      {i.candidateResponse === "reschedule_requested" || i.candidateResponse === "declined" ? (
        <Callout tone="warning" title={i.candidateResponse === "declined" ? "The candidate declined" : "The candidate asked to reschedule"}>
          {i.candidateResponseNote ?? "No note was added."}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Details">
            <KeyValueList
              columns={2}
              items={[
                { label: "Starts", value: `${formatInTimeZone(i.scheduledStart, i.timezone)} (${i.timezone})` },
                { label: "Your time", value: <DateText value={i.scheduledStart} mode="datetime" timeZone={tz} /> },
                { label: "Location", value: i.location },
                { label: "Meeting link", value: i.meetingUrl ? <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="break-all text-teal-strong underline underline-offset-4">{i.meetingUrl}</a> : null },
                { label: "Candidate response", value: humanize(i.candidateResponse) },
                { label: "Outcome", value: humanize(i.outcome) },
                { label: "Instructions to the candidate", value: i.candidateInstructions, fullWidth: true },
                { label: "Panel", value: i.participants.length ? i.participants.map((p) => `${p.name} (${humanize(p.role)})`).join(", ") : null, fullWidth: true },
              ]}
            />
            <p className="mt-4 text-sm">
              <Link href={`/admin/pipeline/${i.applicationId}`} className="text-teal-strong underline-offset-4 hover:underline">
                Open application {i.applicationCode}
              </Link>
            </p>
          </SectionCard>

          <SectionCard title="Feedback" description="Visible to Venkat Sai staff; employers see their own organisation's feedback. Never shown to candidates or partners.">
            {i.feedback.length ? (
              <ul className="space-y-3">
                {i.feedback.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">
                      {RECOMMENDATION_LABELS[f.recommendation]}
                      {f.rating ? ` · ${f.rating}/5` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.authorName ?? "Panel member"} · {f.authorOrganizationId ? "Employer" : "Venkat Sai"} · <DateText value={f.updatedAt} timeZone={tz} />
                    </p>
                    {f.scorecard.length ? (
                      <ul className="mt-2 list-disc pl-5 text-xs">
                        {f.scorecard.map((s, idx) => (
                          <li key={idx}>
                            {s.criterion}: {s.score}/{s.maxScore}
                            {s.comment ? ` – ${s.comment}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {f.strengths ? <p className="mt-1">Strengths: {f.strengths}</p> : null}
                    {f.concerns ? <p className="mt-1">Concerns: {f.concerns}</p> : null}
                    {f.notes ? <p className="mt-1 text-muted-foreground">{f.notes}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No feedback yet.</p>
            )}
            {canManage ? (
              <div className="mt-5 border-t border-border pt-5">
                <h3 className="mb-3 font-heading text-sm font-semibold">{ownFeedback ? "Update your feedback" : "Add your feedback"}</h3>
                <StaffForm
                  action={interviewFeedbackFormAction}
                  hidden={{ interviewId: i.id }}
                  columns={2}
                  submitLabel="Save feedback"
                  fields={[
                    { name: "recommendation", label: "Recommendation", kind: "select", required: true, options: RECOMMENDATION_OPTIONS.map((r) => ({ value: r, label: RECOMMENDATION_LABELS[r] })), defaultValue: ownFeedback?.recommendation },
                    { name: "rating", label: "Rating (1–5)", kind: "number", optional: true, min: 1, max: 5, defaultValue: ownFeedback?.rating },
                    { name: "strengths", label: "Strengths", kind: "textarea", optional: true, rows: 2, defaultValue: ownFeedback?.strengths },
                    { name: "concerns", label: "Concerns", kind: "textarea", optional: true, rows: 2, defaultValue: ownFeedback?.concerns },
                    { name: "notes", label: "Notes", kind: "textarea", optional: true, rows: 2, defaultValue: ownFeedback?.notes },
                  ]}
                />
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {canManage && open ? (
            <SectionCard title="Record the outcome">
              <StaffForm
                action={completeInterviewFormAction}
                hidden={{ interviewId: i.id }}
                submitLabel="Save outcome"
                fields={[
                  { name: "status", label: "Attendance", kind: "select", required: true, options: [{ value: "completed", label: "Held" }, { value: "no_show", label: "Candidate did not attend" }], defaultValue: "completed" },
                  { name: "outcome", label: "Outcome", kind: "select", required: true, options: optionsFrom(INTERVIEW_OUTCOME_OPTIONS), defaultValue: "pending" },
                ]}
              />
            </SectionCard>
          ) : null}
          {canManage && open ? (
            <SectionCard title="Reschedule" description="The candidate and panel are notified.">
              <StaffForm
                action={rescheduleInterviewFormAction}
                hidden={{ interviewId: i.id }}
                submitLabel="Reschedule"
                fields={[
                  { name: "startsAtLocal", label: "New date and time", kind: "datetime-local", required: true, defaultValue: utcToZonedLocal(i.scheduledStart, i.timezone).slice(0, 16) },
                  { name: "timezone", label: "Time zone", required: true, defaultValue: i.timezone },
                  { name: "durationMinutes", label: "Duration (minutes)", kind: "number", optional: true, min: 5, max: 720, defaultValue: durationMinutes },
                  { name: "location", label: "Location", optional: true, defaultValue: i.location },
                  { name: "meetingUrl", label: "Meeting link", kind: "url", optional: true, defaultValue: i.meetingUrl },
                  { name: "reason", label: "Reason", kind: "textarea", optional: true, rows: 2 },
                ]}
              />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
