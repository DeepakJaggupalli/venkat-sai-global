import { CalendarClock, ListChecks, MapPin } from "lucide-react";

import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CandidateSkillAssessmentItem } from "@/modules/training/types";

import type { Translate } from "./course-text";
import { assessmentStatusTone, joinPlace, resultTone } from "./training-rules";

/**
 * One Venkat Sai trade / skill test as the candidate sees it: when and where, what to bring, and — once
 * published — the result. Always labelled a Venkat Sai assessment with its procedure reference, never an
 * accredited certification (CONVENTIONS 15.4). Internal notes and evidence are never part of this data.
 */
export function AssessmentCard({ t, item, fmtLocale, viewerTimeZone, upcoming }: { t: Translate; item: CandidateSkillAssessmentItem; fmtLocale: string; viewerTimeZone: string; upcoming: boolean }) {
  const timeZone = item.centre?.timezone ?? viewerTimeZone;
  const place = item.centre ? joinPlace([item.centre.name, item.centre.addressLine1, item.centre.addressLine2, item.centre.city]) : item.location;
  const procedure = joinPlace([item.process, item.position, item.standardReference]);
  const published = item.result !== null && item.result !== "pending";

  return (
    <article data-testid="assessment-card" aria-labelledby={`asm-${item.id}`} className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {t("assessments.venkatSaiAssessment")} · {item.code}
          </p>
          <h3 id={`asm-${item.id}`} className="font-heading text-base font-semibold text-navy">
            {item.trade} <span className="font-normal text-muted-foreground">· {t(`assessmentType.${item.assessmentType}`)}</span>
          </h3>
        </div>
        {published && item.result ? (
          <StatusBadge size="sm" tone={resultTone(item.result)}>
            {t(`assessmentResult.${item.result}`)}
          </StatusBadge>
        ) : (
          <StatusBadge size="sm" tone={assessmentStatusTone(item.status)}>
            {t(`assessmentStatus.${item.status}`)}
          </StatusBadge>
        )}
      </div>

      <ul className="grid gap-1.5 text-sm text-foreground/80">
        <li className="flex items-start gap-2">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="sr-only">{t("assessments.when")}: </span>
            <DateText value={item.scheduledAt} mode="datetime" timeZone={timeZone} locale={fmtLocale} />
          </span>
        </li>
        {place ? (
          <li className="flex items-start gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="sr-only">{t("assessments.where")}: </span>
              {place}
            </span>
          </li>
        ) : null}
        {procedure ? (
          <li className="flex items-start gap-2">
            <ListChecks aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">{t("assessments.procedure")}: </span>
              {procedure}
            </span>
          </li>
        ) : null}
      </ul>

      {upcoming ? (
        <div className="rounded-lg bg-surface-subtle p-3 text-sm">
          <p className="font-medium text-navy">{t("assessments.whatToBring")}</p>
          <p className="mt-1 whitespace-pre-line text-foreground/80">{item.centre?.candidateInstructions?.trim() || t("assessments.whatToBringDefault")}</p>
        </div>
      ) : null}

      {item.status === "cancelled" && item.cancellationReason ? (
        <p className="text-sm text-foreground/80">
          <span className="text-muted-foreground">{t("assessments.cancelledReason")}: </span>
          {item.cancellationReason}
        </p>
      ) : null}

      {published ? (
        <KeyValueList
          dense
          columns={2}
          emptyText={t("common.notProvided")}
          items={[
            { key: "score", label: t("assessments.score"), value: item.score !== null ? (item.maxScore !== null ? `${item.score} / ${item.maxScore}` : String(item.score)) : null },
            { key: "attempt", label: t("assessments.attempt"), value: String(item.attemptNumber) },
            ...(item.remarks ? [{ key: "remarks", label: t("assessments.remarks"), value: <span className="whitespace-pre-line">{item.remarks}</span>, fullWidth: true }] : []),
            ...(item.retestAvailableFrom && (item.result === "fail" || item.result === "retest")
              ? [{ key: "retest", label: t("assessments.retestFrom"), value: <DateText value={item.retestAvailableFrom} dateOnly locale={fmtLocale} /> }]
              : []),
          ]}
        />
      ) : item.status === "completed" ? (
        <p className="text-sm text-muted-foreground">{t("assessments.resultAwaited")}</p>
      ) : null}
    </article>
  );
}
