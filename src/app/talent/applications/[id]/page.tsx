import { FileText, Gift, HelpCircle, ListChecks, Plane } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FileLink } from "@/components/files";
import { enumLabel, intlLocale } from "@/components/jobs/labels";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { getLocale, getT } from "@/i18n/server";
import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { requireCandidate } from "@/modules/candidates/guard";
import { getFiles, toFileSummary } from "@/modules/files";
import { getApplicationForCandidate } from "@/modules/recruitment/queries";
import { asCandidate } from "@/modules/recruitment/service";
import type { CandidateApplicationDetail } from "@/modules/recruitment/types";

import { InterviewCard } from "../../interviews/interview-card";
import { stageDescription, stageLabel, stageTone } from "../_lib/stage";
import { ChecklistSubmit, OfferResponse, WithdrawApplicationButton } from "../application-controls";

type PageProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string): Promise<{ session: Awaited<ReturnType<typeof requireCandidate>>; app: CandidateApplicationDetail }> {
  const session = await requireCandidate();
  if (!UUID.test(id)) notFound();
  try {
    return { session, app: await getApplicationForCandidate(asCandidate(session), id) };
  } catch (error) {
    if (error instanceof ActionError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const t = await getT("talent-jobs");
  if (!UUID.test(id)) return { title: t("applications.title") };
  try {
    const { app } = await load(id);
    return { title: t("applications.detailMeta", { title: app.job.title }) };
  } catch {
    return { title: t("applications.title") };
  }
}

function answerText(value: unknown, t: (k: string) => string): string {
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

/**
 * One application as the candidate sees it: current stage (their language), the candidate-visible
 * timeline (stage labels and notes written for them only — never internal notes), interviews, offers to
 * accept or decline, requested documents, what they sent, withdrawal and help.
 */
export default async function ApplicationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { session, app } = await load(id);
  const [t, locale] = await Promise.all([getT("talent-jobs"), getLocale()]);
  const timeZone = session.user.timezone ?? env().DEFAULT_TIMEZONE;
  const loc = intlLocale(locale);
  const fileIds = [app.resumeFileId, ...app.offers.flatMap((o) => [o.offerFileId, o.signedOfferFileId])].filter((v): v is string => !!v);
  const files = new Map((await getFiles(fileIds)).map((f) => [f.id, toFileSummary(f)]));
  const resume = app.resumeFileId ? files.get(app.resumeFileId) : undefined;
  const openOffers = app.offers.filter((o) => o.canRespond);
  const requested = app.mobilisation?.checklist.filter((c) => c.responsibleParty === "candidate") ?? [];
  const description = stageDescription(app.stage, locale);
  const helpHref = `/talent/support?application=${encodeURIComponent(app.code)}`;

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: t("applications.title"), href: "/talent/applications" }, { label: app.job.title }]} />
      <PageHeader
        eyebrow={<span className="font-mono">{app.code}</span>}
        title={app.job.title}
        description={app.job.employerName}
        status={
          <StatusBadge tone={stageTone(app.stage)} data-testid="application-stage">
            {stageLabel(app.stage, locale)}
          </StatusBadge>
        }
        meta={
          <span className="text-sm text-muted-foreground">
            {t("applications.appliedOn", { date: formatDate(app.submittedAt, { timeZone, locale: loc }) })}
          </span>
        }
        actions={[{ label: t("applications.viewJob"), href: `/talent/jobs/${app.job.slug}`, variant: "outline" }]}
      />

      <Callout tone={app.stage.isFinal ? "neutral" : "brand"} title={t("applications.currentStage", { stage: stageLabel(app.stage, locale) })}>
        {description ?? t("applications.stageFallback")}
      </Callout>

      {openOffers.length ? (
        <SectionCard title={t("offers.title")} icon={<Gift aria-hidden="true" />} headingLevel="h2">
          <ul className="space-y-4">
            {openOffers.map((offer) => {
              const letter = offer.offerFileId ? files.get(offer.offerFileId) : undefined;
              return (
                <li key={offer.id} className="space-y-3 rounded-lg border p-4" data-testid="offer">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("offers.salary")}</dt>
                      <dd className="font-medium">
                        {offer.salaryMinor !== null && offer.salaryCurrency
                          ? `${formatMoney(offer.salaryMinor, offer.salaryCurrency, loc)}${offer.salaryPeriod ? ` · ${enumLabel(t, "salaryPeriod", offer.salaryPeriod)}` : ""}`
                          : t("offers.seeLetter")}
                      </dd>
                    </div>
                    {offer.startDate ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("offers.startDate")}</dt>
                        <dd className="font-medium">{formatDate(offer.startDate, { timeZone: "UTC", locale: loc })}</dd>
                      </div>
                    ) : null}
                    {offer.workLocation ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("offers.location")}</dt>
                        <dd className="font-medium">{offer.workLocation}</dd>
                      </div>
                    ) : null}
                    {offer.contractDurationMonths ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("terms.contract")}</dt>
                        <dd className="font-medium">{t("terms.months", { count: offer.contractDurationMonths })}</dd>
                      </div>
                    ) : null}
                    {offer.expiresAt ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("offers.respondBy")}</dt>
                        <dd className="font-medium text-warning-strong">{formatDate(offer.expiresAt, { timeZone, locale: loc })}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {offer.benefits ? <p className="text-sm whitespace-pre-line">{offer.benefits}</p> : null}
                  {letter ? <FileLink file={letter} /> : null}
                  <p className="text-xs text-muted-foreground">{t("offers.neverPay")}</p>
                  <OfferResponse offerId={offer.id} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}

      {app.interviews.length ? (
        <section aria-labelledby="app-interviews" className="space-y-3">
          <h2 id="app-interviews" className="font-heading text-lg font-semibold text-navy">
            {t("interviews.title")}
          </h2>
          <ul className="grid gap-3 xl:grid-cols-2">
            {app.interviews.map((i) => (
              <li key={i.id}>
                <InterviewCard interview={i} t={t} locale={locale} viewerTimeZone={timeZone} showJob={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {app.mobilisation ? (
        <SectionCard title={t("documents.title")} description={t("documents.description")} icon={<Plane aria-hidden="true" />} headingLevel="h2">
          <div className="space-y-4">
            <p className="text-sm">
              <span className="text-muted-foreground">{t("documents.progress")}: </span>
              <span className="font-medium">{app.mobilisation.statusLabel}</span>
            </p>
            {app.mobilisation.candidateInstructions ? <p className="rounded-lg bg-surface-subtle px-3 py-2 text-sm whitespace-pre-line">{app.mobilisation.candidateInstructions}</p> : null}
            {app.mobilisation.travelDate ? <p className="text-sm">{t("documents.travelDate", { date: formatDate(app.mobilisation.travelDate, { timeZone: "UTC", locale: loc }) })}</p> : null}
            {requested.length ? (
              <ul className="divide-y rounded-lg border">
                {requested.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">
                        {item.item}
                        {item.isRequired ? <span className="ms-1 text-xs font-normal text-muted-foreground">({t("detail.required")})</span> : null}
                      </p>
                      {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                      {item.dueDate ? <p className="text-xs text-muted-foreground">{t("documents.due", { date: formatDate(item.dueDate, { timeZone: "UTC", locale: loc }) })}</p> : null}
                      {item.status === "rejected" && item.rejectionReason ? <p className="text-xs text-danger-strong">{t("documents.rejected", { reason: item.rejectionReason })}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={item.status === "verified" ? "success" : item.status === "rejected" ? "danger" : item.status === "submitted" ? "info" : "neutral"} size="sm">
                        {enumLabel(t, "checklistStatus", item.status)}
                      </StatusBadge>
                      {item.status === "pending" || item.status === "rejected" ? <ChecklistSubmit itemId={item.id} itemName={item.item} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("documents.none")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("documents.pdot")}</p>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t("applications.timeline")} icon={<ListChecks aria-hidden="true" />} headingLevel="h2">
          <Timeline
            label={t("applications.timeline")}
            timeFormat="absolute"
            timeZone={timeZone}
            items={[...app.history].reverse().map((h, i) => ({ id: `${h.stage.key}-${i}`, title: stageLabel(h.stage, locale), at: h.at, note: h.note ?? undefined, tone: stageTone(h.stage) }))}
            emptyTitle={t("applications.timelineEmpty")}
          />
        </SectionCard>

        <SectionCard title={t("applications.whatYouSent")} icon={<FileText aria-hidden="true" />} headingLevel="h2">
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("apply.resumeTitle")}</p>
              {resume ? <FileLink file={resume} /> : <p>{t("applications.noResume")}</p>}
            </div>
            {app.expectedSalary ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("apply.expectedSalary")}</p>
                <p className="font-medium">
                  {formatMoney(app.expectedSalary.amountMinor, app.expectedSalary.currency, loc)} · {enumLabel(t, "salaryPeriod", app.expectedSalary.period)}
                </p>
              </div>
            ) : null}
            {app.answers.length ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("apply.questionsTitle")}</p>
                <dl className="mt-1 space-y-2">
                  {app.answers.map((a, i) => (
                    <div key={i}>
                      <dt className="font-medium">{a.question}</dt>
                      <dd className="text-muted-foreground">{answerText(a.answer, t)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {app.coverLetter ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("apply.coverLetter")}</p>
                <p className="whitespace-pre-line">{app.coverLetter}</p>
              </div>
            ) : null}
            {app.withdrawnAt ? (
              <p className="text-muted-foreground">
                {t("applications.withdrawnOn", { date: formatDate(app.withdrawnAt, { timeZone, locale: loc }) })}
                {app.withdrawalReason ? ` · ${app.withdrawalReason}` : ""}
              </p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <HelpCircle aria-hidden="true" className="size-4 text-teal-strong" />
          <span>
            {t("applications.helpText")}{" "}
            <Link href={helpHref} className="font-medium text-teal-strong underline underline-offset-2">
              {t("applications.helpLink")}
            </Link>
          </span>
        </p>
        {app.canWithdraw ? <WithdrawApplicationButton applicationId={app.id} jobTitle={app.job.title} /> : null}
      </div>
    </div>
  );
}
