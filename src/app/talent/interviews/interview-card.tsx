import { CalendarDays, Download, ExternalLink, MapPin, Video } from "lucide-react";
import Link from "next/link";

import { enumLabel, intlLocale, type Translate } from "@/components/jobs/labels";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInTimeZone, isValidTimeZone } from "@/modules/recruitment/timezone";
import type { CandidateInterviewView } from "@/modules/recruitment/types";

import { InterviewResponse } from "./interview-response";

const RESPONSE_TONE = { pending: "warning", confirmed: "success", declined: "neutral", reschedule_requested: "info" } as const;
const STATUS_TONE = { scheduled: "info", rescheduled: "info", completed: "success", cancelled: "neutral", no_show: "danger" } as const;

/**
 * One interview for the candidate: when (in the interview's zone, and in the viewer's when different),
 * where / how to join, instructions, status, the candidate's response, a calendar file and the response
 * buttons while a response is still possible.
 */
export function InterviewCard({
  interview,
  t,
  locale,
  viewerTimeZone,
  showJob = true,
  headingLevel = "h3",
}: {
  interview: CandidateInterviewView;
  t: Translate;
  locale: string;
  viewerTimeZone: string;
  showJob?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const loc = intlLocale(locale);
  const zone = isValidTimeZone(interview.timezone) ? interview.timezone : viewerTimeZone;
  const when = formatInTimeZone(interview.scheduledStart, zone, loc);
  const local = zone !== viewerTimeZone && isValidTimeZone(viewerTimeZone) ? formatInTimeZone(interview.scheduledStart, viewerTimeZone, loc) : null;
  const cancelled = interview.status === "cancelled";
  const active = interview.status === "scheduled" || interview.status === "rescheduled";

  return (
    <article className={cn("space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5", cancelled && "bg-surface-subtle")} data-testid="interview-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Heading className="font-heading text-base font-semibold text-navy">{interview.roundName}</Heading>
          {showJob ? (
            <p className="text-sm text-muted-foreground">
              <Link href={`/talent/applications/${interview.applicationId}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                {interview.jobTitle}
              </Link>{" "}
              · {interview.employerName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={STATUS_TONE[interview.status] ?? "neutral"} size="sm">
            {enumLabel(t, "interviewStatus", interview.status)}
          </StatusBadge>
          {active ? (
            <StatusBadge tone={RESPONSE_TONE[interview.candidateResponse] ?? "neutral"} size="sm">
              {enumLabel(t, "interviewResponse", interview.candidateResponse)}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <dt className="sr-only">{t("interviews.when")}</dt>
            <dd className={cn("font-medium", cancelled && "line-through")}>
              <time dateTime={interview.scheduledStart.toISOString()}>{when}</time>
              <span className="block text-xs font-normal text-muted-foreground">{t("interviews.zone", { zone })}</span>
              {local ? <span className="block text-xs font-normal text-muted-foreground">{t("interviews.yourTime", { time: local })}</span> : null}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {interview.mode === "video" ? <Video aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <div>
            <dt className="sr-only">{t("interviews.where")}</dt>
            <dd>
              <span className="font-medium">{enumLabel(t, "interviewMode", interview.mode)}</span>
              {interview.location ? <span className="block text-muted-foreground">{interview.location}</span> : null}
              {interview.meetingUrl && active ? (
                <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-teal-strong underline-offset-2 hover:underline">
                  {t("interviews.joinLink")}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{t("detail.opensNewTab")}</span>
                </a>
              ) : null}
            </dd>
          </div>
        </div>
      </dl>

      {interview.candidateInstructions ? (
        <div className="rounded-lg bg-surface-subtle px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">{t("interviews.instructions")}</p>
          <p className="mt-1 whitespace-pre-line">{interview.candidateInstructions}</p>
        </div>
      ) : null}
      {cancelled && interview.cancellationReason ? <p className="text-sm text-muted-foreground">{t("interviews.cancelledReason", { reason: interview.cancellationReason })}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {interview.canRespond ? <InterviewResponse interviewId={interview.id} current={interview.candidateResponse} /> : <span />}
        {active ? (
          <Button asChild variant="ghost" size="sm">
            <a href={`/talent/interviews/${interview.id}/ics`} download>
              <Download aria-hidden="true" />
              {t("interviews.addToCalendar")}
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
