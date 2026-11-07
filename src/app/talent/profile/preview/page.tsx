import { EyeOff, Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FileLink, FilePreview } from "@/components/files";
import { UserAvatar } from "@/components/shared/avatars";
import { Callout } from "@/components/shared/callout";
import { KeyValueList } from "@/components/shared/key-value-list";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { intlLocaleOf } from "@/components/talent/labels";
import { parsePreviewScenario, previewAccess, previewName } from "@/components/talent/profile/employer-preview";
import { getLocale, getT } from "@/i18n/server";
import { sp, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { getCandidateProfileDetail } from "@/modules/candidates/queries";
import { selfActor } from "@/modules/candidates/service";
import { getConsentState } from "@/modules/identity/consent";

import { getAgeGateForCandidate } from "../../onboarding/_lib/state";
import { periodText } from "../_components/bits";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-profile");
  return { title: t("preview.title") };
}

const PATH = "/talent/profile/preview";

/**
 * /talent/profile/preview — "how employers see you": the candidate's own data passed through the
 * same access policy organisations get (masked name, contact and documents until a relationship).
 */
export default async function ProfilePreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect("/talent/onboarding");
  const [t, locale, params, detail, consents] = await Promise.all([
    getT("talent-profile"),
    getLocale(),
    searchParams,
    getCandidateProfileDetail(selfActor(session)),
    getConsentState(session.user.id, ["share_assessment_results"]),
  ]);
  if (!detail) notFound();

  const loc = intlLocaleOf(locale);
  const scenario = parsePreviewScenario(sp(params, "as"));
  const { profile, privacy } = detail;
  // Minors with granted guardian consent may be seen; only those without it are restricted (and never reach this page).
  const access = previewAccess({ visibility: profile.visibility, isOpenToWork: profile.isOpenToWork, privacy, restrictedMinor: false }, scenario);
  const displayName = profile.legalName || detail.account.displayName;
  const shareAssessments = consents.share_assessment_results?.granted === true;

  const tabs = (
    <LinkTabs
      label={t("preview.scenarios")}
      items={[
        { href: PATH, label: t("preview.search"), match: "exact" },
        { href: `${PATH}?as=applied`, label: t("preview.applied"), match: "exact" },
      ]}
      activeHref={scenario === "applied" ? `${PATH}?as=applied` : PATH}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("preview.title")}
        description={t("preview.description")}
        breadcrumbs={[{ label: t("breadcrumb.portal"), href: "/talent" }, { label: t("profile.title"), href: "/talent/profile" }, { label: t("preview.title") }]}
        actions={[{ label: t("preview.manage"), href: "/talent/privacy", variant: "outline" }]}
      />
      {tabs}
      <Callout tone="info" title={t(`preview.${scenario}.title`)}>
        <p>{t(`preview.${scenario}.explain`)}</p>
      </Callout>

      {!access.canView ? (
        <Callout tone="warning" title={t("preview.notVisible")} icon={<EyeOff aria-hidden="true" className="size-5" />} action={{ label: t("preview.manage"), href: "/talent/privacy" }}>
          <p>{t("preview.notVisible.explain")}</p>
        </Callout>
      ) : (
        <article aria-label={t("preview.cardLabel")} className="space-y-6 rounded-2xl border bg-surface-subtle p-4 sm:p-6">
          <SectionCard title={previewName(displayName, access)} headingLevel="h2">
            <div className="flex flex-col gap-4 sm:flex-row">
              {access.photo && detail.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, access-checked file route
                <img src={detail.photo.thumbnailUrl ?? detail.photo.url} alt={t("profile.photoAlt")} className="size-20 rounded-full border object-cover" />
              ) : (
                <UserAvatar name={previewName(displayName, access)} size="lg" />
              )}
              <div className="min-w-0 flex-1">
                <KeyValueList
                  columns={2}
                  emptyText={t("common.notProvided")}
                  items={[
                    { label: t("field.headline"), value: profile.headline, fullWidth: true },
                    { label: t("field.currentJobTitle"), value: profile.currentJobTitle },
                    { label: t("field.currentEmployer"), value: access.currentEmployer ? profile.currentEmployerName : <Hidden t={t} /> },
                    { label: t("section.location"), value: [profile.city, profile.stateRegion, profile.currentCountryCode].filter(Boolean).join(", ") || null },
                    { label: t("field.availability"), value: profile.availability ? t(`enum.availability.${profile.availability}`) : null },
                    {
                      label: t("field.expectedSalary"),
                      value:
                        access.expectedSalary && profile.expectedSalaryMinor !== null && profile.expectedSalaryCurrency && profile.expectedSalaryPeriod ? (
                          <span>
                            <MoneyText amountMinor={Number(profile.expectedSalaryMinor)} currency={profile.expectedSalaryCurrency} locale={loc} /> {t(`salary.per.${profile.expectedSalaryPeriod}`)}
                          </span>
                        ) : null,
                    },
                    { label: t("contact.title"), value: access.contact === "none" ? <Hidden t={t} reason={t("preview.contactHidden")} /> : t("preview.contactOnReveal"), fullWidth: true },
                  ]}
                />
              </div>
            </div>
          </SectionCard>

          {profile.about ? (
            <SectionCard title={t("field.about")} headingLevel="h3">
              <p className="whitespace-pre-line text-sm">{profile.about}</p>
            </SectionCard>
          ) : null}

          <SectionCard title={t("section.skills")} headingLevel="h3">
            {detail.skills.length ? (
              <ul className="flex flex-wrap gap-2">
                {detail.skills.map((s) => (
                  <li key={s.skillId} className="rounded-full border bg-background px-3 py-1 text-sm">
                    {s.name}
                    {s.verified ? <span className="text-success-strong"> · {t("verification.verified")}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("skills.empty")}</p>
            )}
            {shareAssessments ? (
              detail.assessments.filter((a) => a.result === "pass").map((a) => (
                <p key={a.id} className="mt-2 text-sm">
                  {t("assessments.label")}: {a.trade} · {t("assessments.result.pass")}
                </p>
              ))
            ) : detail.assessments.some((a) => a.result === "pass") ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("preview.assessmentsHidden")}</p>
            ) : null}
          </SectionCard>

          <SectionCard title={t("section.experience")} headingLevel="h3">
            {detail.experience.length ? (
              <ul className="space-y-3 text-sm">
                {detail.experience.map((e) => (
                  <li key={e.id}>
                    <p className="font-medium">{e.jobTitle}</p>
                    <p className="text-muted-foreground">
                      {[e.isCurrent && !access.currentEmployer ? t("preview.employerHidden") : e.employerName, periodText(e.startDate, e.endDate, e.isCurrent, t, loc)].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("experience.empty")}</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t("preview.referencesPrivate")}</p>
          </SectionCard>

          <SectionCard title={t("preview.filesTitle")} headingLevel="h3">
            {access.resume && detail.resume ? <FileLink file={detail.resume} /> : <Hidden t={t} reason={access.resume ? t("resume.none") : t("preview.resumeHidden")} />}
            {access.documents === "shareable" ? (
              <ul className="mt-3 space-y-2">
                {detail.documents
                  .filter((d) => d.isShareableWithEmployers && d.verificationStatus !== "rejected")
                  .map((d) => (
                    <li key={d.id} className="text-sm">
                      {d.title || t(`enum.documentType.${d.documentType}`)}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("preview.documentsHidden")}</p>
            )}
            {detail.portfolio.filter((p) => p.isPublic).length ? (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {detail.portfolio
                  .filter((p) => p.isPublic)
                  .flatMap((p) => p.media.slice(0, 2))
                  .map((file) => (
                    <li key={file.id}>
                      <FilePreview file={file} size="sm" />
                    </li>
                  ))}
              </ul>
            ) : null}
          </SectionCard>
          <p className="text-xs text-muted-foreground">{t("preview.footnote")}</p>
        </article>
      )}
    </div>
  );
}

function Hidden({ t, reason }: { t: (key: string) => string; reason?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Lock aria-hidden="true" className="size-3.5" />
      {reason ?? t("preview.hidden")}
    </span>
  );
}
