import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { DataTable } from "@/components/shared/data-table";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressRing } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { FeePaymentNote } from "@/components/training/fee-payment-note";
import { attendanceValue, canWithdrawEnrolment, enrolmentTone, intlLocale, isFinalResult, joinPlace, regionName, resultTone } from "@/components/training/training-rules";
import { getLocale, getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { listPublishedScoresForEnrolment } from "@/modules/training/grading";
import { listCandidateEnrolments } from "@/modules/training/queries";

import { batchOrganizationId, feePaymentInfo } from "../../_lib/queries";
import { WithdrawButton } from "./withdraw-button";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("enrolment.title") };
}

/** One of the learner's enrolments: status, schedule, attendance, published scores, result, fee and withdrawal. */
export default async function EnrolmentPage({ params, searchParams }: PageProps) {
  const { user, candidate } = await requireCandidate();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [t, locale, enrolments] = await Promise.all([
    getT("talent-training"),
    getLocale(),
    listCandidateEnrolments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }),
  ]);
  // Scoped to the caller: only the candidate's own enrolments are looked up.
  const item = enrolments.find((e) => e.id === id);
  if (!item) notFound();

  const fmt = intlLocale(locale);
  const [scores, organizationId, payment] = await Promise.all([
    listPublishedScoresForEnrolment(item.id),
    item.feeStatus === "pending" ? batchOrganizationId(item.batchId) : Promise.resolve(null),
    item.feeStatus === "pending" ? feePaymentInfo() : Promise.resolve(null),
  ]);
  const attendance = attendanceValue(item.attendancePercent);
  const providerIsVenkatSai = item.feeStatus === "pending" && organizationId === null;
  const providerName = item.providerName === "Venkat Sai" && providerIsVenkatSai ? t("provider.venkatSai") : item.providerName;
  const place = item.batch.mode === "online" ? null : joinPlace([item.batch.venue, item.batch.city, regionName(item.batch.countryCode, locale)]);
  const justApplied = sp(query, "applied") === "1";
  const reason = item.statusReason ?? (item.batch.status === "cancelled" ? item.batch.cancellationReason : null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={item.batch.code}
        title={item.course.title}
        description={t("detail.byProvider", { provider: providerName })}
        status={
          <StatusBadge tone={enrolmentTone(item.status)} srPrefix={t("enrolment.statusLabel")}>
            {t(`enrolmentStatus.${item.status}`)}
          </StatusBadge>
        }
        breadcrumbs={[{ label: t("talent.title"), href: "/talent/training" }, { label: item.course.title }]}
        actions={canWithdrawEnrolment(item.status) ? <WithdrawButton enrolmentId={item.id} inProgress={item.status === "in_progress"} /> : undefined}
      />

      {justApplied ? (
        <Callout tone="success" title={item.status === "waitlisted" ? t("apply.successWaitlist") : t("apply.success")} live="polite">
          {t("enrolment.nextSteps")}
        </Callout>
      ) : null}
      {reason && ["rejected", "cancelled", "dropped"].includes(item.status) ? (
        <Callout tone="neutral" title={t("enrolment.reasonTitle")}>
          {reason}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <SectionCard title={t("enrolment.schedule")}>
            <KeyValueList
              columns={2}
              emptyText={t("common.notProvided")}
              items={[
                { key: "batch", label: t("enrolment.batch"), value: item.batch.title ?? item.batch.code },
                { key: "batchStatus", label: t("enrolment.batchStatus"), value: t(`batchStatus.${item.batch.status}`) },
                { key: "starts", label: t("enrolment.starts"), value: item.batch.startsOn ? <DateText value={item.batch.startsOn} dateOnly locale={fmt} /> : t("batch.datesTbc") },
                { key: "ends", label: t("enrolment.ends"), value: item.batch.endsOn ? <DateText value={item.batch.endsOn} dateOnly locale={fmt} /> : null },
                { key: "schedule", label: t("batch.schedule"), value: item.batch.schedule },
                { key: "mode", label: t("facts.mode"), value: t(`mode.${item.batch.mode}`) },
                { key: "venue", label: t("batch.venue"), value: place, fullWidth: true },
                { key: "applied", label: t("enrolment.appliedOn"), value: <DateText value={item.appliedAt} locale={fmt} timeZone={user.timezone ?? undefined} /> },
                { key: "confirmed", label: t("enrolment.confirmedOn"), value: item.confirmedAt ? <DateText value={item.confirmedAt} locale={fmt} timeZone={user.timezone ?? undefined} /> : null },
              ]}
            />
          </SectionCard>

          <SectionCard title={t("enrolment.results")} description={t("enrolment.resultsDescription")} flush={scores.length > 0}>
            {scores.length ? (
              <DataTable
                caption={t("enrolment.scoresCaption")}
                rows={scores}
                getRowId={(r) => r.assessment.id}
                columns={[
                  { id: "title", header: t("enrolment.assessment"), primary: true, cell: (r) => r.assessment.title },
                  { id: "type", header: t("enrolment.type"), cell: (r) => t(`courseAssessmentType.${r.assessment.type}`) },
                  {
                    id: "score",
                    header: t("enrolment.score"),
                    align: "right",
                    cell: (r) => (r.score?.isAbsent ? t("enrolment.absent") : r.score?.score !== null && r.score?.score !== undefined ? `${r.score.score} / ${r.assessment.maxScore}` : t("enrolment.notRecorded")),
                  },
                  {
                    id: "passed",
                    header: t("enrolment.outcome"),
                    cell: (r) =>
                      r.score?.passed === true ? (
                        <StatusBadge size="sm" tone="success">{t("resultStatus.passed")}</StatusBadge>
                      ) : r.score?.passed === false ? (
                        <StatusBadge size="sm" tone="danger">{t("resultStatus.failed")}</StatusBadge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ),
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t("enrolment.noScores")}</p>
            )}
          </SectionCard>

          {payment ? (
            <FeePaymentNote
              t={t}
              feeType={item.feeMinor !== null ? "fixed" : "on_request"}
              feeMinor={item.feeMinor}
              feeCurrency={item.feeCurrency}
              fmtLocale={fmt}
              providerIsVenkatSai={providerIsVenkatSai}
              providerName={providerName}
              onlinePayments={payment.onlinePayments}
              venkatSaiInstructions={payment.venkatSaiInstructions}
            />
          ) : null}
        </div>

        <aside className="space-y-4" aria-label={t("enrolment.summaryLabel")}>
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 text-center">
            {attendance === null ? (
              <p className="text-sm text-muted-foreground">{t("enrolment.noAttendance")}</p>
            ) : (
              <ProgressRing value={attendance} label={t("enrolment.attendance")} size="lg" tone="brand" />
            )}
            <p className="text-sm font-medium text-navy">{t("enrolment.attendance")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{t("enrolment.finalResult")}</p>
            {isFinalResult(item.resultStatus) ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={resultTone(item.resultStatus)}>{t(`resultStatus.${item.resultStatus}`)}</StatusBadge>
                {item.finalScore !== null ? <span className="text-sm text-foreground/80">{t("enrolment.finalScore", { score: Math.round(item.finalScore) })}</span> : null}
              </div>
            ) : (
              <p className="mt-1 text-sm text-foreground/80">{item.resultStatus === "not_applicable" ? t("enrolment.resultNotApplicable") : t("enrolment.resultPending")}</p>
            )}
            {item.course.certificationType !== "none" ? <p className="mt-3 text-xs text-muted-foreground">{t("enrolment.certificateHint")}</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
