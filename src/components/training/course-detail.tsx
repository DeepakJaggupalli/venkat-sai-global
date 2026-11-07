import { CheckCircle2, Clock, Info, Languages, MonitorSmartphone, Wallet } from "lucide-react";

import { OrgAvatar } from "@/components/shared/avatars";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { SafeHtml } from "@/components/shared/safe-html";
import { SectionCard } from "@/components/shared/section-card";
import { getLocale, getT } from "@/i18n/server";
import type { PublicCourseDetail } from "@/modules/training/types";

import { BatchCard, type BatchCtaMode } from "./batch-card";
import { CertificationNote } from "./certification-note";
import { durationText, FeeText } from "./course-text";
import { intlLocale, languageName } from "./training-rules";

type CourseDetailProps = {
  course: PublicCourseDetail;
  /** ISO date of today (batch deadlines). */
  today: string;
  /** Where a batch's call to action points (enrolment page, or sign-in that returns to it). */
  batchHref: (batchId: string) => string;
  ctaMode: BatchCtaMode;
  /** Batches the signed-in candidate already applied to (open enrolments). */
  enrolledBatchIds?: readonly string[];
};

/**
 * Course page body shared by the public site and the People Portal: overview, syllabus, eligibility,
 * outcomes and batches, with a facts panel (provider, mode, duration, languages, fee, certificate).
 */
export async function CourseDetail({ course, today, batchHref, ctaMode, enrolledBatchIds = [] }: CourseDetailProps) {
  const [t, locale] = await Promise.all([getT("talent-training"), getLocale()]);
  const fmt = intlLocale(locale);
  const duration = durationText(t, course);
  const providerName = course.provider.kind === "institution" ? course.provider.name : t("provider.venkatSai");
  const modules = [...course.modules].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        <SectionCard title={t("detail.overview")}>
          {course.descriptionHtml ? (
            <SafeHtml html={course.descriptionHtml} />
          ) : course.summary ? (
            <p className="text-sm text-foreground/80">{course.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noDescription")}</p>
          )}
        </SectionCard>

        <SectionCard title={t("detail.syllabus")} description={modules.length ? t("detail.moduleCount", { count: modules.length }) : undefined}>
          {modules.length ? (
            <ol className="space-y-3" data-testid="course-modules">
              {modules.map((m, i) => (
                <li key={m.id} className="flex gap-3">
                  <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-xs font-semibold text-teal-strong">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-navy">
                      <span className="sr-only">{t("detail.moduleNumber", { number: i + 1 })}: </span>
                      {m.title}
                      {m.durationHours ? <span className="ml-2 text-sm font-normal text-muted-foreground">{t("duration.hours", { count: m.durationHours })}</span> : null}
                    </p>
                    {m.description ? <p className="mt-0.5 text-sm text-pretty text-foreground/80">{m.description}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noSyllabus")}</p>
          )}
        </SectionCard>

        {course.eligibility || course.prerequisites ? (
          <SectionCard title={t("detail.eligibility")}>
            <KeyValueList
              items={[
                ...(course.eligibility ? [{ key: "eligibility", label: t("detail.whoCanApply"), value: <span className="whitespace-pre-line">{course.eligibility}</span> }] : []),
                ...(course.prerequisites ? [{ key: "prerequisites", label: t("detail.prerequisites"), value: <span className="whitespace-pre-line">{course.prerequisites}</span> }] : []),
              ]}
            />
          </SectionCard>
        ) : null}

        {course.outcomes.length ? (
          <SectionCard title={t("detail.outcomes")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {course.outcomes.map((o) => (
                <li key={o} className="flex gap-2 text-sm text-foreground/80">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-strong" />
                  {o}
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard id="batches" title={t("detail.batches")} description={t("detail.batchesDescription")}>
          {course.batches.length ? (
            <div className="space-y-3">
              {course.batches.map((b) => (
                <BatchCard
                  key={b.id}
                  t={t}
                  batch={b}
                  today={today}
                  locale={locale}
                  fmtLocale={fmt}
                  ctaHref={batchHref(b.id)}
                  ctaMode={ctaMode}
                  enrolled={enrolledBatchIds.includes(b.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState size="sm" variant="plain" title={t("detail.noBatchesTitle")} description={t("detail.noBatchesDescription")} />
          )}
        </SectionCard>
      </div>

      <aside aria-label={t("detail.factsLabel")} className="space-y-4 lg:sticky lg:top-20">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            {course.provider.kind === "institution" ? (
              <OrgAvatar name={course.provider.name} src={course.provider.logo?.thumbnailUrl ?? course.provider.logo?.url ?? undefined} size="md" verified />
            ) : null}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("detail.providedBy")}</p>
              <p className="truncate font-heading font-semibold text-navy">{providerName}</p>
              <p className="text-xs text-muted-foreground">{course.provider.kind === "institution" ? t("provider.verifiedInstitution") : t("provider.venkatSaiDescription")}</p>
            </div>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-start gap-2">
              <MonitorSmartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dt className="sr-only">{t("facts.mode")}</dt>
              <dd>{t(`mode.${course.mode}`)}</dd>
            </div>
            <div className="flex items-start gap-2">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dt className="sr-only">{t("facts.duration")}</dt>
              <dd>{duration ?? t("detail.durationNotStated")}</dd>
            </div>
            {course.languageCodes.length ? (
              <div className="flex items-start gap-2">
                <Languages aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">{t("facts.languages")}</dt>
                <dd>{course.languageCodes.map((c) => languageName(c, locale)).join(", ")}</dd>
              </div>
            ) : null}
            <div className="flex items-start gap-2">
              <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dt className="sr-only">{t("facts.fee")}</dt>
              <dd className="space-y-1">
                <FeeText t={t} feeType={course.feeType} feeMinor={course.feeMinor} feeCurrency={course.feeCurrency} locale={fmt} className="font-semibold text-navy" />
                {course.feeNotes ? <p className="text-xs whitespace-pre-line text-muted-foreground">{course.feeNotes}</p> : null}
              </dd>
            </div>
          </dl>
        </div>
        <CertificationNote t={t} type={course.certificationType} accreditationBody={course.accreditationBody} providerName={providerName} />
        <p className="flex gap-2 rounded-lg bg-info-soft p-3 text-xs text-info">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t("detail.noGuarantee")}
        </p>
      </aside>
    </div>
  );
}
