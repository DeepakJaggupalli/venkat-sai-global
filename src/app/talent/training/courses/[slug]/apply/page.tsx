import { CalendarX } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { BatchCard } from "@/components/training/batch-card";
import { FeePaymentNote } from "@/components/training/fee-payment-note";
import { batchCta, intlLocale, OPEN_ENROLMENT_STATUSES } from "@/components/training/training-rules";
import { getLocale, getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { isFeatureEnabled } from "@/modules/settings";
import { getPublicCourse, listCandidateEnrolments } from "@/modules/training/queries";
import { toIsoDate } from "@/modules/training/rules";

import { feePaymentInfo } from "../../../_lib/queries";
import { ApplyForm } from "./apply-form";
import { requireOnboardedCandidate } from "../../../../_lib/guard";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("apply.title") };
}

/** Enrolment flow for one batch: batch summary, fee and how to pay, contact-sharing consent and declaration. */
export default async function ApplyToBatchPage({ params, searchParams }: PageProps) {
  const { user, candidate } = await requireOnboardedCandidate();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [t, locale, course, enabled, payment] = await Promise.all([
    getT("talent-training"),
    getLocale(),
    getPublicCourse(slug),
    isFeatureEnabled("talent.training", { portal: "talent" }),
    feePaymentInfo(),
  ]);
  if (!course) notFound();

  const fmt = intlLocale(locale);
  const today = toIsoDate(new Date());
  const courseHref = `/talent/training/courses/${course.slug}`;
  const providerIsVenkatSai = course.provider.kind === "venkat_sai";
  const providerName = course.provider.kind === "institution" ? course.provider.name : t("provider.venkatSai");
  const batchId = sp(query, "batch");
  const batch = batchId ? course.batches.find((b) => b.id === batchId) : undefined;
  const breadcrumbs = [
    { label: t("talent.title"), href: "/talent/training" },
    { label: course.title, href: courseHref },
    { label: t("apply.title") },
  ];

  if (!batch) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("apply.title")} breadcrumbs={breadcrumbs} />
        <EmptyState
          icon={<CalendarX />}
          title={t("apply.batchUnavailableTitle")}
          description={t("apply.batchUnavailableDescription")}
          primaryAction={{ label: t("apply.chooseBatch"), href: `${courseHref}#batches` }}
        />
      </div>
    );
  }

  const enrolments = await listCandidateEnrolments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName });
  const existing = enrolments.find((e) => e.batchId === batch.id && OPEN_ENROLMENT_STATUSES.includes(e.status));
  const cta = batchCta(batch, today);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("apply.title")} description={t("apply.description", { course: course.title })} breadcrumbs={breadcrumbs} />

      <SectionCard title={t("apply.batchTitle")}>
        <p className="mb-3 text-sm text-muted-foreground">{t("detail.byProvider", { provider: providerName })}</p>
        <BatchCard t={t} batch={batch} today={today} locale={locale} fmtLocale={fmt} ctaHref="#apply" ctaMode="apply" enrolled={Boolean(existing)} />
      </SectionCard>

      <FeePaymentNote
        t={t}
        feeType={course.feeType}
        feeMinor={course.feeMinor}
        feeCurrency={course.feeCurrency}
        fmtLocale={fmt}
        providerIsVenkatSai={providerIsVenkatSai}
        providerName={providerName}
        onlinePayments={payment.onlinePayments}
        venkatSaiInstructions={payment.venkatSaiInstructions}
      />

      {existing ? (
        <Callout tone="info" title={t("apply.alreadyTitle")} action={{ label: t("apply.viewEnrolment"), href: `/talent/training/enrolments/${existing.id}` }}>
          {t("apply.alreadyBody", { status: t(`enrolmentStatus.${existing.status}`) })}
        </Callout>
      ) : !enabled ? (
        <Callout tone="warning" title={t("apply.disabledTitle")}>
          {t("apply.disabledBody")}
        </Callout>
      ) : cta === "apply" || cta === "waitlist" ? (
        <SectionCard id="apply" title={t("apply.formTitle")}>
          {cta === "waitlist" ? (
            <Callout tone="warning" title={t("apply.waitlistTitle")} className="mb-4">
              {t("apply.waitlistBody")}
            </Callout>
          ) : null}
          <ApplyForm batchId={batch.id} courseId={course.id} providerName={providerName} waitlist={cta === "waitlist"} />
        </SectionCard>
      ) : (
        <Callout tone="neutral" title={t("apply.closedTitle")} action={{ label: t("apply.chooseBatch"), href: `${courseHref}#batches` }}>
          {cta === "not_open" ? t("batch.notOpenYet") : t("batch.closed")}
        </Callout>
      )}
    </div>
  );
}
