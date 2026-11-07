"use client";

import { CalendarClock, ExternalLink, MapPin, Video } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { INTERVIEW_MODE_LABELS, RECOMMENDATION_LABELS } from "@/modules/recruitment/constants";
import { formatInTimeZone, utcToZonedLocal } from "@/modules/recruitment/timezone";
import type { InterviewView } from "@/modules/recruitment/types";

import { CancelInterviewButton, CompleteInterviewDialog, FeedbackDialog } from "./interview-actions";
import { RescheduleInterviewDialog } from "./interview-forms";
import { CANDIDATE_RESPONSE_LABELS, INTERVIEW_OUTCOME_LABELS, INTERVIEW_STATUS_LABELS, interviewStatusTone, labelFor } from "./labels";

/** One interview with its actions (reschedule, cancel, outcome, feedback) for the Employer Portal. */
export function InterviewCard({
  interview,
  viewerTimeZone,
  timeZones,
  meUserId,
  canManage,
  showCandidate = false,
}: {
  interview: InterviewView;
  viewerTimeZone: string;
  timeZones: SelectOption[];
  meUserId: string;
  canManage: boolean;
  showCandidate?: boolean;
}) {
  const start = new Date(interview.scheduledStart);
  const end = interview.scheduledEnd ? new Date(interview.scheduledEnd) : null;
  const open = interview.status === "scheduled" || interview.status === "rescheduled";
  const employerRun = interview.conductedBy === "employer";
  const mine = interview.feedback.find((f) => f.authorUserId === meUserId) ?? null;
  const durationMinutes = end ? Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)) : 60;
  const sameZone = interview.timezone === viewerTimeZone;

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4" data-testid="interview-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-heading text-sm font-semibold">
            {interview.roundName} <span className="font-normal text-muted-foreground">· round {interview.roundNumber}</span>
          </h3>
          {showCandidate ? (
            <p className="text-sm">
              <Link href={`/employer/pipeline/${interview.jobId}?application=${interview.applicationId}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
                {interview.candidateName}
              </Link>{" "}
              <span className="text-muted-foreground">· {interview.jobTitle}</span>
            </p>
          ) : null}
          <p className="flex items-center gap-1.5 text-sm">
            <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
            <span>{formatInTimeZone(start, interview.timezone)}</span>
          </p>
          {!sameZone ? <p className="pl-5.5 text-xs text-muted-foreground">Your time: {formatInTimeZone(start, viewerTimeZone)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={interviewStatusTone(interview.status)} size="sm">
            {labelFor(INTERVIEW_STATUS_LABELS, interview.status)}
          </StatusBadge>
          {open ? (
            <StatusBadge tone={interview.candidateResponse === "confirmed" ? "success" : interview.candidateResponse === "pending" ? "neutral" : "warning"} size="sm">
              {labelFor(CANDIDATE_RESPONSE_LABELS, interview.candidateResponse)}
            </StatusBadge>
          ) : null}
          {interview.status === "completed" ? (
            <StatusBadge tone={interview.outcome === "passed" ? "success" : interview.outcome === "failed" ? "danger" : "neutral"} size="sm">
              {labelFor(INTERVIEW_OUTCOME_LABELS, interview.outcome)}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <ul className="space-y-1 text-sm text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Video aria-hidden className="size-4" />
          {INTERVIEW_MODE_LABELS[interview.mode] ?? interview.mode}
          {!employerRun ? " · run by Venkat Sai" : ""}
        </li>
        {interview.location ? (
          <li className="flex items-center gap-1.5">
            <MapPin aria-hidden className="size-4" />
            {interview.location}
          </li>
        ) : null}
        {interview.meetingUrl ? (
          <li>
            <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-strong underline-offset-4 hover:underline">
              Join meeting <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ) : null}
        {interview.participants.length ? <li>Panel: {interview.participants.map((p) => p.name).join(", ")}</li> : null}
        {interview.candidateResponseNote ? <li>Candidate&apos;s note: {interview.candidateResponseNote}</li> : null}
        {interview.cancellationReason ? <li>Cancelled: {interview.cancellationReason}</li> : null}
      </ul>

      {interview.feedback.length ? (
        <div className="space-y-2 rounded-lg bg-surface-subtle p-3">
          <p className="text-xs font-medium text-muted-foreground">Feedback (internal)</p>
          {interview.feedback.map((f) => (
            <div key={f.id} className="text-sm">
              <p>
                <span className="font-medium">{f.authorName ?? "Team member"}</span>: {RECOMMENDATION_LABELS[f.recommendation] ?? f.recommendation}
                {f.rating ? ` · ${f.rating}/5` : ""}
              </p>
              {f.strengths ? <p className="text-muted-foreground">Strengths: {f.strengths}</p> : null}
              {f.concerns ? <p className="text-muted-foreground">Concerns: {f.concerns}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {canManage && employerRun ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {open ? (
            <>
              <RescheduleInterviewDialog
                timeZones={timeZones}
                defaults={{
                  interviewId: interview.id,
                  startsAtLocal: utcToZonedLocal(start, interview.timezone),
                  timezone: interview.timezone,
                  durationMinutes,
                  location: interview.location,
                  meetingUrl: interview.meetingUrl,
                  candidateInstructions: interview.candidateInstructions,
                }}
              />
              <CompleteInterviewDialog interviewId={interview.id} />
              <CancelInterviewButton interviewId={interview.id} />
            </>
          ) : null}
          {interview.status !== "cancelled" ? <FeedbackDialog interviewId={interview.id} existing={mine} /> : null}
        </div>
      ) : canManage && interview.status === "completed" ? (
        <div className="border-t pt-3">
          <FeedbackDialog interviewId={interview.id} existing={mine} />
        </div>
      ) : null}
    </article>
  );
}
