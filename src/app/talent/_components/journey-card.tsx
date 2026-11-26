import { Check, MessageSquareQuote, Route } from "lucide-react";
import Link from "next/link";

import { EmptyState, PillLink, SectionCard } from "@/components/dashboard";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { CV_SUBMISSION_STATUS_TONE } from "@/modules/operations/cv-submission-schemas";
import { cn } from "@/lib/utils";

import { CV_SUBMISSION_JOURNEY, journeyPosition } from "../_lib/dashboard";
import type { LinkedCvSubmission } from "../_lib/dashboard-queries";

export type JourneyCardLabels = {
  title: string;
  description: string;
  stage: (status: CvSubmissionStatus) => string;
  reference: (code: string) => string;
  forTitle: (title: string) => string;
  updated: (date: string) => string;
  step: (current: number, total: number) => string;
  note: string;
  onHold: string;
  notSuitable: string;
  others: (count: number) => string;
  check: string;
  update: string;
  emptyTitle: string;
  emptyDescription: string;
  verifyHint: string;
  verify: string;
};

export type JourneyCardProps = {
  /** CVs linked to this account by its verified phone number, latest first. */
  submissions: readonly LinkedCvSubmission[];
  /** False when the account has no verified phone number (nothing can be linked yet). */
  phoneVerified: boolean;
  labels: JourneyCardLabels;
  formatDate: (value: Date) => string;
  className?: string;
};

/**
 * "My CV and job journey": the latest website CV of this job seeker (matched by verified phone number) on the
 * placement journey received → contacted → trade test → selected → medical → visa → ticket → departed, with the note
 * staff wrote for them. Empty state: send a CV, check its status, or verify the phone number to link one.
 */
export function JourneyCard({ submissions, phoneVerified, labels, formatDate, className }: JourneyCardProps) {
  const latest = submissions[0];
  if (!latest) {
    return (
      <SectionCard title={labels.title} description={labels.description} icon={Route} className={className}>
        <EmptyState
          size="sm"
          icon={Route}
          title={labels.emptyTitle}
          description={labels.emptyDescription}
          action={{ label: labels.update, href: "/send-cv" }}
          secondaryAction={{ label: labels.check, href: "/status" }}
        />
        {!phoneVerified ? (
          <p className="mt-2 rounded-xl bg-surface-subtle px-4 py-3 text-sm text-pretty text-muted-foreground">
            {labels.verifyHint}{" "}
            <Link href="/account#contact" className="font-semibold text-accent-text underline underline-offset-2">
              {labels.verify}
            </Link>
          </p>
        ) : null}
      </SectionCard>
    );
  }

  const position = journeyPosition(latest.status);
  const others = submissions.length - 1;
  return (
    <SectionCard
      title={labels.title}
      description={labels.description}
      icon={Route}
      action={{ label: labels.check, href: `/status?ref=${encodeURIComponent(latest.code)}` }}
      className={className}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-heading text-lg leading-snug font-bold text-foreground">{latest.tradeLabel}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{labels.reference(latest.code)}</span>
            {latest.requirementTitle ? <> · {labels.forTitle(latest.requirementTitle)}</> : null}
          </p>
          <p className="text-xs text-muted-foreground">{labels.updated(formatDate(latest.updatedAt))}</p>
        </div>
        <StatusBadge tone={CV_SUBMISSION_STATUS_TONE[latest.status]}>
          {labels.stage(latest.status)}
          {position.side === null ? <span className="font-normal"> · {labels.step(position.index + 1, position.total)}</span> : null}
        </StatusBadge>
      </div>

      <ol aria-label={labels.title} className="mt-5 grid grid-cols-4 gap-y-4 sm:grid-cols-8">
        {CV_SUBMISSION_JOURNEY.map((stage, i) => {
          const done = position.side === null && i < position.index;
          const current = position.side === null && i === position.index;
          return (
            <li key={stage} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-2 text-center">
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn("absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2", done || current ? "bg-accent-fill" : "bg-border", i % 4 === 0 && "max-sm:hidden")}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-[1] flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums",
                  done && "border-accent-fill bg-accent-fill text-white",
                  current && "border-foreground bg-white text-foreground shadow-[0_0_0_4px_var(--color-accent-soft,#e0f2fe)]",
                  !done && !current && "border-border bg-white text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("px-1 text-[12px] leading-tight text-pretty", current ? "font-bold text-foreground" : done ? "font-medium text-foreground/80" : "text-muted-foreground")}>
                {labels.stage(stage)}
                <span className="sr-only">{done ? " (done)" : current ? " (now)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {position.side ? (
        <p className="mt-4 rounded-xl bg-surface-subtle px-4 py-3 text-sm text-pretty text-foreground">{position.side === "on_hold" ? labels.onHold : labels.notSuitable}</p>
      ) : null}

      {latest.candidateNote ? (
        <figure className="mt-4 flex gap-3 rounded-xl border border-accent-fill/30 bg-accent-soft/50 px-4 py-3">
          <MessageSquareQuote aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-text" />
          <div className="min-w-0">
            <figcaption className="text-xs font-semibold tracking-wide text-accent-text uppercase">{labels.note}</figcaption>
            <blockquote className="mt-0.5 text-sm text-pretty break-words text-foreground">{latest.candidateNote}</blockquote>
          </div>
        </figure>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PillLink action={{ label: labels.update, href: "/send-cv", variant: "secondary" }} arrow={false} />
        {others > 0 ? <span className="text-sm text-muted-foreground">{labels.others(others)}</span> : null}
      </div>
    </SectionCard>
  );
}
